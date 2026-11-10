/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Kinematics & World-Coordinate Kalman Tracker (Phase B)
 * 
 * Exact Math:
 *   - State vector: x = [X, Y, Vx, Vy]^T in metric ground coordinates (meters, meters/second)
 *   - Variable timestamp interval: dt = t_k - t_{k-1}
 *   - Transition matrix: F = [[I_2, dt*I_2], [0, I_2]]
 *   - Process noise covariance Q (continuous white-noise acceleration, sigma_a^2):
 *       Q = sigma_a^2 * [[(dt^4/4)*I_2, (dt^3/2)*I_2], [(dt^3/2)*I_2, dt^2*I_2]]
 *   - Measurement matrix: H = [[1, 0, 0, 0], [0, 1, 0, 0]]
 *   - Innovation: y = z - Hx, S = H P H^T + R
 *   - Kalman Gain: K = P H^T S^-1
 *   - Joseph Form Covariance Update (guaranteed symmetric & positive-semidefinite):
 *       P = (I - KH) P (I - KH)^T + K R K^T
 *   - Speed: v = sqrt(Vx^2 + Vy^2), heading psi = atan2(Vy, Vx)
 *   - Acceleration: a = dv/dt, jerk = da/dt
 *   - Speed Bands: standing < 0.3, walking 0.3-2.0, brisk/jog 2.0-3.5, running > 3.5 m/s
 *   - Physical ceiling: Reject v > 12.0 m/s
 */

import { Covariance2D, Point2D } from '../calibration/homography';

export type SpeedBand = 'standing' | 'walking' | 'brisk' | 'running';

export interface KinematicState {
  id: number;
  X: number;
  Y: number;
  Vx: number;
  Vy: number;
  speed: number;
  headingRad: number;
  acceleration: number;
  jerk: number;
  speedBand: SpeedBand;
  P: number[][]; // 4x4 covariance matrix
  lastTimestampSec: number;
  totalDistanceM: number;
  missedFrames: number;
  hitStreak: number;
}

export class WorldKalmanFilter {
  // State x: [X, Y, Vx, Vy]^T
  public x: [number, number, number, number];
  // 4x4 State Covariance P
  public P: number[][];

  public lastTimestampSec: number;
  public id: number;
  public missedFrames: number = 0;
  public hitStreak: number = 1;
  public totalDistanceM: number = 0;

  // Smoothing history for acceleration and jerk
  private prevSpeed: number = 0;
  private prevAcc: number = 0;
  private currentAcc: number = 0;
  private currentJerk: number = 0;

  // Noise parameter: acceleration spectral density sigma_a (m/s^2)
  public static readonly DEFAULT_SIGMA_A = 1.8; // Human walking/running acceleration variance

  constructor(
    id: number,
    initialX: number,
    initialY: number,
    timestampSec: number,
    initialPosVar = 0.25
  ) {
    this.id = id;
    this.x = [initialX, initialY, 0.0, 0.0];
    this.lastTimestampSec = timestampSec;

    // Initial covariance P: pos variance = initialPosVar, vel variance = 4.0 (m/s)^2
    this.P = [
      [initialPosVar, 0, 0, 0],
      [0, initialPosVar, 0, 0],
      [0, 0, 4.0, 0],
      [0, 0, 0, 4.0]
    ];
  }

  /**
   * Predict state forward to current timestamp using variable dt = t_k - t_{k-1}
   * x_{k|k-1} = F * x_{k-1}
   * P_{k|k-1} = F * P * F^T + Q
   */
  public predict(currentTimestampSec: number, sigmaA = WorldKalmanFilter.DEFAULT_SIGMA_A): void {
    const rawDt = currentTimestampSec - this.lastTimestampSec;
    // Bound dt to prevent numerical explosion during pauses [0.005s, 0.5s]
    const dt = Math.max(0.005, Math.min(0.5, rawDt));

    // 1. State prediction: x = F * x
    // X' = X + dt * Vx, Y' = Y + dt * Vy, Vx' = Vx, Vy' = Vy
    this.x[0] += dt * this.x[2];
    this.x[1] += dt * this.x[3];

    // 2. Compute F * P * F^T
    const FPFT = WorldKalmanFilter.computeFPFT(this.P, dt);

    // 3. Compute process noise Q (continuous white noise acceleration)
    // Q = sigma_a^2 * [[dt^4/4, 0, dt^3/2, 0], [0, dt^4/4, 0, dt^3/2], [dt^3/2, 0, dt^2, 0], [0, dt^3/2, 0, dt^2]]
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt3 * dt;
    const q11 = (dt4 / 4.0) * sigmaA * sigmaA;
    const q12 = (dt3 / 2.0) * sigmaA * sigmaA;
    const q22 = dt2 * sigmaA * sigmaA;

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let qVal = 0;
        if ((i === 0 && j === 0) || (i === 1 && j === 1)) qVal = q11;
        else if ((i === 0 && j === 2) || (i === 1 && j === 3) || (i === 2 && j === 0) || (i === 3 && j === 1)) qVal = q12;
        else if ((i === 2 && j === 2) || (i === 3 && j === 3)) qVal = q22;

        this.P[i][j] = FPFT[i][j] + qVal;
      }
    }

    this.lastTimestampSec = currentTimestampSec;
    this.missedFrames++;
  }

  /**
   * Measurement Update using Joseph Form Covariance Update:
   *   y = z - Hx
   *   S = HPH^T + R
   *   K = P H^T S^-1
   *   x = x + Ky
   *   P = (I - KH) P (I - KH)^T + K R K^T
   */
  public update(zX: number, zY: number, measurementCov: Covariance2D): void {
    const prevPos: Point2D = { x: this.x[0], y: this.x[1] };

    // Measurement residual (innovation) y = z - Hx
    const y0 = zX - this.x[0];
    const y1 = zY - this.x[1];

    // Residual covariance S = HPH^T + R (2x2)
    // HPH^T is top-left 2x2 of P
    const s00 = this.P[0][0] + measurementCov.varX;
    const s01 = this.P[0][1] + measurementCov.covXY;
    const s10 = this.P[1][0] + measurementCov.covXY;
    const s11 = this.P[1][1] + measurementCov.varY;

    // Invert S (2x2)
    const detS = s00 * s11 - s01 * s10;
    if (Math.abs(detS) < 1e-12) return; // Degenerate covariance
    const invDetS = 1.0 / detS;
    const invS00 = s11 * invDetS;
    const invS01 = -s01 * invDetS;
    const invS10 = -s10 * invDetS;
    const invS11 = s00 * invDetS;

    // Kalman Gain K = P * H^T * S^-1 (4x2 matrix)
    // P * H^T is columns 0 and 1 of P (4x2)
    const K: number[][] = Array.from({ length: 4 }, () => [0, 0]);
    for (let i = 0; i < 4; i++) {
      const ph0 = this.P[i][0];
      const ph1 = this.P[i][1];
      K[i][0] = ph0 * invS00 + ph1 * invS10;
      K[i][1] = ph0 * invS01 + ph1 * invS11;
    }

    // State update: x = x + K * y
    this.x[0] += K[0][0] * y0 + K[0][1] * y1;
    this.x[1] += K[1][0] * y0 + K[1][1] * y1;
    this.x[2] += K[2][0] * y0 + K[2][1] * y1;
    this.x[3] += K[3][0] * y0 + K[3][1] * y1;

    // Physical Velocity Sanity Check: Reject impossible speeds (> 12 m/s / Usain Bolt is ~12.4 m/s)
    const currentSpeed = Math.hypot(this.x[2], this.x[3]);
    if (currentSpeed > 12.0) {
      const scale = 12.0 / currentSpeed;
      this.x[2] *= scale;
      this.x[3] *= scale;
    }

    // Joseph Form Covariance Update:
    // P = (I - KH) P (I - KH)^T + K R K^T
    // Compute I - KH (4x4)
    const I_KH: number[][] = Array.from({ length: 4 }, (_, i) =>
      Array.from({ length: 4 }, (_, j) => (i === j ? 1.0 : 0.0))
    );
    for (let i = 0; i < 4; i++) {
      I_KH[i][0] -= K[i][0];
      I_KH[i][1] -= K[i][1];
    }

    // Compute Term 1: (I - KH) * P * (I - KH)^T
    const term1 = WorldKalmanFilter.matMul4x4(
      WorldKalmanFilter.matMul4x4(I_KH, this.P),
      WorldKalmanFilter.transpose4x4(I_KH)
    );

    // Compute Term 2: K * R * K^T (4x4)
    const R = [
      [measurementCov.varX, measurementCov.covXY],
      [measurementCov.covXY, measurementCov.varY]
    ];
    // K * R (4x2)
    const KR: number[][] = Array.from({ length: 4 }, () => [0, 0]);
    for (let i = 0; i < 4; i++) {
      KR[i][0] = K[i][0] * R[0][0] + K[i][1] * R[1][0];
      KR[i][1] = K[i][0] * R[0][1] + K[i][1] * R[1][1];
    }
    // (K * R) * K^T (4x4)
    const term2: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        term2[i][j] = KR[i][0] * K[j][0] + KR[i][1] * K[j][1];
      }
    }

    // P = term1 + term2
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        this.P[i][j] = term1[i][j] + term2[i][j];
      }
    }

    // Kinematic updates (acceleration & jerk)
    const dt = Math.max(0.01, this.lastTimestampSec - (this.lastTimestampSec - 0.05));
    const newSpeed = Math.hypot(this.x[2], this.x[3]);
    const rawAcc = (newSpeed - this.prevSpeed) / dt;
    this.currentAcc = this.currentAcc * 0.4 + rawAcc * 0.6; // EMA smoothed
    this.currentJerk = (this.currentAcc - this.prevAcc) / dt;
    this.prevSpeed = newSpeed;
    this.prevAcc = this.currentAcc;

    // Track statistics
    this.totalDistanceM += Math.hypot(this.x[0] - prevPos.x, this.x[1] - prevPos.y);
    this.missedFrames = 0;
    this.hitStreak++;
  }

  /**
   * Evaluates Mahalanobis distance squared of a candidate observation to this track
   * Used for chi-square validation gating: d_M^2 < 9.21 (2 DOF, 99% confidence threshold)
   */
  public computeInnovationMahalanobisSq(zX: number, zY: number, measurementCov: Covariance2D): number {
    const y0 = zX - this.x[0];
    const y1 = zY - this.x[1];

    const s00 = this.P[0][0] + measurementCov.varX;
    const s01 = this.P[0][1] + measurementCov.covXY;
    const s10 = this.P[1][0] + measurementCov.covXY;
    const s11 = this.P[1][1] + measurementCov.varY;

    const detS = s00 * s11 - s01 * s10;
    if (Math.abs(detS) < 1e-12) return Infinity;

    const invDetS = 1.0 / detS;
    const invS00 = s11 * invDetS;
    const invS01 = -s01 * invDetS;
    const invS10 = -s10 * invDetS;
    const invS11 = s00 * invDetS;

    return y0 * (invS00 * y0 + invS01 * y1) + y1 * (invS10 * y0 + invS11 * y1);
  }

  /**
   * Fast F * P * F^T analytic computation for constant-velocity transition:
   * F = [[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]]
   */
  public static computeFPFT(P: number[][], dt: number): number[][] {
    const out: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));

    // Rows 2 and 3 of F are identical to standard identity
    // Block computation:
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let val = P[i][j];
        if (i < 2) val += dt * P[i + 2][j];
        if (j < 2) val += dt * P[i][j + 2];
        if (i < 2 && j < 2) val += dt * dt * P[i + 2][j + 2];
        out[i][j] = val;
      }
    }
    return out;
  }

  public getKinematicState(): KinematicState {
    const speed = Math.hypot(this.x[2], this.x[3]);
    let speedBand: SpeedBand = 'standing';
    if (speed >= 3.5) speedBand = 'running';
    else if (speed >= 2.0) speedBand = 'brisk';
    else if (speed >= 0.3) speedBand = 'walking';

    return {
      id: this.id,
      X: this.x[0],
      Y: this.x[1],
      Vx: this.x[2],
      Vy: this.x[3],
      speed,
      headingRad: Math.atan2(this.x[3], this.x[2]),
      acceleration: this.currentAcc,
      jerk: this.currentJerk,
      speedBand,
      P: this.P.map((r) => [...r]),
      lastTimestampSec: this.lastTimestampSec,
      totalDistanceM: this.totalDistanceM,
      missedFrames: this.missedFrames,
      hitStreak: this.hitStreak
    };
  }

  private static matMul4x4(A: number[][], B: number[][]): number[][] {
    const C: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        for (let k = 0; k < 4; k++) {
          C[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    return C;
  }

  private static transpose4x4(A: number[][]): number[][] {
    const At: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        At[i][j] = A[j][i];
      }
    }
    return At;
  }
}
