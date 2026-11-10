/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - ByteTrack / SORT Multi-Object Tracker
 * Features:
 *   - Kalman State: [cx, cy, w, h, vx, vy]
 *   - Box IoU computation: IoU = area(A ∩ B) / area(A ∪ B)
 *   - Hungarian / Greedy IoU matching
 *   - Temporal confirmation for weapon alerts (>= 4 of last 6 frames)
 *   - Age group smoothing (mode / median of sliding window)
 *   - Polygon Zone testing (Ray-casting point-in-polygon)
 */

import { AgeBand, Detection, DetectionCategory, TrackedEntity, ZonePolygon } from '../types/spatial';

export class SimpleKalmanBoxTracker {
  private static nextId = 101;

  public id: number;
  public cls: string;
  public category: DetectionCategory;
  public score: number;
  public cx: number;
  public cy: number;
  public w: number;
  public h: number;
  public vx: number = 0;
  public vy: number = 0;

  public ageHistory: AgeBand[] = [];
  public smoothAge: AgeBand = 'Unknown';
  public distanceM?: number;

  public hitStreak: number = 1;
  public missedFrames: number = 0;
  public firstSeen: number = Date.now();
  public lastSeen: number = Date.now();

  public weaponHistory: boolean[] = []; // sliding window for temporal confirmation
  public inZoneAlertSent: boolean = false;

  constructor(detection: Detection) {
    this.id = SimpleKalmanBoxTracker.nextId++;
    this.cls = detection.cls;
    this.category = detection.category;
    this.score = detection.score;

    const [x, y, w, h] = detection.box;
    this.cx = x + w / 2;
    this.cy = y + h / 2;
    this.w = w;
    this.h = h;

    if (detection.ageBand) {
      this.ageHistory.push(detection.ageBand);
      this.smoothAge = detection.ageBand;
    }

    if (detection.distanceM) {
      this.distanceM = detection.distanceM;
    }

    this.weaponHistory.push(detection.category === 'weapon' || !!detection.isWeaponAlert);
  }

  /**
   * Predict next state using velocity: [cx' = cx + vx, cy' = cy + vy]
   */
  public predict(): void {
    this.cx += this.vx;
    this.cy += this.vy;
    this.missedFrames++;
  }

  /**
   * Correct state with observation [cx_obs, cy_obs, w_obs, h_obs]
   * Kalman gain approximation (alpha-beta filter):
   */
  public update(detection: Detection): void {
    const [x, y, w, h] = detection.box;
    const newCx = x + w / 2;
    const newCy = y + h / 2;

    const alpha = 0.65; // position correction factor
    const beta = 0.25;  // velocity correction factor

    const residualX = newCx - this.cx;
    const residualY = newCy - this.cy;

    this.cx += alpha * residualX;
    this.cy += alpha * residualY;
    this.vx += beta * residualX;
    this.vy += beta * residualY;

    this.w = this.w * 0.35 + w * 0.65;
    this.h = this.h * 0.35 + h * 0.65;
    this.score = detection.score;
    this.cls = detection.cls;
    this.category = detection.category;

    if (detection.distanceM !== undefined) {
      this.distanceM = this.distanceM !== undefined
        ? this.distanceM * 0.4 + detection.distanceM * 0.6
        : detection.distanceM;
    }

    if (detection.ageBand && detection.ageBand !== 'Unknown') {
      this.ageHistory.push(detection.ageBand);
      if (this.ageHistory.length > 9) {
        this.ageHistory.shift();
      }
      this.smoothAge = this.computeSmoothedAge();
    }

    // Temporal confirmation buffer (last 6 frames)
    this.weaponHistory.push(detection.category === 'weapon' || !!detection.isWeaponAlert);
    if (this.weaponHistory.length > 6) {
      this.weaponHistory.shift();
    }

    this.missedFrames = 0;
    this.hitStreak++;
    this.lastSeen = Date.now();
  }

  /**
   * Calculates most frequent age band in sliding window (mode)
   */
  private computeSmoothedAge(): AgeBand {
    if (this.ageHistory.length === 0) return 'Unknown';
    const counts: Record<string, number> = {};
    for (const a of this.ageHistory) {
      counts[a] = (counts[a] || 0) + 1;
    }
    let bestAge: AgeBand = this.ageHistory[this.ageHistory.length - 1];
    let maxCount = -1;
    for (const [age, c] of Object.entries(counts)) {
      if (c > maxCount) {
        maxCount = c;
        bestAge = age as AgeBand;
      }
    }
    return bestAge;
  }

  /**
   * Temporal verification for weapons: requires >= 4 positive detections in last 6 frames
   */
  public isWeaponConfirmed(): boolean {
    const positives = this.weaponHistory.filter(Boolean).length;
    return positives >= 4;
  }

  public getBox(): [number, number, number, number] {
    return [this.cx - this.w / 2, this.cy - this.h / 2, this.w, this.h];
  }

  public toEntity(): TrackedEntity {
    return {
      id: this.id,
      cls: this.cls,
      category: this.category,
      score: this.score,
      box: [this.cx, this.cy, this.w, this.h],
      velocity: [this.vx, this.vy],
      ageHistory: [...this.ageHistory],
      smoothAge: this.smoothAge,
      distanceM: this.distanceM !== undefined ? Math.round(this.distanceM * 10) / 10 : undefined,
      missedFrames: this.missedFrames,
      hitStreak: this.hitStreak,
      firstSeen: this.firstSeen,
      lastSeen: this.lastSeen,
      weaponStreak: this.weaponHistory.filter(Boolean).length,
      inZoneAlertSent: this.inZoneAlertSent
    };
  }
}

export class ObjectTracker {
  private trackers: SimpleKalmanBoxTracker[] = [];
  private maxMissedFrames: number = 8;
  private minHitStreak: number = 2;
  private iouMatchThreshold: number = 0.28;

  constructor(iouThreshold: number = 0.28) {
    this.iouMatchThreshold = iouThreshold;
  }

  public setIouThreshold(threshold: number): void {
    this.iouMatchThreshold = threshold;
  }

  /**
   * Clears all active tracks (called upon scene cut / camera move to prevent false velocity spikes).
   */
  public reset(): void {
    this.trackers = [];
  }

  /**
   * Update tracker with new frame detections:
   * 1. Predict all current tracks.
   * 2. Compute cost matrix via IoU: IoU = intersection / union.
   * 3. Greedy matching based on IoU threshold.
   * 4. Update matched tracks, instantiate new tracks, prune dead tracks.
   */
  public update(detections: Detection[]): TrackedEntity[] {
    // 1. Predict
    for (const trk of this.trackers) {
      trk.predict();
    }

    const matchedDetectionIndices = new Set<number>();
    const matchedTrackerIndices = new Set<number>();

    // 2. Greedy IoU matching
    if (this.trackers.length > 0 && detections.length > 0) {
      // Build candidate matches list [detIdx, trkIdx, iou]
      const candidates: Array<{ detIdx: number; trkIdx: number; iou: number }> = [];

      for (let d = 0; d < detections.length; d++) {
        const detBox = detections[d].box;
        for (let t = 0; t < this.trackers.length; t++) {
          const trkBox = this.trackers[t].getBox();
          const iou = ObjectTracker.computeIoU(detBox, trkBox);
          if (iou >= this.iouMatchThreshold) {
            candidates.push({ detIdx: d, trkIdx: t, iou });
          }
        }
      }

      // Sort descending by IoU
      candidates.sort((a, b) => b.iou - a.iou);

      for (const cand of candidates) {
        if (!matchedDetectionIndices.has(cand.detIdx) && !matchedTrackerIndices.has(cand.trkIdx)) {
          matchedDetectionIndices.add(cand.detIdx);
          matchedTrackerIndices.add(cand.trkIdx);
          this.trackers[cand.trkIdx].update(detections[cand.detIdx]);
        }
      }
    }

    // 3. Create new tracks for unmatched detections
    for (let d = 0; d < detections.length; d++) {
      if (!matchedDetectionIndices.has(d)) {
        this.trackers.push(new SimpleKalmanBoxTracker(detections[d]));
      }
    }

    // 4. Prune tracks that missed too many frames
    this.trackers = this.trackers.filter(trk => trk.missedFrames <= this.maxMissedFrames);

    // Return tracks that have reached minHitStreak
    return this.trackers
      .filter(trk => trk.hitStreak >= this.minHitStreak)
      .map(trk => trk.toEntity());
  }

  public getTrackers(): SimpleKalmanBoxTracker[] {
    return this.trackers;
  }

  public markZoneAlertSent(trackId: number, sent: boolean): void {
    const trk = this.trackers.find(t => t.id === trackId);
    if (trk) {
      trk.inZoneAlertSent = sent;
    }
  }

  /**
   * Formula: IoU = Area(A ∩ B) / Area(A ∪ B)
   * Box format: [x, y, w, h]
   */
  public static computeIoU(
    boxA: [number, number, number, number],
    boxB: [number, number, number, number]
  ): number {
    const [xA, yA, wA, hA] = boxA;
    const [xB, yB, wB, hB] = boxB;

    const x1 = Math.max(xA, xB);
    const y1 = Math.max(yA, yB);
    const x2 = Math.min(xA + wA, xB + wB);
    const y2 = Math.min(yA + hA, yB + hB);

    const interW = Math.max(0, x2 - x1);
    const interH = Math.max(0, y2 - y1);
    const interArea = interW * interH;

    const areaA = wA * hA;
    const areaB = wB * hB;
    const unionArea = areaA + areaB - interArea;

    if (unionArea <= 0) return 0;
    return interArea / unionArea;
  }

  /**
   * Ray-Casting algorithm for Point-In-Polygon zone checking
   */
  public static isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
    if (polygon.length < 3) return false;
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0];
      const yi = polygon[i][1];
      const xj = polygon[j][0];
      const yj = polygon[j][1];

      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Checks if an entity's center or bottom-center is inside any active zone polygon
   */
  public static checkZoneViolations(
    entity: TrackedEntity,
    zones: ZonePolygon[]
  ): ZonePolygon | null {
    // Use bottom-center of box [cx, cy + h/2] as footprint
    const footprint: [number, number] = [
      entity.box[0],
      entity.box[1] + entity.box[3] / 2
    ];

    for (const zone of zones) {
      if (!zone.active) continue;
      if (!zone.alertOnCategories.includes(entity.category)) continue;

      if (ObjectTracker.isPointInPolygon(footprint, zone.points)) {
        return zone;
      }
    }
    return null;
  }
}
