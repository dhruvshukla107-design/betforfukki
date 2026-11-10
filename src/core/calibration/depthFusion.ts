/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Depth Calibration & Multi-Estimator Fusion Engine
 * 
 * Exact Math:
 *   - Monocular Inverse-Depth Fit: 1/Z = a * d_rel + b (Huber / RANSAC, reject R^2 < 0.8)
 *   - Inverse-Variance Fusion: Z* = (sum Z_i / sigma_i^2) / (sum 1 / sigma_i^2)
 *                             sigma*^2 = 1 / (sum 1 / sigma_i^2)
 *   - Pairwise Euclidean distance: d_ij = ||p_i - p_j||_2
 *   - Pairwise Mahalanobis distance: d_M^2 = (p_i - p_j)^T (P_i + P_j)^-1 (p_i - p_j)
 */

import { Covariance2D, Point2D } from './homography';

export interface DepthEstimate {
  sourceName: string;
  Z: number;       // Distance in meters
  sigmaZ: number;  // Standard deviation in meters
}

export interface FusedDepthResult {
  fusedZ: number;
  fusedSigmaZ: number;
  weights: number[];
  estimatesUsed: DepthEstimate[];
}

export interface InverseDepthFitResult {
  a: number;
  b: number;
  rSquared: number;
  isAccepted: boolean;
}

export class DepthFusionEngine {
  /**
   * Fits inverse-depth affine mapping:
   *   1 / Z = a * d_rel + b
   * using robust linear regression with Huber loss weighting.
   * Rejects fits with R^2 < 0.8.
   */
  public static fitInverseDepthAffine(
    anchors: Array<{ dRel: number; zMetric: number }>
  ): InverseDepthFitResult {
    const N = anchors.length;
    if (N < 3) {
      return { a: 0, b: 0, rSquared: 0, isAccepted: false };
    }

    const x = anchors.map((a) => a.dRel);
    const y = anchors.map((a) => 1.0 / Math.max(0.1, a.zMetric));

    let xMean = 0;
    let yMean = 0;
    for (let i = 0; i < N; i++) {
      xMean += x[i];
      yMean += y[i];
    }
    xMean /= N;
    yMean /= N;

    // Ordinary least squares base line
    let ssXY = 0;
    let ssXX = 0;
    let ssYY = 0;

    for (let i = 0; i < N; i++) {
      const dx = x[i] - xMean;
      const dy = y[i] - yMean;
      ssXY += dx * dy;
      ssXX += dx * dx;
      ssYY += dy * dy;
    }

    if (ssXX < 1e-9) {
      return { a: 0, b: 0, rSquared: 0, isAccepted: false };
    }

    let a = ssXY / ssXX;
    let b = yMean - a * xMean;

    // Huber iterative re-weighted refinement (delta = 0.05 in inverse depth units)
    const delta = 0.05;
    for (let iter = 0; iter < 5; iter++) {
      let wSum = 0;
      let wXSum = 0;
      let wYSum = 0;
      let wXXSum = 0;
      let wXYSum = 0;

      for (let i = 0; i < N; i++) {
        const residual = Math.abs(y[i] - (a * x[i] + b));
        const weight = residual <= delta ? 1.0 : delta / residual;

        wSum += weight;
        wXSum += weight * x[i];
        wYSum += weight * y[i];
        wXXSum += weight * x[i] * x[i];
        wXYSum += weight * x[i] * y[i];
      }

      const denom = wSum * wXXSum - wXSum * wXSum;
      if (Math.abs(denom) > 1e-9) {
        a = (wSum * wXYSum - wXSum * wYSum) / denom;
        b = (wXXSum * wYSum - wXSum * wXYSum) / denom;
      }
    }

    // Compute R^2
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < N; i++) {
      const yPred = a * x[i] + b;
      const res = y[i] - yPred;
      ssRes += res * res;
      const tot = y[i] - yMean;
      ssTot += tot * tot;
    }

    const rSquared = ssTot > 1e-9 ? Math.max(0, 1.0 - ssRes / ssTot) : 0;
    const isAccepted = rSquared >= 0.80;

    return { a, b, rSquared, isAccepted };
  }

  /**
   * Multi-Estimator Inverse-Variance Weighting:
   * Z* = (sum Z_i / sigma_i^2) / (sum 1 / sigma_i^2)
   * sigma*^2 = 1 / (sum 1 / sigma_i^2)
   */
  public static fuseEstimates(estimates: DepthEstimate[]): FusedDepthResult {
    const valid = estimates.filter((e) => e.sigmaZ > 0 && Number.isFinite(e.Z) && e.Z > 0);
    if (valid.length === 0) {
      return { fusedZ: 0, fusedSigmaZ: Infinity, weights: [], estimatesUsed: [] };
    }

    let precisionSum = 0;
    let weightedZSum = 0;

    for (const est of valid) {
      const prec = 1.0 / (est.sigmaZ * est.sigmaZ);
      precisionSum += prec;
      weightedZSum += est.Z * prec;
    }

    const fusedZ = weightedZSum / precisionSum;
    const fusedSigmaZ = Math.sqrt(1.0 / precisionSum);

    const weights = valid.map((est) => 1.0 / (est.sigmaZ * est.sigmaZ * precisionSum));

    return {
      fusedZ,
      fusedSigmaZ,
      weights,
      estimatesUsed: valid
    };
  }

  /**
   * Pairwise Euclidean ground distance:
   * d_ij = ||p_i - p_j||_2 = sqrt((x_i - x_j)^2 + (y_i - y_j)^2)
   */
  public static euclideanDistance(p1: Point2D, p2: Point2D): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Pairwise Mahalanobis distance with covariance sum P = P_i + P_j:
   * d_M^2 = (p_i - p_j)^T (P_i + P_j)^-1 (p_i - p_j)
   * 
   * Analytical 2x2 matrix inversion:
   * P = [[a, b], [b, c]], det = a*c - b^2
   * P^-1 = (1 / det) * [[c, -b], [-b, a]]
   */
  public static mahalanobisDistanceSq(
    p1: Point2D,
    p2: Point2D,
    cov1: Covariance2D,
    cov2: Covariance2D
  ): { dMSquared: number; dM: number } {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;

    // P = P_i + P_j
    const a = cov1.varX + cov2.varX;
    const b = cov1.covXY + cov2.covXY;
    const c = cov1.varY + cov2.varY;

    const det = a * c - b * b;
    if (Math.abs(det) < 1e-12) {
      // Degenerate covariance: fallback to normalized variance
      const dMSq = (dx * dx) / Math.max(1e-5, a) + (dy * dy) / Math.max(1e-5, c);
      return { dMSquared: dMSq, dM: Math.sqrt(Math.max(0, dMSq)) };
    }

    const invDet = 1.0 / det;
    const invA = c * invDet;
    const invB = -b * invDet;
    const invC = a * invDet;

    // (p1 - p2)^T * P^-1 * (p1 - p2)
    const dMSquared = dx * (invA * dx + invB * dy) + dy * (invB * dx + invC * dy);

    return {
      dMSquared: Math.max(0, dMSquared),
      dM: Math.sqrt(Math.max(0, dMSquared))
    };
  }
}
