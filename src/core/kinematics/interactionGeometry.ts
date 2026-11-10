/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Multi-Target Interaction Geometry & Trajectory Forecasting (Phase B)
 * 
 * Exact Math:
 *   - Closing speed between i and j:
 *       v_c = - (Dp . Dv) / ||Dp||, Dp = p_i - p_j, Dv = v_i - v_j
 *   - Time-to-Contact:
 *       TTC = ||Dp|| / v_c if v_c > 0 else Infinity
 *   - Closest Point of Approach:
 *       t_cpa = - (Dp . Dv) / ||Dv||^2
 *       d_cpa = ||Dp + Dv * t_cpa||
 *   - Trajectory Forecast (Horizon tau = 3.0 s):
 *       Propagates P_{k+m} = F P F^T + Q; 200-sample Monte Carlo simulation for
 *       zone breach probability and proximity risk (d < d_safe).
 *   - Loitering: Dwell time > T and speed < 0.3 m/s.
 */

import { KinematicState } from './worldKalmanTracker';
import { Point2D } from '../calibration/homography';

export interface PairwiseInteraction {
  trackIdA: number;
  trackIdB: number;
  distanceM: number;
  closingSpeedMs: number; // Positive = converging, Negative = diverging
  timeToContactSec: number;
  timeToCpaSec: number;
  distAtCpaM: number;
  isUrgentClosure: boolean;
}

export interface TrajectoryForecastPoint {
  tSec: number;
  meanX: number;
  meanY: number;
  sigmaX: number;
  sigmaY: number;
}

export interface ZoneKinematicStatus {
  zoneId: string;
  isInside: boolean;
  dwellTimeSec: number;
  isLoitering: boolean;
  minDistanceToEdgeM: number;
}

export class InteractionGeometryEngine {
  /**
   * Computes pairwise closing speed, TTC, and CPA between two tracked entities
   */
  public static evaluatePairwise(
    trackA: KinematicState,
    trackB: KinematicState
  ): PairwiseInteraction {
    // Relative position Dp = p_i - p_j
    const dx = trackA.X - trackB.X;
    const dy = trackA.Y - trackB.Y;
    const dist = Math.hypot(dx, dy);

    // Relative velocity Dv = v_i - v_j
    const dvx = trackA.Vx - trackB.Vx;
    const dvy = trackA.Vy - trackB.Vy;
    const relSpeedSq = dvx * dvx + dvy * dvy;

    // Dot product: Dp . Dv
    const dpDotDv = dx * dvx + dy * dvy;

    // Closing speed: v_c = - (Dp . Dv) / ||Dp||
    let closingSpeed = 0;
    if (dist > 1e-4) {
      closingSpeed = -dpDotDv / dist;
    }

    // Time-to-contact: TTC = ||Dp|| / v_c (if converging v_c > 0)
    let ttc = Infinity;
    if (closingSpeed > 0.05) {
      ttc = dist / closingSpeed;
    }

    // Closest Point of Approach:
    // t_cpa = - (Dp . Dv) / ||Dv||^2
    // d_cpa = ||Dp + Dv * t_cpa||
    let t_cpa = 0;
    let d_cpa = dist;

    if (relSpeedSq > 1e-4) {
      t_cpa = Math.max(0, -dpDotDv / relSpeedSq);
      const cpaDx = dx + dvx * t_cpa;
      const cpaDy = dy + dvy * t_cpa;
      d_cpa = Math.hypot(cpaDx, cpaDy);
    }

    const isUrgentClosure = closingSpeed > 1.8 && ttc < 2.5 && d_cpa < 1.2;

    return {
      trackIdA: trackA.id,
      trackIdB: trackB.id,
      distanceM: dist,
      closingSpeedMs: closingSpeed,
      timeToContactSec: ttc,
      timeToCpaSec: t_cpa,
      distAtCpaM: d_cpa,
      isUrgentClosure
    };
  }

  /**
   * Evaluates all pairwise combinations across tracked targets
   */
  public static evaluateAllPairs(tracks: KinematicState[]): PairwiseInteraction[] {
    const results: PairwiseInteraction[] = [];
    const n = tracks.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        results.push(InteractionGeometryEngine.evaluatePairwise(tracks[i], tracks[j]));
      }
    }

    // Sort by most urgent TTC
    results.sort((a, b) => a.timeToContactSec - b.timeToContactSec);
    return results;
  }

  /**
   * Trajectory forecast over horizon tau = 3.0 s (steps dt = 0.5 s):
   * Propagates P_{k+m} = F P F^T + Q
   */
  public static forecastTrajectory(
    track: KinematicState,
    horizonSec: number = 3.0,
    stepSec: number = 0.5,
    sigmaA: number = 1.8
  ): TrajectoryForecastPoint[] {
    const points: TrajectoryForecastPoint[] = [];
    let currentX = track.X;
    let currentY = track.Y;
    let varX = track.P[0][0];
    let varY = track.P[1][1];

    for (let t = stepSec; t <= horizonSec + 1e-4; t += stepSec) {
      // Mean constant-velocity projection
      const meanX = track.X + track.Vx * t;
      const meanY = track.Y + track.Vy * t;

      // Variance growth: var(X) = var(X_0) + t^2*var(Vx_0) + (t^4/4)*sigma_a^2
      const t2 = t * t;
      const t4 = t2 * t2;
      const fVarX = track.P[0][0] + t2 * track.P[2][2] + (t4 / 4.0) * sigmaA * sigmaA;
      const fVarY = track.P[1][1] + t2 * track.P[3][3] + (t4 / 4.0) * sigmaA * sigmaA;

      points.push({
        tSec: t,
        meanX,
        meanY,
        sigmaX: Math.sqrt(Math.max(0.01, fVarX)),
        sigmaY: Math.sqrt(Math.max(0.01, fVarY))
      });
    }

    return points;
  }

  /**
   * 200-Sample Monte Carlo Trajectory Encroachment Test:
   * Estimates probability that trackA comes within dSafe of trackB within horizonSec
   */
  public static monteCarloProximityProbability(
    trackA: KinematicState,
    trackB: KinematicState,
    dSafeM: number = 1.0,
    horizonSec: number = 3.0,
    samplesCount: number = 200
  ): number {
    let breachCount = 0;
    const stdVxA = Math.sqrt(trackA.P[2][2]);
    const stdVyA = Math.sqrt(trackA.P[3][3]);
    const stdVxB = Math.sqrt(trackB.P[2][2]);
    const stdVyB = Math.sqrt(trackB.P[3][3]);

    for (let s = 0; s < samplesCount; s++) {
      // Sample perturbed velocity using Box-Muller transform
      const sampleVxA = trackA.Vx + InteractionGeometryEngine.sampleGaussian() * stdVxA;
      const sampleVyA = trackA.Vy + InteractionGeometryEngine.sampleGaussian() * stdVyA;
      const sampleVxB = trackB.Vx + InteractionGeometryEngine.sampleGaussian() * stdVxB;
      const sampleVyB = trackB.Vy + InteractionGeometryEngine.sampleGaussian() * stdVyB;

      let collided = false;
      // Step through time in 0.3s increments
      for (let t = 0.3; t <= horizonSec; t += 0.3) {
        const ax = trackA.X + sampleVxA * t;
        const ay = trackA.Y + sampleVyA * t;
        const bx = trackB.X + sampleVxB * t;
        const by = trackB.Y + sampleVyB * t;

        if (Math.hypot(ax - bx, ay - by) <= dSafeM) {
          collided = true;
          break;
        }
      }

      if (collided) breachCount++;
    }

    return breachCount / samplesCount;
  }

  /**
   * Evaluates signed distance and loitering status relative to a 2D ground polygon
   */
  public static evaluateZoneStatus(
    track: KinematicState,
    polygonVertices: Point2D[],
    zoneId: string,
    currentTimestampSec: number,
    dwellHistory: Map<string, { firstSeenSec: number; lastSeenSec: number }>
  ): ZoneKinematicStatus {
    const pt: Point2D = { x: track.X, y: track.Y };
    const isInside = InteractionGeometryEngine.isPointInPolygon(pt, polygonVertices);

    let dwellTimeSec = 0;
    const historyKey = `${track.id}_${zoneId}`;

    if (isInside) {
      const rec = dwellHistory.get(historyKey);
      if (!rec) {
        dwellHistory.set(historyKey, {
          firstSeenSec: currentTimestampSec,
          lastSeenSec: currentTimestampSec
        });
        dwellTimeSec = 0;
      } else {
        dwellTimeSec = currentTimestampSec - rec.firstSeenSec;
        rec.lastSeenSec = currentTimestampSec;
      }
    } else {
      dwellHistory.delete(historyKey);
    }

    // Loitering condition: inside zone for > 10.0 seconds and speed < 0.3 m/s (standing)
    const isLoitering = isInside && dwellTimeSec >= 10.0 && track.speed < 0.3;
    const minDist = InteractionGeometryEngine.distanceToPolygonBoundary(pt, polygonVertices);

    return {
      zoneId,
      isInside,
      dwellTimeSec,
      isLoitering,
      minDistanceToEdgeM: minDist
    };
  }

  /**
   * Distance from point to polygon boundary (meters)
   */
  public static distanceToPolygonBoundary(pt: Point2D, poly: Point2D[]): number {
    let minDist = Infinity;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % n];
      const dist = InteractionGeometryEngine.distancePointToSegment(pt, p1, p2);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }

  private static distancePointToSegment(p: Point2D, a: Point2D, b: Point2D): number {
    const l2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
    if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
    const projX = a.x + t * (b.x - a.x);
    const projY = a.y + t * (b.y - a.y);
    return Math.hypot(p.x - projX, p.y - projY);
  }

  private static isPointInPolygon(p: Point2D, poly: Point2D[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private static sampleGaussian(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
}
