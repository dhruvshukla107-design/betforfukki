/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Ground-Plane Homography Estimation & Calibration
 * Robust DLT, Hartley Normalization, SVD, Collinearity Gating & Video Coordinate Mapping
 * 
 * Math Followed:
 *   - Homography: [X, Y, 1]^T ~ H [u, v, 1]^T, H is 3x3 with H[2][2] = 1 (8 DOF).
 *   - DLT: for each correspondence (u, v) -> (X, Y), add two rows to A:
 *       [-u, -v, -1,  0,  0,  0,  u*X, v*X, X]
 *       [ 0,  0,  0, -u, -v, -1,  u*Y, v*Y, Y]
 *     Solve A h = 0 by SVD; h is the right singular vector of the smallest singular value.
 *   - Hartley Normalization: translate points to centroid 0, scale so mean distance from origin = sqrt(2),
 *     for both pixel and world sets. Denormalize: H = T_world^-1 * H_norm * T_pixel.
 *   - Apply: [x', y', w']^T = H [u, v, 1]^T; X = x'/w', Y = y'/w'. Guard |w'| < 1e-7.
 *   - Reprojection RMSE: sqrt( 1/N * sum( ||H p_i - P_i||^2 ) ).
 *   - Video Pixel Conversion: Maps client mouse click (clientX, clientY) on an
 *     object-fit letterboxed/pillarboxed video element directly to intrinsic video coordinates.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface CalibrationCorrespondence {
  pixel: Point2D; // (u, v) in intrinsic video pixels
  world: Point2D; // (X, Y) in ground-plane metric coordinates (meters)
}

export interface HomographyResult {
  H: number[][]; // 3x3 matrix
  reprojectionRMSE: number;
  inliersCount: number;
  totalPoints: number;
  warnings?: string[];
}

export interface Covariance2D {
  varX: number;
  varY: number;
  covXY: number;
}

export class GroundPlaneHomography {
  public static DEBUG_CALIBRATION = false;

  public static setDebugLogging(enabled: boolean): void {
    GroundPlaneHomography.DEBUG_CALIBRATION = enabled;
  }

  /**
   * Converts a client mouse event on an HTMLVideoElement to intrinsic video coordinates (u, v),
   * correctly resolving CSS letterbox/pillarbox padding from `object-fit: contain` and device scaling.
   */
  public static videoPixelFromMouseEvent(
    clientX: number,
    clientY: number,
    videoElement: HTMLVideoElement
  ): Point2D {
    const rect = videoElement.getBoundingClientRect();
    const videoW = videoElement.videoWidth;
    const videoH = videoElement.videoHeight;

    if (!videoW || !videoH || rect.width <= 0 || rect.height <= 0) {
      throw new Error(
        'Video metadata not ready (videoWidth === 0). Await video "loadedmetadata" before calibration.'
      );
    }

    const videoAspect = videoW / videoH;
    const containerAspect = rect.width / rect.height;

    let renderW = rect.width;
    let renderH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    // Account for object-fit: contain letterboxing/pillarboxing
    if (containerAspect > videoAspect) {
      // Container is wider than video -> pillarboxed (black bars on left & right)
      renderW = rect.height * videoAspect;
      offsetX = (rect.width - renderW) / 2.0;
    } else {
      // Container is taller than video -> letterboxed (black bars on top & bottom)
      renderH = rect.width / videoAspect;
      offsetY = (rect.height - renderH) / 2.0;
    }

    // Relative position inside the active video viewport
    const clickXInside = clientX - rect.left - offsetX;
    const clickYInside = clientY - rect.top - offsetY;

    // Clamped normalized position in [0, 1]
    const normX = Math.max(0, Math.min(1, clickXInside / renderW));
    const normY = Math.max(0, Math.min(1, clickYInside / renderH));

    const u = normX * videoW;
    const v = normY * videoH;

    if (GroundPlaneHomography.DEBUG_CALIBRATION) {
      console.log('[Calibration Debug] Click Mapping:', {
        rawClient: { clientX, clientY },
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        intrinsicVideo: { videoW, videoH },
        letterboxOffset: { offsetX, offsetY },
        renderedDimensions: { renderW, renderH },
        convertedVideoPixel: { u, v }
      });
    }

    return { x: u, y: v };
  }

  /**
   * Validates correspondences:
   * 1. Requires minimum 4 points.
   * 2. Tests for non-NaN numeric validity.
   * 3. Tests every triplet of points for collinearity via cross product triangle area.
   */
  public static validateCorrespondences(pairs: CalibrationCorrespondence[]): void {
    const N = pairs.length;
    if (N < 4) {
      throw new Error(`Minimum 4 floor points required for homography (got ${N}).`);
    }

    // Numeric validity
    for (let i = 0; i < N; i++) {
      const p = pairs[i];
      if (
        !Number.isFinite(p.pixel.x) ||
        !Number.isFinite(p.pixel.y) ||
        !Number.isFinite(p.world.x) ||
        !Number.isFinite(p.world.y)
      ) {
        throw new Error(
          `Invalid coordinate at point ${i + 1}: Values must be finite numbers (got pixel: [${p.pixel.x}, ${p.pixel.y}], world: [${p.world.x}, ${p.world.y}]).`
        );
      }
    }

    // Check collinearity in both pixel and world spaces
    const checkCollinearSet = (pts: Point2D[], spaceName: 'pixel' | 'world', threshold: number) => {
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          for (let k = j + 1; k < N; k++) {
            const p1 = pts[i];
            const p2 = pts[j];
            const p3 = pts[k];

            // 2 * Triangle Area = |x1(y2 - y3) + x2(y3 - y1) + x3(y1 - y2)|
            const doubleArea = Math.abs(
              p1.x * (p2.y - p3.y) +
              p2.x * (p3.y - p1.y) +
              p3.x * (p1.y - p2.y)
            );

            // Scale-invariant check using bounding box diameter
            const maxSpan = Math.max(
              Math.hypot(p1.x - p2.x, p1.y - p2.y),
              Math.hypot(p2.x - p3.x, p2.y - p3.y),
              Math.hypot(p3.x - p1.x, p3.y - p1.y),
              1e-6
            );

            const collinearityFactor = doubleArea / (maxSpan * maxSpan);

            if (collinearityFactor < threshold) {
              throw new Error(
                `Degenerate geometry: Points ${i + 1}, ${j + 1}, and ${k + 1} are collinear in ${spaceName} space (collinearity factor = ${collinearityFactor.toExponential(2)} < ${threshold}). No 3 points may lie on a single line.`
              );
            }
          }
        }
      }
    };

    // Pixel threshold: 1e-4, World threshold: 1e-4
    checkCollinearSet(pairs.map(p => p.pixel), 'pixel', 1e-4);
    checkCollinearSet(pairs.map(p => p.world), 'world', 1e-4);
  }

  /**
   * Computes Hartley 3x3 isotropic normalization transform T:
   * 1. Centroid (cx, cy)
   * 2. Mean distance to centroid d_bar
   * 3. Scale s = sqrt(2) / d_bar
   * 4. T = [[s, 0, -s*cx], [0, s, -s*cy], [0, 0, 1]]
   */
  public static computeHartleyTransform(points: Point2D[]): { T: number[][]; invT: number[][] } {
    const N = points.length;
    if (N === 0) throw new Error('Cannot compute transform of empty points');

    let cx = 0;
    let cy = 0;
    for (const p of points) {
      cx += p.x;
      cy += p.y;
    }
    cx /= N;
    cy /= N;

    let totalDist = 0;
    for (const p of points) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      totalDist += Math.hypot(dx, dy);
    }
    const meanDist = Math.max(1e-7, totalDist / N);
    const s = Math.SQRT2 / meanDist;

    const T = [
      [s, 0, -s * cx],
      [0, s, -s * cy],
      [0, 0, 1]
    ];

    const invT = [
      [1 / s, 0, cx],
      [0, 1 / s, cy],
      [0, 0, 1]
    ];

    return { T, invT };
  }

  public static matMul3x1(M: number[][], v: [number, number, number]): [number, number, number] {
    return [
      M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
      M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
      M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
    ];
  }

  public static matMul3x3(A: number[][], B: number[][]): number[][] {
    const C = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
      }
    }
    return C;
  }

  /**
   * Direct Linear Transformation (DLT) with Hartley Normalization
   * Solves A h = 0 via SVD (Jacobi eigen-decomposition of A^T * A).
   * Denormalizes: H = inv(Twld) * H_norm * Tpix
   */
  public static fitDLT(pairs: CalibrationCorrespondence[]): number[][] {
    // 1. Validation & Collinearity Gate
    GroundPlaneHomography.validateCorrespondences(pairs);

    const N = pairs.length;
    const pixelPts = pairs.map((p) => p.pixel);
    const worldPts = pairs.map((p) => p.world);

    // 2. Hartley Isotropic Normalization
    const { T: Tpix } = GroundPlaneHomography.computeHartleyTransform(pixelPts);
    const { T: Twld, invT: invTwld } = GroundPlaneHomography.computeHartleyTransform(worldPts);

    // 3. Form 2N x 9 matrix A
    // Row 2i:   [-u, -v, -1,  0,  0,  0,  u*X, v*X, X]
    // Row 2i+1: [ 0,  0,  0, -u, -v, -1,  u*Y, v*Y, Y]
    const A: number[][] = [];
    const normPixels: Point2D[] = [];
    const normWorlds: Point2D[] = [];

    for (let i = 0; i < N; i++) {
      const pNorm = GroundPlaneHomography.matMul3x1(Tpix, [pairs[i].pixel.x, pairs[i].pixel.y, 1]);
      const wNorm = GroundPlaneHomography.matMul3x1(Twld, [pairs[i].world.x, pairs[i].world.y, 1]);

      normPixels.push({ x: pNorm[0], y: pNorm[1] });
      normWorlds.push({ x: wNorm[0], y: wNorm[1] });

      const u = pNorm[0];
      const v = pNorm[1];
      const X = wNorm[0];
      const Y = wNorm[1];

      A.push([-u, -v, -1, 0, 0, 0, u * X, v * X, X]);
      A.push([0, 0, 0, -u, -v, -1, u * Y, v * Y, Y]);
    }

    // 4. Compute AtA = A^T * A (9x9)
    const AtA: number[][] = Array.from({ length: 9 }, () => new Array(9).fill(0));
    for (const row of A) {
      for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 9; j++) {
          AtA[i][j] += row[i] * row[j];
        }
      }
    }

    // 5. Solve for right-singular vector h of smallest singular value via SVD
    const { hNormVec, singularValues } = GroundPlaneHomography.solveSvdSmallestVector(AtA);

    const H_norm = [
      [hNormVec[0], hNormVec[1], hNormVec[2]],
      [hNormVec[3], hNormVec[4], hNormVec[5]],
      [hNormVec[6], hNormVec[7], hNormVec[8]]
    ];

    // 6. Denormalize: H = inv(Twld) * H_norm * Tpix
    const H_temp = GroundPlaneHomography.matMul3x3(H_norm, Tpix);
    const H = GroundPlaneHomography.matMul3x3(invTwld, H_temp);

    // 7. Normalize so H[2][2] = 1.0 (8 DOF)
    if (Math.abs(H[2][2]) > 1e-12) {
      const scale = H[2][2];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          H[r][c] /= scale;
        }
      }
    }

    if (GroundPlaneHomography.DEBUG_CALIBRATION) {
      const cond = singularValues[0] / Math.max(1e-12, singularValues[singularValues.length - 1]);
      console.log('[Calibration Debug] DLT SVD Solved:', {
        correspondencesCount: N,
        Tpix,
        Twld,
        invTwld,
        normPixels,
        normWorlds,
        singularValues,
        conditionNumber: cond,
        hNormVec,
        recoveredH: H
      });
    }

    return H;
  }

  /**
   * Robust SVD solver on 9x9 symmetric positive semi-definite AtA via cyclic Jacobi rotations.
   * Extracts all eigenvalues and returns the eigenvector associated with the smallest singular value.
   */
  public static solveSvdSmallestVector(
    AtA: number[][]
  ): { hNormVec: number[]; singularValues: number[] } {
    const n = 9;
    const V: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1.0 : 0.0))
    );
    const A = AtA.map((row) => [...row]);

    // Jacobi rotation iterations (max 100 sweeps)
    for (let iter = 0; iter < 100; iter++) {
      let maxOffDiag = 0;
      let p = 0;
      let q = 1;

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const val = Math.abs(A[i][j]);
          if (val > maxOffDiag) {
            maxOffDiag = val;
            p = i;
            q = j;
          }
        }
      }

      if (maxOffDiag < 1e-15) break;

      const app = A[p][p];
      const aqq = A[q][q];
      const apq = A[p][q];

      const theta = 0.5 * Math.atan2(2.0 * apq, aqq - app);
      const c = Math.cos(theta);
      const s = Math.sin(theta);

      // Rotate matrix A
      for (let i = 0; i < n; i++) {
        if (i !== p && i !== q) {
          const aip = A[i][p];
          const aiq = A[i][q];
          A[i][p] = c * aip - s * aiq;
          A[p][i] = A[i][p];
          A[i][q] = s * aip + c * aiq;
          A[q][i] = A[i][q];
        }
      }
      A[p][p] = c * c * app - 2.0 * s * c * apq + s * s * aqq;
      A[q][q] = s * s * app + 2.0 * s * c * apq + c * c * aqq;
      A[p][q] = 0.0;
      A[q][p] = 0.0;

      // Accumulate eigenvectors in V
      for (let i = 0; i < n; i++) {
        const vip = V[i][p];
        const viq = V[i][q];
        V[i][p] = c * vip - s * viq;
        V[i][q] = s * vip + c * viq;
      }
    }

    // Extract eigenvalues and sort singular values
    const eigenEntries: Array<{ val: number; colIdx: number }> = [];
    for (let i = 0; i < n; i++) {
      eigenEntries.push({ val: Math.max(0, A[i][i]), colIdx: i });
    }
    eigenEntries.sort((a, b) => a.val - b.val); // Ascending order

    const minColIdx = eigenEntries[0].colIdx;
    const hNormVec = V.map((row) => row[minColIdx]);
    const singularValues = eigenEntries.map((e) => Math.sqrt(e.val)).reverse(); // Descending singular values

    return { hNormVec, singularValues };
  }

  /**
   * Refines homography with RANSAC if > 4 correspondences are provided
   */
  public static fitRANSAC(
    pairs: CalibrationCorrespondence[],
    maxIterations: number = 300,
    inlierThresholdMeters: number = 0.25
  ): HomographyResult {
    GroundPlaneHomography.validateCorrespondences(pairs);
    const N = pairs.length;

    let bestH: number[][];
    let inliersCount = N;

    if (N === 4) {
      bestH = GroundPlaneHomography.fitDLT(pairs);
    } else {
      let bestInliers: CalibrationCorrespondence[] = [];
      let maxInliers = 0;
      bestH = GroundPlaneHomography.fitDLT(pairs.slice(0, 4));

      for (let iter = 0; iter < maxIterations; iter++) {
        // Pick 4 random distinct indices
        const indices = new Set<number>();
        while (indices.size < 4) {
          indices.add(Math.floor(Math.random() * N));
        }
        const subset = Array.from(indices).map((i) => pairs[i]);

        try {
          const candH = GroundPlaneHomography.fitDLT(subset);
          const inliers: CalibrationCorrespondence[] = [];

          for (const p of pairs) {
            const pred = GroundPlaneHomography.applyHomography(candH, p.pixel.x, p.pixel.y);
            if (!isNaN(pred.x)) {
              const err = Math.hypot(pred.x - p.world.x, pred.y - p.world.y);
              if (err <= inlierThresholdMeters) {
                inliers.push(p);
              }
            }
          }

          if (inliers.length > maxInliers) {
            maxInliers = inliers.length;
            bestInliers = inliers;
            bestH = candH;
          }
        } catch {
          // Collinear random subset, continue
        }
      }

      if (bestInliers.length >= 4) {
        bestH = GroundPlaneHomography.fitDLT(bestInliers);
        inliersCount = bestInliers.length;
      }
    }

    const rmse = GroundPlaneHomography.computeRMSE(bestH, pairs);
    const warnings: string[] = [];

    // Check RMSE warning threshold
    if (rmse > 0.15) {
      warnings.push(
        `High reprojection RMSE: ${(rmse * 100).toFixed(1)} cm (expected < 15 cm). Check floor measurement points or camera lens distortion.`
      );
    }

    if (GroundPlaneHomography.DEBUG_CALIBRATION) {
      console.log('[Calibration Debug] Final Calibration Result:', {
        H: bestH,
        rmse,
        inliersCount,
        totalPoints: N,
        warnings
      });
    }

    return {
      H: bestH,
      reprojectionRMSE: rmse,
      inliersCount,
      totalPoints: N,
      warnings
    };
  }

  /**
   * Applies Homography:
   *   [x', y', w']^T = H * [u, v, 1]^T
   *   X = x' / w', Y = y' / w'
   * Strictly guards against |w'| < 1e-7.
   */
  public static applyHomography(H: number[][], u: number, v: number): Point2D {
    const Xt = H[0][0] * u + H[0][1] * v + H[0][2];
    const Yt = H[1][0] * u + H[1][1] * v + H[1][2];
    const w  = H[2][0] * u + H[2][1] * v + H[2][2];

    // Guard against w' ~ 0 (point at horizon or behind camera)
    if (!Number.isFinite(w) || Math.abs(w) < 1e-7) {
      if (GroundPlaneHomography.DEBUG_CALIBRATION) {
        console.warn(`[Calibration Debug] Homography denominator near zero: w' = ${w} for (u=${u}, v=${v})`);
      }
      return { x: NaN, y: NaN };
    }

    return { x: Xt / w, y: Yt / w };
  }

  /**
   * Computes Reprojection RMSE in metric units:
   * RMSE = sqrt( 1/N * sum( ||H * p_i - P_i||^2 ) )
   */
  public static computeRMSE(H: number[][], pairs: CalibrationCorrespondence[]): number {
    let sumSqErr = 0;
    let count = 0;

    for (const p of pairs) {
      const pred = GroundPlaneHomography.applyHomography(H, p.pixel.x, p.pixel.y);
      if (Number.isFinite(pred.x) && Number.isFinite(pred.y)) {
        const dx = pred.x - p.world.x;
        const dy = pred.y - p.world.y;
        sumSqErr += dx * dx + dy * dy;
        count++;
      }
    }

    return count > 0 ? Math.sqrt(sumSqErr / count) : Infinity;
  }

  /**
   * Analytical Jacobian J = d(X, Y) / d(u, v) (2x2 matrix)
   */
  public static computeJacobian(H: number[][], u: number, v: number): number[][] {
    const Xt = H[0][0] * u + H[0][1] * v + H[0][2];
    const Yt = H[1][0] * u + H[1][1] * v + H[1][2];
    const w  = H[2][0] * u + H[2][1] * v + H[2][2];

    const w2 = w * w;
    if (w2 < 1e-12) {
      return [
        [0, 0],
        [0, 0]
      ];
    }

    const dX_du = (H[0][0] * w - Xt * H[2][0]) / w2;
    const dX_dv = (H[0][1] * w - Xt * H[2][1]) / w2;
    const dY_du = (H[1][0] * w - Yt * H[2][0]) / w2;
    const dY_dv = (H[1][1] * w - Yt * H[2][1]) / w2;

    return [
      [dX_du, dX_dv],
      [dY_du, dY_dv]
    ];
  }

  /**
   * Propagates pixel measurement noise to 2D world covariance:
   * R_world = J * Sigma_uv * J^T
   */
  public static propagateCovariance(
    H: number[][],
    u: number,
    v: number,
    sigmaU: number = 2.0,
    sigmaV: number = 2.0
  ): Covariance2D {
    const J = GroundPlaneHomography.computeJacobian(H, u, v);
    const sU2 = sigmaU * sigmaU;
    const sV2 = sigmaV * sigmaV;

    const j00 = J[0][0];
    const j01 = J[0][1];
    const j10 = J[1][0];
    const j11 = J[1][1];

    const varX = j00 * j00 * sU2 + j01 * j01 * sV2;
    const varY = j10 * j10 * sU2 + j11 * j11 * sV2;
    const covXY = j00 * j10 * sU2 + j01 * j11 * sV2;

    return { varX, varY, covXY };
  }

  /**
   * Computes the analytic inverse of a 3x3 Homography matrix H^-1.
   * Enables back-projecting world coordinates (e.g. ground distance rings) onto camera pixels.
   */
  public static invertHomography(H: number[][]): number[][] {
    const m00 = H[0][0], m01 = H[0][1], m02 = H[0][2];
    const m10 = H[1][0], m11 = H[1][1], m12 = H[1][2];
    const m20 = H[2][0], m21 = H[2][1], m22 = H[2][2];

    const c00 =  (m11 * m22 - m12 * m21);
    const c01 = -(m10 * m22 - m12 * m20);
    const c02 =  (m10 * m21 - m11 * m20);

    const det = m00 * c00 + m01 * c01 + m02 * c02;
    if (Math.abs(det) < 1e-12) {
      throw new Error('Homography matrix is singular and cannot be inverted.');
    }

    const invDet = 1.0 / det;

    const c10 = -(m01 * m22 - m02 * m21);
    const c11 =  (m00 * m22 - m02 * m20);
    const c12 = -(m00 * m21 - m01 * m20);

    const c20 =  (m01 * m12 - m02 * m11);
    const c21 = -(m00 * m12 - m02 * m10);
    const c22 =  (m00 * m11 - m01 * m10);

    return [
      [c00 * invDet, c10 * invDet, c20 * invDet],
      [c01 * invDet, c11 * invDet, c21 * invDet],
      [c02 * invDet, c12 * invDet, c22 * invDet]
    ];
  }

  /**
   * Projects a ground-plane world point (X, Y) in metres back to intrinsic video pixel coordinates (u, v).
   */
  public static projectWorldToPixel(H_inv: number[][], X: number, Y: number): Point2D {
    const ut = H_inv[0][0] * X + H_inv[0][1] * Y + H_inv[0][2];
    const vt = H_inv[1][0] * X + H_inv[1][1] * Y + H_inv[1][2];
    const wt = H_inv[2][0] * X + H_inv[2][1] * Y + H_inv[2][2];

    if (!Number.isFinite(wt) || Math.abs(wt) < 1e-7) {
      return { x: NaN, y: NaN };
    }

    return { x: ut / wt, y: vt / wt };
  }
}
