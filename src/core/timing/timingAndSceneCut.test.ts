/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { VideoTimingEngine } from './videoTimingEngine';
import { SceneCutDetector } from './sceneCutDetector';

describe('Phase H: Video Timing & Scene-Cut Detection Vitest Suite', () => {
  // 1. Chi-Square Histogram Distance
  it('computes exact Chi-Square distance (0 for identical, 2.0 for completely disjoint)', () => {
    // Case 1: Identical histograms
    const h1 = new Float32Array(64).fill(1.0 / 64);
    const h2 = new Float32Array(64).fill(1.0 / 64);
    const chi2Identical = SceneCutDetector.computeChiSquareDistance(h1, h2);
    expect(chi2Identical).toBeCloseTo(0.0, 5);

    // Case 2: Completely disjoint histograms (h1 only bins 0-31, h2 only bins 32-63)
    const hDisjoint1 = new Float32Array(64);
    const hDisjoint2 = new Float32Array(64);
    for (let i = 0; i < 32; i++) hDisjoint1[i] = 1.0 / 32;
    for (let i = 32; i < 64; i++) hDisjoint2[i] = 1.0 / 32;

    const chi2Disjoint = SceneCutDetector.computeChiSquareDistance(hDisjoint1, hDisjoint2);
    // In theory: sum_{i=0..31} [h_i^2 / (h_i + eps)] + sum_{i=32..63} [h_i^2 / (h_i + eps)] = 1.0 + 1.0 = 2.0
    expect(chi2Disjoint).toBeCloseTo(2.0, 3);
  });

  // 2. 64-Bin Luminance Histogram Normalization
  it('generates normalized 64-bin histograms summing strictly to 1.0', () => {
    // Synthetic RGBA buffer (100 pixels, alternating dark and bright)
    const numPixels = 100;
    const rgba = new Uint8Array(numPixels * 4);
    for (let i = 0; i < numPixels; i++) {
      const idx = i * 4;
      rgba[idx] = i % 2 === 0 ? 30 : 220; // R
      rgba[idx + 1] = i % 2 === 0 ? 30 : 220; // G
      rgba[idx + 2] = i % 2 === 0 ? 30 : 220; // B
      rgba[idx + 3] = 255; // A
    }

    const hist = SceneCutDetector.computeLuminanceHistogram(rgba, numPixels);
    expect(hist.length).toBe(64);

    let sum = 0;
    for (let b = 0; b < 64; b++) {
      sum += hist[b];
    }
    expect(sum).toBeCloseTo(1.0, 5);
  });

  // 3. Playback-Rate Correction Formula
  it('correctly calculates dt_real = dt_display * playbackRate', () => {
    const dtDisplay = 0.0333; // ~30 FPS

    // At 2x speed: real elapsed time is 2x faster, so dt_real = 0.0666s
    const { dtRealSec: dt2x } = VideoTimingEngine.computeCorrectedDt(dtDisplay, 2.0);
    expect(dt2x).toBeCloseTo(0.0666, 4);

    // At 0.5x speed: dt_real = 0.01665s
    const { dtRealSec: dtHalf } = VideoTimingEngine.computeCorrectedDt(dtDisplay, 0.5);
    expect(dtHalf).toBeCloseTo(0.01665, 4);

    // Physical Velocity Invariance Verification:
    // If an object moves 2.0 metres in 30 display frames at 2x video speed:
    // Delta x = 2.0m, dt_real = 0.0666s -> v_real = 2.0 / 0.0666 = 30 m/s (not 60 m/s)
    const deltaX = 2.0;
    const vReal = deltaX / dt2x;
    const vUncorrected = deltaX / dtDisplay;
    expect(vReal).toBeCloseTo(vUncorrected / 2.0, 3);
  });

  // 4. Letterbox Black-Bar Detection
  it('detects top and bottom letterbox black bars', () => {
    const width = 100;
    const height = 100;
    const rgba = new Uint8Array(width * height * 4);

    // Fill rows 0-20 with pure black (letterbox)
    // Fill rows 21-80 with bright scene pixels (luminance ~ 180)
    // Fill rows 81-99 with pure black (letterbox)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const isBlackBar = y <= 20 || y >= 80;
        rgba[idx] = isBlackBar ? 0 : 180;
        rgba[idx + 1] = isBlackBar ? 0 : 180;
        rgba[idx + 2] = isBlackBar ? 0 : 180;
        rgba[idx + 3] = 255;
      }
    }

    const crop = SceneCutDetector.detectActiveContentRect(rgba, width, height, 14.0);
    expect(crop.isLetterboxed).toBe(true);
    expect(crop.cropTop).toBeGreaterThanOrEqual(18);
    expect(crop.cropBottom).toBeGreaterThanOrEqual(18);
  });

  // 5. Global Motion Score
  it('computes 0 motion score for static blocks and flags rapid scene sweeps', () => {
    const blocks1 = new Float32Array(64).fill(100.0);
    const blocksIdentical = new Float32Array(64).fill(100.0);
    expect(SceneCutDetector.computeGlobalMotionScore(blocks1, blocksIdentical)).toBe(0.0);

    const blocksShifted = new Float32Array(64).fill(150.0);
    // Difference is |100 - 150| = 50.0 > MOTION_THRESHOLD (28.0)
    const motionScore = SceneCutDetector.computeGlobalMotionScore(blocks1, blocksShifted);
    expect(motionScore).toBe(50.0);
    expect(motionScore).toBeGreaterThan(SceneCutDetector.MOTION_THRESHOLD);
  });
});
