/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Hard-Example Mining Engine
 * Automatically mines difficult or ambiguous frames:
 * - Detections with uncertain confidence (0.25 <= score <= 0.55)
 * - Possible weapon classifications requiring human verification
 * - Lost tracking or sudden acceleration spikes
 * - Automatically deduplicates candidate frames via dHash (Hamming distance < 5)
 */

import { Detection } from '../../types/spatial';
import { computeCanvasDHash, DHashDeduplicator } from './dhashDeduplicator';
import { AnnotatedFrame, AnnotationBox } from './datasetExporter';

export interface MiningCandidate {
  frameId: string;
  timestamp: number;
  reason: 'uncertain_confidence' | 'weapon_review' | 'track_instability';
  scoreRange: [number, number];
  dHash: string;
  boxes: AnnotationBox[];
  dataUrl?: string;
}

export class HardExampleMiner {
  private deduplicator: DHashDeduplicator;
  private candidates: MiningCandidate[] = [];
  private readonly maxCapacity: number;
  private enabled: boolean = true;

  constructor(maxCapacity = 100, deduplicationThreshold = 5) {
    this.maxCapacity = maxCapacity;
    this.deduplicator = new DHashDeduplicator(deduplicationThreshold, 150);
  }

  public setEnabled(val: boolean): void {
    this.enabled = val;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Evaluates detections on a canvas frame.
   * If any detection triggers hard-example rules and passes dHash deduplication, records candidate.
   */
  public evaluateFrame(
    canvas: HTMLCanvasElement,
    detections: Detection[],
    options: {
      sceneId?: string;
      sourceName?: string;
      hasKinematicAnomaly?: boolean;
    } = {}
  ): MiningCandidate | null {
    if (!this.enabled || detections.length === 0) return null;

    let triggerReason: 'uncertain_confidence' | 'weapon_review' | 'track_instability' | null = null;
    let minScore = 1.0;
    let maxScore = 0.0;

    for (const d of detections) {
      if (d.score < minScore) minScore = d.score;
      if (d.score > maxScore) maxScore = d.score;

      // 1. Uncertain confidence range [0.25, 0.55]
      if (d.score >= 0.25 && d.score <= 0.55) {
        triggerReason = 'uncertain_confidence';
      }

      // 2. Weapon review trigger
      if (d.category === 'weapon' || d.isWeaponAlert || d.cls === 'knife' || d.cls === 'firearm') {
        triggerReason = 'weapon_review';
      }
    }

    // 3. Kinematic anomaly (sudden jerk or lost track)
    if (!triggerReason && options.hasKinematicAnomaly) {
      triggerReason = 'track_instability';
    }

    if (!triggerReason) return null;

    // Perceptual hash deduplication
    try {
      const dhash = computeCanvasDHash(canvas);
      if (this.deduplicator.isDuplicateAndRecord(dhash.hashHex)) {
        return null; // Suppress near-identical duplicate frame
      }

      const w = canvas.width;
      const h = canvas.height;

      const boxes: AnnotationBox[] = detections.map((d, i) => {
        const [bx, by, bw, bh] = d.box;
        // Normalize coordinates if necessary
        const isNormalized = bx <= 1 && by <= 1 && bw <= 1 && bh <= 1;
        const normBox: [number, number, number, number] = isNormalized
          ? [bx + bw / 2, by + bh / 2, bw, bh]
          : [(bx + bw / 2) / w, (by + bh / 2) / h, bw / w, bh / h];

        return {
          id: `box-${Date.now()}-${i}`,
          cls: d.cls,
          category: d.category,
          boxNorm: normBox,
          confidence: d.score,
          isPossibleWeapon: d.category === 'weapon' || d.isWeaponAlert
        };
      });

      const candidate: MiningCandidate = {
        frameId: `mine-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: Date.now(),
        reason: triggerReason,
        scoreRange: [minScore, maxScore],
        dHash: dhash.hashHex,
        boxes,
        dataUrl: canvas.toDataURL('image/jpeg', 0.85)
      };

      this.candidates.unshift(candidate);
      if (this.candidates.length > this.maxCapacity) {
        this.candidates.pop();
      }

      return candidate;
    } catch {
      return null;
    }
  }

  public getCandidates(): MiningCandidate[] {
    return [...this.candidates];
  }

  public removeCandidate(frameId: string): void {
    this.candidates = this.candidates.filter(c => c.frameId !== frameId);
  }

  public clear(): void {
    this.candidates = [];
    this.deduplicator.clear();
  }

  /**
   * Converts mined candidate to an AnnotatedFrame ready for inclusion in the dataset.
   */
  public toAnnotatedFrame(candidate: MiningCandidate, sceneId = 'scene-hard-mining'): AnnotatedFrame {
    return {
      id: candidate.frameId,
      sceneId,
      sourceName: 'Hard-Example Mining',
      timestamp: candidate.timestamp,
      width: 640,
      height: 480,
      dHash: candidate.dHash,
      boxes: candidate.boxes,
      dataUrl: candidate.dataUrl
    };
  }
}
