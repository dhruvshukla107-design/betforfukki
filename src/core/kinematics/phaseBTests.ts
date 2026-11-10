/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Phase B Kinematics & Tracking Unit Test Suite
 * Self-verifying test suite with known numeric worked examples for:
 *   1. Variable dt State Prediction (F and Q)
 *   2. Joseph Form Covariance Numerical Stability & Symmetry
 *   3. Chi-Square Innovation Gating (d_M^2 < 9.21 for 2 DOF 99%)
 *   4. Exact Closing Speed: v_c = - (Dp . Dv) / ||Dp||
 *   5. Time-to-Contact: TTC = ||Dp|| / v_c
 *   6. Closest Point of Approach: t_cpa and d_cpa
 *   7. Speed Classification Bands & Maximum Speed Clamping (12 m/s)
 *   8. Trajectory Forecast & Monte Carlo Proximity Probability
 */

import { WorldKalmanFilter } from './worldKalmanTracker';
import { InteractionGeometryEngine } from './interactionGeometry';
import { Covariance2D } from '../calibration/homography';
import { TestResultItem } from '../calibration/phaseATests';

export class PhaseBTestRunner {
  public static runAllTests(): TestResultItem[] {
    const results: TestResultItem[] = [];

    // 1. Variable dt State Prediction (F and Q)
    try {
      const kf = new WorldKalmanFilter(101, 2.0, 3.0, 10.0, 0.2);
      kf.x[2] = 1.5;  // Vx = 1.5 m/s
      kf.x[3] = -2.0; // Vy = -2.0 m/s
      const dt = 0.1; // 100 ms step
      kf.predict(10.0 + dt, 1.8);

      const expectedX = 2.0 + 1.5 * 0.1; // 2.15 m
      const expectedY = 3.0 - 2.0 * 0.1; // 2.80 m
      const err = Math.hypot(kf.x[0] - expectedX, kf.x[1] - expectedY);
      const passed = err < 1e-5;

      results.push({
        id: 'test-kalman-predict',
        name: '1. State Prediction with Variable dt: x_{k|k-1} = F * x_{k-1}',
        passed,
        expected: `X=${expectedX.toFixed(3)}m, Y=${expectedY.toFixed(3)}m`,
        actual: `X=${kf.x[0].toFixed(3)}m, Y=${kf.x[1].toFixed(3)}m [err=${err.toExponential(2)}]`,
        details: 'Evaluated F = [[I, dt*I], [0, I]] with dt = 0.1s. Linear kinematic integration verified.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-kalman-predict',
        name: '1. State Prediction with Variable dt',
        passed: false,
        expected: 'Valid state',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 2. Joseph Form Covariance Numerical Stability & Symmetry
    try {
      const kf = new WorldKalmanFilter(102, 0.0, 0.0, 1.0, 0.5);
      const measCov: Covariance2D = { varX: 0.1, varY: 0.2, covXY: 0.03 };
      kf.update(0.5, 0.5, measCov);

      // Verify symmetry P_ij = P_ji
      let maxAsymm = 0;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const diff = Math.abs(kf.P[i][j] - kf.P[j][i]);
          if (diff > maxAsymm) maxAsymm = diff;
        }
      }

      // Verify positive variances on diagonal
      const allPosDiag = kf.P[0][0] > 0 && kf.P[1][1] > 0 && kf.P[2][2] > 0 && kf.P[3][3] > 0;
      const passed = maxAsymm < 1e-8 && allPosDiag;

      results.push({
        id: 'test-joseph-form',
        name: '2. Joseph Form Covariance Update: P = (I-KH)P(I-KH)^T + KRK^T',
        passed,
        expected: 'Symmetric (max diff < 1e-8) & strictly positive diagonal variances',
        actual: `Max asymmetry = ${maxAsymm.toExponential(2)}, P_diag=[${kf.P[0][0].toFixed(3)}, ${kf.P[1][1].toFixed(3)}, ${kf.P[2][2].toFixed(3)}, ${kf.P[3][3].toFixed(3)}]`,
        details: 'Guarantees positive semi-definiteness and numerical stability across thousands of frames.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-joseph-form',
        name: '2. Joseph Form Covariance Update',
        passed: false,
        expected: 'Valid P',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 3. Chi-Square Innovation Gating (d_M^2 < 9.21)
    try {
      const kf = new WorldKalmanFilter(103, 5.0, 5.0, 1.0, 0.2);
      const measCov: Covariance2D = { varX: 0.1, varY: 0.1, covXY: 0.0 };

      // Inlier point close to track: (5.1, 5.1)
      const inlierDistSq = kf.computeInnovationMahalanobisSq(5.1, 5.1, measCov);
      // Outlier point far away: (8.0, 8.0)
      const outlierDistSq = kf.computeInnovationMahalanobisSq(8.0, 8.0, measCov);

      const passed = inlierDistSq < 9.21 && outlierDistSq >= 9.21;

      results.push({
        id: 'test-chisquare-gate',
        name: '3. Chi-Square Association Gating: d_M^2 < 9.21 (2 DOF, 99%)',
        passed,
        expected: 'Inlier d_M^2 < 9.21 (accepted) AND Outlier d_M^2 >= 9.21 (rejected)',
        actual: `Inlier d_M^2 = ${inlierDistSq.toFixed(2)} (passed), Outlier d_M^2 = ${outlierDistSq.toFixed(2)} (rejected)`,
        details: 'Gates improbable detection associations prior to Hungarian assignment.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-chisquare-gate',
        name: '3. Chi-Square Association Gating',
        passed: false,
        expected: 'Inlier accepted, outlier rejected',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 4. Exact Closing Speed: v_c = - (Dp . Dv) / ||Dp||
    try {
      // p1 = (0, 0), p2 = (10, 0) -> Dp = (-10, 0), ||Dp|| = 10 m
      // v1 = (3, 0), v2 = (-1, 0) -> Dv = (4, 0)
      // Dp . Dv = -10 * 4 = -40
      // v_c = - (-40) / 10 = 4.0 m/s
      const stateA = {
        id: 1, X: 0, Y: 0, Vx: 3, Vy: 0, speed: 3, headingRad: 0,
        acceleration: 0, jerk: 0, speedBand: 'brisk' as const, P: [],
        lastTimestampSec: 1, totalDistanceM: 0, missedFrames: 0, hitStreak: 5
      };
      const stateB = {
        id: 2, X: 10, Y: 0, Vx: -1, Vy: 0, speed: 1, headingRad: Math.PI,
        acceleration: 0, jerk: 0, speedBand: 'walking' as const, P: [],
        lastTimestampSec: 1, totalDistanceM: 0, missedFrames: 0, hitStreak: 5
      };

      const interaction = InteractionGeometryEngine.evaluatePairwise(stateA, stateB);
      const passed = Math.abs(interaction.closingSpeedMs - 4.0) < 1e-5;

      results.push({
        id: 'test-closing-speed',
        name: '4. Pairwise Closing Speed: v_c = - (Dp . Dv) / ||Dp||',
        passed,
        expected: '4.0000 m/s',
        actual: `${interaction.closingSpeedMs.toFixed(4)} m/s`,
        details: 'Evaluated head-on approach (3 m/s vs -1 m/s at 10m range). Exact analytical solution: 4.0 m/s.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-closing-speed',
        name: '4. Pairwise Closing Speed',
        passed: false,
        expected: '4.0000 m/s',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 5. Time-to-Contact: TTC = ||Dp|| / v_c
    try {
      // With distance = 10.0m and closing speed = 4.0 m/s:
      // TTC = 10.0 / 4.0 = 2.50 s
      const stateA = {
        id: 1, X: 0, Y: 0, Vx: 3, Vy: 0, speed: 3, headingRad: 0,
        acceleration: 0, jerk: 0, speedBand: 'brisk' as const, P: [],
        lastTimestampSec: 1, totalDistanceM: 0, missedFrames: 0, hitStreak: 5
      };
      const stateB = {
        id: 2, X: 10, Y: 0, Vx: -1, Vy: 0, speed: 1, headingRad: Math.PI,
        acceleration: 0, jerk: 0, speedBand: 'walking' as const, P: [],
        lastTimestampSec: 1, totalDistanceM: 0, missedFrames: 0, hitStreak: 5
      };

      const interaction = InteractionGeometryEngine.evaluatePairwise(stateA, stateB);
      const passed = Math.abs(interaction.timeToContactSec - 2.50) < 1e-5;

      results.push({
        id: 'test-ttc',
        name: '5. Time-to-Contact: TTC = ||Dp|| / v_c',
        passed,
        expected: '2.5000 s',
        actual: `${interaction.timeToContactSec.toFixed(4)} s`,
        details: 'Distance 10.0m closing at 4.0 m/s yields exact impact horizon of 2.50s.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-ttc',
        name: '5. Time-to-Contact',
        passed: false,
        expected: '2.5000 s',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 6. Closest Point of Approach (CPA): t_cpa and d_cpa
    try {
      // p1 = (0, 4), p2 = (0, 0) -> Dp = (0, 4)
      // v1 = (2, 0), v2 = (0, 2) -> Dv = (2, -2), ||Dv||^2 = 4 + 4 = 8
      // Dp . Dv = 0*2 + 4*(-2) = -8
      // t_cpa = - (-8) / 8 = 1.0 s
      // Position at t=1s: Dp + Dv*1 = (0+2, 4-2) = (2, 2)
      // d_cpa = sqrt(2^2 + 2^2) = sqrt(8) ~= 2.828427 m
      const stateA = {
        id: 1, X: 0, Y: 4, Vx: 2, Vy: 0, speed: 2, headingRad: 0,
        acceleration: 0, jerk: 0, speedBand: 'walking' as const, P: [],
        lastTimestampSec: 1, totalDistanceM: 0, missedFrames: 0, hitStreak: 5
      };
      const stateB = {
        id: 2, X: 0, Y: 0, Vx: 0, Vy: 2, speed: 2, headingRad: Math.PI / 2,
        acceleration: 0, jerk: 0, speedBand: 'walking' as const, P: [],
        lastTimestampSec: 1, totalDistanceM: 0, missedFrames: 0, hitStreak: 5
      };

      const interaction = InteractionGeometryEngine.evaluatePairwise(stateA, stateB);
      const expectedTcpa = 1.0;
      const expectedDcpa = Math.sqrt(8.0);
      const passed =
        Math.abs(interaction.timeToCpaSec - expectedTcpa) < 1e-4 &&
        Math.abs(interaction.distAtCpaM - expectedDcpa) < 1e-4;

      results.push({
        id: 'test-cpa',
        name: '6. Closest Point of Approach: t_cpa = - (Dp.Dv)/||Dv||^2, d_cpa = ||Dp+Dv*t_cpa||',
        passed,
        expected: `t_cpa = ${expectedTcpa.toFixed(4)}s, d_cpa = ${expectedDcpa.toFixed(4)}m`,
        actual: `t_cpa = ${interaction.timeToCpaSec.toFixed(4)}s, d_cpa = ${interaction.distAtCpaM.toFixed(4)}m`,
        details: 'Evaluated orthogonal crossing trajectories. Exact analytical minimum miss distance verified.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-cpa',
        name: '6. Closest Point of Approach',
        passed: false,
        expected: '1.0s, 2.8284m',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 7. Speed Classification Bands & Maximum Speed Clamping (12 m/s)
    try {
      const kf = new WorldKalmanFilter(104, 0, 0, 1.0);
      // Test impossible speed > 12 m/s (e.g. 16 m/s)
      kf.x[2] = 12.0;
      kf.x[3] = 16.0; // ||v|| = 20.0 m/s
      const measCov: Covariance2D = { varX: 0.1, varY: 0.1, covXY: 0 };
      kf.update(0.1, 0.1, measCov);

      const clampedSpeed = Math.hypot(kf.x[2], kf.x[3]);
      const isClamped = Math.abs(clampedSpeed - 12.0) < 1e-3;

      // Test speed band logic
      const stateRunning = kf.getKinematicState(); // 12 m/s -> running

      results.push({
        id: 'test-speed-clamping',
        name: '7. Speed Banding & Physical Boundary Clamping (v <= 12 m/s)',
        passed: isClamped && stateRunning.speedBand === 'running',
        expected: 'Clamped to 12.0000 m/s with speedBand="running"',
        actual: `Speed = ${clampedSpeed.toFixed(4)} m/s, band = "${stateRunning.speedBand}"`,
        details: 'Rejects physically impossible human velocities to prevent sensor glitch escalations.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-speed-clamping',
        name: '7. Speed Banding & Physical Boundary Clamping',
        passed: false,
        expected: '12.0000 m/s',
        actual: String(e),
        details: 'Exception'
      });
    }

    // 8. 3-Second Trajectory Forecast & Monte Carlo Proximity Probability
    try {
      // Targets directly heading towards each other: distance 3.0m, speeds 1.0 m/s each -> collide in 1.5s
      const P_diag = [
        [0.05, 0, 0, 0],
        [0, 0.05, 0, 0],
        [0, 0, 0.05, 0],
        [0, 0, 0, 0.05]
      ];
      const stateHeadOnA = {
        id: 1, X: 0, Y: 0, Vx: 1.0, Vy: 0, speed: 1.0, headingRad: 0,
        acceleration: 0, jerk: 0, speedBand: 'walking' as const, P: P_diag,
        lastTimestampSec: 1, totalDistanceM: 0, missedFrames: 0, hitStreak: 5
      };
      const stateHeadOnB = {
        id: 2, X: 3.0, Y: 0, Vx: -1.0, Vy: 0, speed: 1.0, headingRad: Math.PI,
        acceleration: 0, jerk: 0, speedBand: 'walking' as const, P: P_diag,
        lastTimestampSec: 1, totalDistanceM: 0, missedFrames: 0, hitStreak: 5
      };

      const probCollide = InteractionGeometryEngine.monteCarloProximityProbability(
        stateHeadOnA,
        stateHeadOnB,
        0.8, // dSafe = 0.8m
        3.0, // horizon = 3.0s
        200  // 200 samples
      );

      // Should be near 100% collision probability (> 90%)
      const passed = probCollide >= 0.85;

      results.push({
        id: 'test-monte-carlo',
        name: '8. 3-Second Trajectory Forecast: 200-Sample Monte Carlo Proximity Risk',
        passed,
        expected: 'Encroachment probability >= 85%',
        actual: `Computed Probability = ${(probCollide * 100).toFixed(1)}%`,
        details: 'Evaluated 200 Gaussian velocity perturbation paths over tau = 3.0s forward horizon.'
      });
    } catch (e: unknown) {
      results.push({
        id: 'test-monte-carlo',
        name: '8. 3-Second Trajectory Forecast',
        passed: false,
        expected: 'Prob >= 85%',
        actual: String(e),
        details: 'Exception'
      });
    }

    return results;
  }
}
