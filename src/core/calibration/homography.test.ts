/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Ground-Plane Homography Vitest Unit Tests
 * 
 * Verifications:
 *   1. Recovers known synthetic homography across 4-8 points with reprojection RMSE < 1e-6.
 *   2. Degenerate collinear points throw a descriptive, user-friendly error.
 *   3. Missing points (< 4) throw minimum-point requirement error.
 *   4. Guard against w' ~ 0 returns NaN and avoids crash.
 */

import { describe, it, expect } from 'vitest';
import { CalibrationCorrespondence, GroundPlaneHomography } from './homography';

describe('GroundPlaneHomography Engine', () => {
  it('recovers synthetic homography H across 6 floor points with RMSE < 1e-6', () => {
    // 1. Define ground-truth synthetic homography matrix H_true (h33 = 1.0)
    const H_true = [
      [0.0042, 0.0003, -2.15],
      [-0.0001, 0.0068, -1.80],
      [0.00003, 0.0009, 1.0]
    ];

    // 2. Select 6 non-collinear pixel coordinates
    const pixels = [
      { x: 320, y: 640 },
      { x: 960, y: 640 },
      { x: 840, y: 460 },
      { x: 440, y: 460 },
      { x: 640, y: 550 },
      { x: 580, y: 490 }
    ];

    // 3. Project to world metric coordinates via H_true: [X, Y, 1]^T ~ H_true * [u, v, 1]^T
    const correspondences: CalibrationCorrespondence[] = pixels.map((p) => {
      const wPt = GroundPlaneHomography.applyHomography(H_true, p.x, p.y);
      return { pixel: p, world: wPt };
    });

    // 4. Solve homography using fitDLT (Hartley normalization + SVD)
    const H_est = GroundPlaneHomography.fitDLT(correspondences);

    // 5. Compute reprojection RMSE
    const rmse = GroundPlaneHomography.computeRMSE(H_est, correspondences);

    expect(rmse).toBeLessThan(1e-6);

    // Verify matrix entries match H_true within numerical precision
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(H_est[r][c]).toBeCloseTo(H_true[r][c], 5);
      }
    }
  });

  it('detects degenerate collinear inputs and throws a clear error', () => {
    // 3 points lying on a single horizontal line in pixel space (y = 500)
    const degenerateCollinearPairs: CalibrationCorrespondence[] = [
      { pixel: { x: 200, y: 500 }, world: { x: -2.0, y: 2.0 } },
      { pixel: { x: 400, y: 500 }, world: { x: 0.0, y: 2.0 } },
      { pixel: { x: 600, y: 500 }, world: { x: 2.0, y: 2.0 } }, // Collinear triplet with (200,500) and (400,500)
      { pixel: { x: 500, y: 350 }, world: { x: 0.0, y: 6.0 } }
    ];

    expect(() => {
      GroundPlaneHomography.fitDLT(degenerateCollinearPairs);
    }).toThrowError(/Degenerate geometry: Points 1, 2, and 3 are collinear/);
  });

  it('rejects calibration sets with fewer than 4 points', () => {
    const insufficientPairs: CalibrationCorrespondence[] = [
      { pixel: { x: 300, y: 600 }, world: { x: -1.0, y: 2.0 } },
      { pixel: { x: 800, y: 600 }, world: { x: 1.0, y: 2.0 } },
      { pixel: { x: 500, y: 400 }, world: { x: 0.0, y: 5.0 } }
    ];

    expect(() => {
      GroundPlaneHomography.fitDLT(insufficientPairs);
    }).toThrowError(/Minimum 4 floor points required for homography/);
  });

  it('guards against division by w near zero', () => {
    // Artificial H where denominator vanishes for (u=100, v=100)
    const H_zero_denom = [
      [1, 0, 0],
      [0, 1, 0],
      [-0.01, 0, 1.0] // w = -0.01*100 + 1 = 0
    ];

    const pt = GroundPlaneHomography.applyHomography(H_zero_denom, 100, 100);
    expect(Number.isNaN(pt.x)).toBe(true);
    expect(Number.isNaN(pt.y)).toBe(true);
  });
});
