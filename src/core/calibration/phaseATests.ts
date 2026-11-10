/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Phase A Comprehensive Unit Test Suite
 * Self-verifying test harness with exact numeric examples for every formula:
 *   1. Intrinsics K from HFOV
 *   2. Radial distortion and iterative undistortion round-trip
 *   3. Ground-plane Homography (DLT + Hartley normalization + SVD)
 *   4. Reprojection RMSE
 *   5. Analytical Jacobian vs Finite Differences
 *   6. World Covariance Propagation (R = J * Sigma_uv * J^T)
 *   7. Camera-height range fallback
 *   8. Height-prior range & analytical error propagation
 *   9. Robust Inverse-depth affine fitting with R^2 rejection
 *   10. Inverse-variance multi-estimator fusion
 *   11. Pairwise Euclidean & Mahalanobis distances
 */

import { CameraModel } from './cameraModel';
import { CalibrationCorrespondence, GroundPlaneHomography } from './homography';
import { DepthFusionEngine } from './depthFusion';

export interface TestResultItem {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details: string;
}

export class PhaseATestRunner {
  public static runAllTests(): TestResultItem[] {
    const results: TestResultItem[] = [];

    // 1. Intrinsics from HFOV
    try {
      const W = 1920;
      const hfovRad = Math.PI / 2.0; // 90 deg -> tan(45 deg) = 1.0
      const fx = CameraModel.fxFromHFOV(W, hfovRad);
      // fx = (1920 / 2) / tan(pi/4) = 960.0
      const passed = Math.abs(fx - 960.0) < 1e-7;
      results.push({
        id: 'test-hfov',
        name: '1. Camera Intrinsics fx from HFOV: fx = (W/2)/tan(HFOV/2)',
        passed,
        expected: '960.0000 px',
        actual: `${fx.toFixed(4)} px`,
        details: 'Evaluated W = 1920, HFOV = 90 deg. Exact analytical solution: 960.0 px.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-hfov',
        name: '1. Camera Intrinsics fx from HFOV',
        passed: false,
        expected: '960.0000 px',
        actual: String(e),
        details: 'Exception thrown'
      });
    }

    // 2. Radial Distortion & Undistortion Round-Trip
    try {
      const cam = new CameraModel({
        fx: 1000,
        fy: 1000,
        cx: 640,
        cy: 360,
        k1: -0.12,
        k2: 0.04
      });

      const origU = 940;
      const origV = 560;

      // Normalize & distort
      const x = (origU - 640) / 1000.0; // 0.30
      const y = (origV - 360) / 1000.0; // 0.20
      const r2 = x * x + y * y;         // 0.13
      const rad = 1.0 + cam.K.k1 * r2 + cam.K.k2 * r2 * r2;
      const distU = (x * rad) * cam.K.fx + cam.K.cx;
      const distV = (y * rad) * cam.K.fy + cam.K.cy;

      const [undistU, undistV] = cam.undistortPixel(distU, distV);
      const err = Math.hypot(undistU - origU, undistV - origV);
      const passed = err < 0.05; // sub-tenth-pixel precision

      results.push({
        id: 'test-undistort',
        name: '2. Radial Distortion Inversion: Newton-Raphson Undistortion',
        passed,
        expected: `(${origU.toFixed(2)}, ${origV.toFixed(2)})`,
        actual: `(${undistU.toFixed(2)}, ${undistV.toFixed(2)}) [err=${err.toFixed(4)}px]`,
        details: `Distorted point (${distU.toFixed(1)}, ${distV.toFixed(1)}) accurately inverted to original within ${err.toFixed(4)} px.`
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-undistort',
        name: '2. Radial Distortion Inversion',
        passed: false,
        expected: 'Valid inverse',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 3. Ground-plane Homography (DLT + Hartley Normalization + SVD)
    try {
      // Known synthetic ground-plane mapping
      // Real ground points (square 4m x 4m floor tile)
      const syntheticPairs: CalibrationCorrespondence[] = [
        { pixel: { x: 380, y: 640 }, world: { x: -2.0, y: 2.0 } },
        { pixel: { x: 900, y: 640 }, world: { x: 2.0, y: 2.0 } },
        { pixel: { x: 800, y: 440 }, world: { x: 2.0, y: 6.0 } },
        { pixel: { x: 480, y: 440 }, world: { x: -2.0, y: 6.0 } },
        { pixel: { x: 640, y: 520 }, world: { x: 0.0, y: 4.0 } }
      ];

      const H = GroundPlaneHomography.fitDLT(syntheticPairs);
      const rmse = GroundPlaneHomography.computeRMSE(H, syntheticPairs);
      const passed = rmse < 0.02; // Under 2 cm RMSE on exact geometry

      results.push({
        id: 'test-homography-dlt',
        name: '3. Ground Homography: DLT + Hartley Normalization + SVD',
        passed,
        expected: 'Reprojection RMSE < 0.0200 m',
        actual: `RMSE = ${rmse.toFixed(4)} m`,
        details: `Successfully solved 2Nx9 DLT system via SVD across 5 floor correspondences with ${rmse < 0.01 ? 'millimeter' : 'centimeter'} fidelity.`
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-homography-dlt',
        name: '3. Ground Homography: DLT',
        passed: false,
        expected: 'RMSE < 0.02m',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 4. Analytical Jacobian vs Finite Differences
    try {
      // Synthetic calibrated H
      const H = [
        [0.0082, 0.0003, -4.5],
        [-0.0002, 0.0115, -3.2],
        [0.00004, 0.0018, 1.0]
      ];
      const u = 640;
      const v = 500;

      const J_analytical = GroundPlaneHomography.computeJacobian(H, u, v);

      // Finite difference approximation with eps = 1e-4
      const eps = 1e-4;
      const p_u_plus = GroundPlaneHomography.applyHomography(H, u + eps, v);
      const p_u_minus = GroundPlaneHomography.applyHomography(H, u - eps, v);
      const p_v_plus = GroundPlaneHomography.applyHomography(H, u, v + eps);
      const p_v_minus = GroundPlaneHomography.applyHomography(H, u, v - eps);

      const dX_du_num = (p_u_plus.x - p_u_minus.x) / (2 * eps);
      const dX_dv_num = (p_v_plus.x - p_v_minus.x) / (2 * eps);
      const dY_du_num = (p_u_plus.y - p_u_minus.y) / (2 * eps);
      const dY_dv_num = (p_v_plus.y - p_v_minus.y) / (2 * eps);

      const maxDiff = Math.max(
        Math.abs(J_analytical[0][0] - dX_du_num),
        Math.abs(J_analytical[0][1] - dX_dv_num),
        Math.abs(J_analytical[1][0] - dY_du_num),
        Math.abs(J_analytical[1][1] - dY_dv_num)
      );

      const passed = maxDiff < 1e-5;
      results.push({
        id: 'test-jacobian',
        name: '4. Homography Jacobian J = d(X,Y)/d(u,v) Analytical Verification',
        passed,
        expected: 'Max difference vs finite difference < 1e-5',
        actual: `Max diff = ${maxDiff.toExponential(4)}`,
        details: `Exact quotient rule derivative verified against central difference numerical differentiation.`
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-jacobian',
        name: '4. Homography Jacobian J',
        passed: false,
        expected: 'Max diff < 1e-5',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 5. World Covariance Propagation
    try {
      const H = [
        [0.0082, 0.0003, -4.5],
        [-0.0002, 0.0115, -3.2],
        [0.00004, 0.0018, 1.0]
      ];
      const cov = GroundPlaneHomography.propagateCovariance(H, 640, 500, 2.0, 2.0);
      const isPositiveDefinite = cov.varX > 0 && cov.varY > 0 && cov.varX * cov.varY - cov.covXY * cov.covXY > 0;

      results.push({
        id: 'test-covariance',
        name: '5. World Covariance Propagation R = J * Sigma_uv * J^T',
        passed: isPositiveDefinite,
        expected: 'Positive definite 2x2 covariance (det > 0, varX > 0, varY > 0)',
        actual: `varX=${cov.varX.toFixed(5)}, varY=${cov.varY.toFixed(5)}, covXY=${cov.covXY.toFixed(5)}`,
        details: `Propagated 2.0 px measurement uncertainty into metric ground uncertainty tensor.`
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-covariance',
        name: '5. World Covariance Propagation',
        passed: false,
        expected: 'Valid Covariance',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 6. Camera-Height Fallback Method
    try {
      const cam = new CameraModel({ fx: 850, fy: 850, cx: 640, cy: 360 });
      const hc = 2.8; // 2.8 meters height
      const pitch = (30.0 * Math.PI) / 180.0; // 30 deg down
      // When v = cy = 360, angle from optical axis = 0 -> alpha = 30 deg
      // Expected D = 2.8 / tan(30 deg) = 2.8 / (1/sqrt(3)) = 2.8 * sqrt(3) ~= 4.84974 m
      const { distanceM } = cam.estimateDistanceCameraHeight(360, hc, pitch);
      const expectedD = 2.8 * Math.sqrt(3.0);
      const diff = Math.abs(distanceM - expectedD);
      const passed = diff < 1e-4;

      results.push({
        id: 'test-cam-height',
        name: '6. Camera-Height Range Fallback: D = h_c / tan(alpha)',
        passed,
        expected: `${expectedD.toFixed(4)} m`,
        actual: `${distanceM.toFixed(4)} m`,
        details: `h_c = 2.8m, pitch = 30 deg, v = cy (on optical axis). Exact match with trigonometric baseline.`
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-cam-height',
        name: '6. Camera-Height Range Fallback',
        passed: false,
        expected: '4.8497 m',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 7. Height-Prior Range & Analytical Error Propagation
    try {
      const cam = new CameraModel({ fx: 850, fy: 850, cx: 640, cy: 360 });
      // Adult prior: H = 1.70m, sigma_H = 0.10m
      // Box height: 200px, sigma_h = 3px
      // Z = 850 * 1.70 / 200 = 7.225 m
      // sigma_Z / Z = sqrt( (0.10 / 1.70)^2 + (3 / 200)^2 )
      // relVarH = (0.10/1.70)^2 = 0.0034602
      // relVarHpx = (3/200)^2   = 0.0002250
      // sqrt(sum) = sqrt(0.0036852) ~= 0.060706
      // sigma_Z = 7.225 * 0.060706 ~= 0.4386 m
      const { Z, sigmaZ } = cam.estimateDistanceHeightPrior(200, '20-59', 3.0);
      const expectedZ = 7.225;
      const expectedSigmaZ = expectedZ * Math.sqrt(Math.pow(0.10 / 1.70, 2) + Math.pow(3.0 / 200.0, 2));

      const passed = Math.abs(Z - expectedZ) < 1e-4 && Math.abs(sigmaZ - expectedSigmaZ) < 1e-4;

      results.push({
        id: 'test-height-prior',
        name: '7. Height-Prior Distance & Error Propagation: Z = fy*H/h_px',
        passed,
        expected: `Z = ${expectedZ.toFixed(3)} m, sigma_Z = ${expectedSigmaZ.toFixed(4)} m`,
        actual: `Z = ${Z.toFixed(3)} m, sigma_Z = ${sigmaZ.toFixed(4)} m`,
        details: `Evaluated adult prior with 200 px bounding box. Relative error is ${(sigmaZ/Z * 100).toFixed(1)}%.`
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-height-prior',
        name: '7. Height-Prior Distance',
        passed: false,
        expected: '7.225m, 0.439m',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 8. Robust Inverse-Depth Affine Fit with R^2 Rejection
    try {
      // 1 / Z = a * d_rel + b. Let a = 0.15, b = 0.05
      const cleanAnchors = [
        { dRel: 0.5, zMetric: 1.0 / (0.15 * 0.5 + 0.05) }, // Z = 8.0 m
        { dRel: 1.0, zMetric: 1.0 / (0.15 * 1.0 + 0.05) }, // Z = 5.0 m
        { dRel: 2.0, zMetric: 1.0 / (0.15 * 2.0 + 0.05) }, // Z = 2.857 m
        { dRel: 3.0, zMetric: 1.0 / (0.15 * 3.0 + 0.05) }  // Z = 2.0 m
      ];
      const fitClean = DepthFusionEngine.fitInverseDepthAffine(cleanAnchors);

      // Degenerate random noise
      const noisyAnchors = [
        { dRel: 0.5, zMetric: 12.0 },
        { dRel: 1.0, zMetric: 2.0 },
        { dRel: 2.0, zMetric: 14.0 },
        { dRel: 3.0, zMetric: 1.0 }
      ];
      const fitNoisy = DepthFusionEngine.fitInverseDepthAffine(noisyAnchors);

      const passed = fitClean.isAccepted && fitClean.rSquared > 0.98 && !fitNoisy.isAccepted;

      results.push({
        id: 'test-inverse-depth',
        name: '8. Monocular Inverse-Depth Alignment 1/Z = a*d_rel + b (R^2 >= 0.8 Gate)',
        passed,
        expected: 'Clean R^2 >= 0.8 (accepted) AND Noisy rejected',
        actual: `Clean R^2 = ${fitClean.rSquared.toFixed(4)} (accepted=${fitClean.isAccepted}), Noisy R^2 = ${fitNoisy.rSquared.toFixed(4)} (accepted=${fitNoisy.isAccepted})`,
        details: `Successfully gates poor monocular calibrations when R^2 drops below strict 0.80 boundary.`
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-inverse-depth',
        name: '8. Monocular Inverse-Depth Alignment',
        passed: false,
        expected: 'Clean accepted, noisy rejected',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 9. Inverse-Variance Multi-Estimator Fusion
    try {
      // Estimate 1: Homography: Z = 5.0m, sigma = 0.5m  (weight = 1/0.25 = 4)
      // Estimate 2: Height-prior: Z = 5.6m, sigma = 1.0m (weight = 1/1.0 = 1)
      // precisionSum = 4 + 1 = 5
      // Z* = (5.0 * 4 + 5.6 * 1) / 5 = 25.6 / 5 = 5.12 m
      // sigma*^2 = 1 / 5 = 0.20 -> sigma* = sqrt(0.20) ~= 0.44721 m
      const estimates = [
        { sourceName: 'Homography Ground Foot', Z: 5.0, sigmaZ: 0.5 },
        { sourceName: 'Height-Prior Adult', Z: 5.6, sigmaZ: 1.0 }
      ];
      const fused = DepthFusionEngine.fuseEstimates(estimates);

      const passed =
        Math.abs(fused.fusedZ - 5.12) < 1e-4 &&
        Math.abs(fused.fusedSigmaZ - Math.sqrt(0.20)) < 1e-4;

      results.push({
        id: 'test-fusion',
        name: '9. Multi-Estimator Fusion: Inverse-Variance Optimal Weighting',
        passed,
        expected: 'Z* = 5.1200 m, sigma* = 0.4472 m',
        actual: `Z* = ${fused.fusedZ.toFixed(4)} m, sigma* = ${fused.fusedSigmaZ.toFixed(4)} m`,
        details: `Weights: Homography = ${(fused.weights[0]*100).toFixed(0)}%, Height-prior = ${(fused.weights[1]*100).toFixed(0)}%.`
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-fusion',
        name: '9. Multi-Estimator Fusion',
        passed: false,
        expected: '5.1200m, 0.4472m',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 10. Pairwise Mahalanobis Distance: d_M^2 = (p1 - p2)^T (P1 + P2)^-1 (p1 - p2)
    try {
      const p1 = { x: 0.0, y: 0.0 };
      const p2 = { x: 3.0, y: 4.0 }; // Euclidean dist = 5.0 m
      // Covariances isotropic: P1 = [[1, 0], [0, 1]], P2 = [[3, 0], [0, 3]]
      // P1 + P2 = [[4, 0], [0, 4]] -> (P1+P2)^-1 = [[0.25, 0], [0, 0.25]]
      // d_M^2 = 3^2 * 0.25 + 4^2 * 0.25 = 9*0.25 + 16*0.25 = 25 * 0.25 = 6.25
      // d_M = 2.5
      const cov1 = { varX: 1.0, varY: 1.0, covXY: 0.0 };
      const cov2 = { varX: 3.0, varY: 3.0, covXY: 0.0 };

      const { dMSquared, dM } = DepthFusionEngine.mahalanobisDistanceSq(p1, p2, cov1, cov2);

      const passed = Math.abs(dMSquared - 6.25) < 1e-4 && Math.abs(dM - 2.5) < 1e-4;

      results.push({
        id: 'test-mahalanobis',
        name: '10. Pairwise Mahalanobis Distance: d_M^2 = Dp^T (P1 + P2)^-1 Dp',
        passed,
        expected: 'd_M^2 = 6.2500, d_M = 2.5000',
        actual: `d_M^2 = ${dMSquared.toFixed(4)}, d_M = ${dM.toFixed(4)}`,
        details: `Validated against analytical isotropic expansion with Euclidean baseline ||Dp|| = 5.0m.`
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-mahalanobis',
        name: '10. Pairwise Mahalanobis Distance',
        passed: false,
        expected: '6.25, 2.50',
        actual: String(e),
        details: 'Exception'
      });
    }

    return results;
  }
}
