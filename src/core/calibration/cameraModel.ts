/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Camera Model, Intrinsics & Lens Distortion
 * 
 * Exact Math:
 *   - Intrinsics: K = [[fx, 0, cx], [0, fy, cy], [0, 0, 1]]
 *   - From HFOV: fx = (W / 2) / tan(HFOV / 2), fy = fx (square pixels assumed)
 *   - Distortion: x_d = x * (1 + k1*r^2 + k2*r^4), r^2 = x^2 + y^2
 *   - Undistortion: Newton-Raphson / fixed-point inversion to resolve x, y from x_d, y_d
 *   - Camera-height range: alpha = theta + atan((v - cy) / fy), D = h_c / tan(alpha)
 *   - Height-prior range: Z = fy * H_real / h_px, sigma_Z/Z = sqrt((sigma_H/H)^2 + (sigma_h/h_px)^2)
 */

import { AgeBand } from '../../types/spatial';

export interface CameraIntrinsicsK {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
  k1: number; // Radial distortion coefficient 1
  k2: number; // Radial distortion coefficient 2
}

export interface HeightPriorSpec {
  meanHeightM: number;
  stdHeightM: number;
}

export const BAND_SPECIFIC_HEIGHT_PRIORS: Record<AgeBand, HeightPriorSpec> = {
  '0-12': { meanHeightM: 1.15, stdHeightM: 0.15 },
  '13-19': { meanHeightM: 1.60, stdHeightM: 0.12 },
  '20-59': { meanHeightM: 1.70, stdHeightM: 0.10 },
  '60+': { meanHeightM: 1.65, stdHeightM: 0.10 },
  'Unknown': { meanHeightM: 1.70, stdHeightM: 0.12 }
};

export class CameraModel {
  public K: CameraIntrinsicsK;

  constructor(intrinsics?: Partial<CameraIntrinsicsK>) {
    this.K = {
      fx: intrinsics?.fx ?? 850,
      fy: intrinsics?.fy ?? 850,
      cx: intrinsics?.cx ?? 640,
      cy: intrinsics?.cy ?? 360,
      width: intrinsics?.width ?? 1280,
      height: intrinsics?.height ?? 720,
      k1: intrinsics?.k1 ?? 0,
      k2: intrinsics?.k2 ?? 0
    };
  }

  /**
   * Derive focal length fx from image width W and Horizontal Field of View (HFOV in radians)
   * Formula: fx = (W / 2) / tan(HFOV / 2)
   */
  public static fxFromHFOV(width: number, hfovRad: number): number {
    if (hfovRad <= 0 || hfovRad >= Math.PI) {
      throw new Error(`Invalid HFOV: ${hfovRad}. Must be in (0, pi)`);
    }
    return (width / 2.0) / Math.tan(hfovRad / 2.0);
  }

  /**
   * Initialize intrinsics from HFOV (in degrees) and image dimensions
   */
  public static fromHFOV(
    width: number,
    height: number,
    hfovDeg: number,
    k1: number = 0,
    k2: number = 0
  ): CameraModel {
    const hfovRad = (hfovDeg * Math.PI) / 180.0;
    const fx = CameraModel.fxFromHFOV(width, hfovRad);
    return new CameraModel({
      fx,
      fy: fx,
      cx: width / 2.0,
      cy: height / 2.0,
      width,
      height,
      k1,
      k2
    });
  }

  /**
   * Projects 3D camera point [X, Y, Z] to distorted 2D pixel coordinates [u_d, v_d]
   */
  public project(X: number, Y: number, Z: number): [number, number] {
    if (Z <= 0) return [NaN, NaN];
    // Normalized coordinates
    const x = X / Z;
    const y = Y / Z;
    const r2 = x * x + y * y;
    const radial = 1.0 + this.K.k1 * r2 + this.K.k2 * r2 * r2;

    const x_d = x * radial;
    const y_d = y * radial;

    const u = this.K.fx * x_d + this.K.cx;
    const v = this.K.fy * y_d + this.K.cy;
    return [u, v];
  }

  /**
   * Undistorts pixel coordinate [u_d, v_d] back to undistorted pixel [u_u, v_u]
   * Inverts: x_d = x * (1 + k1*r^2 + k2*r^4) via iterative fixed-point Newton-Raphson
   */
  public undistortPixel(u_d: number, v_d: number): [number, number] {
    if (this.K.k1 === 0 && this.K.k2 === 0) {
      return [u_d, v_d];
    }

    // Convert pixel to normalized distorted coordinates
    const x_d = (u_d - this.K.cx) / this.K.fx;
    const y_d = (v_d - this.K.cy) / this.K.fy;

    let x = x_d;
    let y = y_d;

    // 5 iterations of Newton-Raphson / fixed-point inversion
    for (let iter = 0; iter < 5; iter++) {
      const r2 = x * x + y * y;
      const radial = 1.0 + this.K.k1 * r2 + this.K.k2 * r2 * r2;
      if (radial === 0) break;
      x = x_d / radial;
      y = y_d / radial;
    }

    // Convert back to pixel space
    const u_u = x * this.K.fx + this.K.cx;
    const v_u = y * this.K.fy + this.K.cy;
    return [u_u, v_u];
  }

  /**
   * Undistorts bounding box foot point (bottom-centre of detection)
   * Foot point: (u_c = x + w/2, v_b = y + h)
   */
  public getUndistortedFootPoint(box: [number, number, number, number]): [number, number] {
    const [x, y, w, h] = box;
    const u_c = x + w / 2.0;
    const v_b = y + h;
    return this.undistortPixel(u_c, v_b);
  }

  /**
   * Camera-Height Fallback Method:
   * Given camera height h_c (metres), camera pitch theta (radians down from horizon):
   *   alpha = theta + atan((v - cy) / fy)
   *   Ground distance D = h_c / tan(alpha)
   */
  public estimateDistanceCameraHeight(
    vPixelUndistorted: number,
    cameraHeightM: number,
    pitchRad: number
  ): { distanceM: number; alphaRad: number } {
    const angleFromOpticalAxis = Math.atan((vPixelUndistorted - this.K.cy) / this.K.fy);
    const alpha = pitchRad + angleFromOpticalAxis;

    if (alpha <= 0.01) {
      // Ray is parallel or above horizon
      return { distanceM: Infinity, alphaRad: alpha };
    }

    const D = cameraHeightM / Math.tan(alpha);
    return { distanceM: Math.max(0.1, D), alphaRad: alpha };
  }

  /**
   * Height-Prior Range Estimation:
   * For a standing person with known real-world height prior H_real ~ N(mean, std^2):
   *   Z = fy * H_real / h_px
   * Error propagation:
   *   sigma_Z = Z * sqrt((sigma_H / H)^2 + (sigma_h / h_px)^2)
   */
  public estimateDistanceHeightPrior(
    boxHeightPx: number,
    ageBand: AgeBand = '20-59',
    sigmaBoxHeightPx: number = 3.0 // 3px bounding box segmentation noise
  ): { Z: number; sigmaZ: number } {
    const prior = BAND_SPECIFIC_HEIGHT_PRIORS[ageBand] || BAND_SPECIFIC_HEIGHT_PRIORS['20-59'];
    const h_px = Math.max(5.0, boxHeightPx);

    // Z = fy * H_real / h_px
    const Z = (this.K.fy * prior.meanHeightM) / h_px;

    // Error propagation: sigma_Z / Z = sqrt((sigma_H / H)^2 + (sigma_h / h_px)^2)
    const relVarH = Math.pow(prior.stdHeightM / prior.meanHeightM, 2);
    const relVarHpx = Math.pow(sigmaBoxHeightPx / h_px, 2);
    const sigmaZ = Z * Math.sqrt(relVarH + relVarHpx);

    return { Z, sigmaZ };
  }
}
