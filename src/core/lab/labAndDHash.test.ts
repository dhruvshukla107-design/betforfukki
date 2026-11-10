/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Lab Mode, dHash & Dataset Tests
 */

import { describe, it, expect } from 'vitest';
import {
  computeDHashFromGrayscale9x8,
  computeHammingDistance,
  isNearDuplicate,
  downsampleTo9x8
} from './dhashDeduplicator';
import {
  pixelToYoloBox,
  yoloToPixelBox,
  splitDatasetByScene,
  generateDatasetCardReport,
  AnnotatedFrame
} from './datasetExporter';
import {
  computeNormalizedBoxIoU,
  evaluateDeployGate
} from './preDeployGate';
import { verifyModelIntegrity } from './trainingNotebookGenerator';

describe('Perceptual Hash (dHash) & Deduplication', () => {
  it('computes identical dHash for identical grayscale 9x8 buffers', () => {
    const bufA = new Uint8Array(72);
    const bufB = new Uint8Array(72);

    for (let i = 0; i < 72; i++) {
      const val = (i * 17) % 256;
      bufA[i] = val;
      bufB[i] = val;
    }

    const hashA = computeDHashFromGrayscale9x8(bufA);
    const hashB = computeDHashFromGrayscale9x8(bufB);

    expect(hashA.hashHex).toBe(hashB.hashHex);
    expect(computeHammingDistance(hashA.hashHex, hashB.hashHex)).toBe(0);
    expect(isNearDuplicate(hashA.hashHex, hashB.hashHex)).toBe(true);
  });

  it('computes correct Hamming distance for flipped bits', () => {
    const hashA = '0000000000000000';
    const hashB = '0000000000000001'; // 1 bit diff
    const hashC = '000000000000000f'; // 4 bits diff (1111)
    const hashD = 'ffffffffffffffff'; // 64 bits diff

    expect(computeHammingDistance(hashA, hashB)).toBe(1);
    expect(computeHammingDistance(hashA, hashC)).toBe(4);
    expect(computeHammingDistance(hashA, hashD)).toBe(64);
    expect(isNearDuplicate(hashA, hashC, 5)).toBe(true);
    expect(isNearDuplicate(hashA, hashD, 5)).toBe(false);
  });

  it('downsamples WxH image to 9x8 grayscale accurately', () => {
    const w = 18;
    const h = 16;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Fill with solid white
    rgba.fill(255);

    const gray = downsampleTo9x8(rgba, w, h, 4);
    expect(gray.length).toBe(72);
    expect(gray[0]).toBe(255);
    expect(gray[71]).toBe(255);
  });
});

describe('YOLO & Bounding Box Coordinates', () => {
  it('converts pixel box to YOLO normalized [cx, cy, w, h] and roundtrips accurately', () => {
    const imgW = 640;
    const imgH = 480;
    const x = 100;
    const y = 80;
    const w = 200;
    const h = 150;

    const [cx, cy, nw, nh] = pixelToYoloBox(x, y, w, h, imgW, imgH);

    // Center x should be (100 + 100) / 640 = 200 / 640 = 0.3125
    expect(cx).toBeCloseTo(0.3125, 4);
    // Center y should be (80 + 75) / 480 = 155 / 480 = 0.3229
    expect(cy).toBeCloseTo(155 / 480, 4);
    expect(nw).toBeCloseTo(200 / 640, 4);
    expect(nh).toBeCloseTo(150 / 480, 4);

    const [rx, ry, rw, rh] = yoloToPixelBox(cx, cy, nw, nh, imgW, imgH);
    expect(rx).toBe(x);
    expect(ry).toBe(y);
    expect(rw).toBe(w);
    expect(rh).toBe(h);
  });

  it('computes normalized box IoU accurately', () => {
    // Identical boxes
    const boxA: [number, number, number, number] = [0.5, 0.5, 0.2, 0.2];
    expect(computeNormalizedBoxIoU(boxA, boxA)).toBeCloseTo(1.0, 4);

    // Disjoint boxes
    const boxB: [number, number, number, number] = [0.1, 0.1, 0.1, 0.1];
    expect(computeNormalizedBoxIoU(boxA, boxB)).toBe(0);

    // 50% overlap box
    // Box 1: [0, 0] to [2, 2] -> center 1, 1, w 2, h 2. Area = 4
    // Box 2: [1, 0] to [3, 2] -> center 2, 1, w 2, h 2. Area = 4
    // Intersection: [1, 0] to [2, 2] -> w 1, h 2. Inter area = 2
    // Union: 4 + 4 - 2 = 6. IoU = 2 / 6 = 1/3 ~ 0.3333
    const boxC: [number, number, number, number] = [0.2, 0.2, 0.2, 0.2];
    const boxD: [number, number, number, number] = [0.3, 0.2, 0.2, 0.2];
    expect(computeNormalizedBoxIoU(boxC, boxD)).toBeCloseTo(1 / 3, 3);
  });
});

describe('Dataset Scene-Based Splitting & Dataset Card', () => {
  it('guarantees that frames from the same scene never leak across train/val/test splits', () => {
    const frames: AnnotatedFrame[] = [];
    const sceneNames = ['scene_lobby', 'scene_parking', 'scene_corridor', 'scene_rooftop', 'scene_stairwell'];

    sceneNames.forEach(sceneId => {
      for (let i = 0; i < 10; i++) {
        frames.push({
          id: `${sceneId}_frame_${i}`,
          sceneId,
          sourceName: 'CCTV Camera',
          timestamp: Date.now() + i * 1000,
          width: 640,
          height: 480,
          boxes: [
            {
              id: `box_${i}`,
              cls: 'person',
              category: 'person',
              boxNorm: [0.5, 0.5, 0.2, 0.4]
            }
          ]
        });
      }
    });

    const split = splitDatasetByScene(frames, 0.6, 0.2);

    const trainScenes = new Set(split.train.map(f => f.sceneId));
    const valScenes = new Set(split.val.map(f => f.sceneId));
    const testScenes = new Set(split.test.map(f => f.sceneId));

    // Assert disjoint sets
    for (const s of trainScenes) {
      expect(valScenes.has(s)).toBe(false);
      expect(testScenes.has(s)).toBe(false);
    }
    for (const s of valScenes) {
      expect(testScenes.has(s)).toBe(false);
    }

    expect(split.train.length + split.val.length + split.test.length).toBe(frames.length);
  });

  it('generates dataset card report and warns when classes have under 200 samples', () => {
    const frames: AnnotatedFrame[] = [
      {
        id: 'f1',
        sceneId: 's1',
        sourceName: 'Cam 1',
        timestamp: Date.now(),
        width: 640,
        height: 480,
        boxes: [
          { id: 'b1', cls: 'knife', category: 'weapon', boxNorm: [0.5, 0.5, 0.1, 0.1] },
          { id: 'b2', cls: 'person', category: 'person', boxNorm: [0.5, 0.5, 0.2, 0.4] }
        ]
      }
    ];

    const split = splitDatasetByScene(frames);
    const report = generateDatasetCardReport(frames, split);

    expect(report.totalBoxes).toBe(2);
    expect(report.totalFrames).toBe(1);
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings.some(w => w.includes('knife'))).toBe(true);
  });
});

describe('Pre-Deploy Gate & Model Verification', () => {
  it('correctly passes qualified model predictions and blocks flawed ones', () => {
    const gtFrames: AnnotatedFrame[] = [
      {
        id: 'f1',
        sceneId: 's1',
        sourceName: 'Test',
        timestamp: 1000,
        width: 640,
        height: 480,
        boxes: [
          { id: 'g1', cls: 'person', category: 'person', boxNorm: [0.5, 0.5, 0.2, 0.4] },
          { id: 'g2', cls: 'knife', category: 'weapon', boxNorm: [0.3, 0.3, 0.1, 0.1] }
        ]
      }
    ];

    // Perfect predictions
    const perfectPredictions: AnnotatedFrame[] = [
      {
        id: 'f1',
        sceneId: 's1',
        sourceName: 'Test',
        timestamp: 1000,
        width: 640,
        height: 480,
        boxes: [
          { id: 'p1', cls: 'person', category: 'person', boxNorm: [0.5, 0.5, 0.2, 0.4], confidence: 0.95 },
          { id: 'p2', cls: 'knife', category: 'weapon', boxNorm: [0.3, 0.3, 0.1, 0.1], confidence: 0.90 }
        ]
      }
    ];

    const goodResult = evaluateDeployGate(gtFrames, perfectPredictions, {
      minMap50: 0.50,
      minWeaponRecall: 0.70,
      maxWeaponFalsePositiveRate: 0.10,
      minPersonPrecision: 0.70
    });

    expect(goodResult.passed).toBe(true);
    expect(goodResult.overallMap50).toBeGreaterThanOrEqual(0.5);

    // Flawed predictions (missed weapon, wrong person location)
    const badPredictions: AnnotatedFrame[] = [
      {
        id: 'f1',
        sceneId: 's1',
        sourceName: 'Test',
        timestamp: 1000,
        width: 640,
        height: 480,
        boxes: [
          { id: 'p1', cls: 'person', category: 'person', boxNorm: [0.1, 0.1, 0.05, 0.05], confidence: 0.3 }
        ]
      }
    ];

    const badResult = evaluateDeployGate(gtFrames, badPredictions, {
      minMap50: 0.50,
      minWeaponRecall: 0.70,
      maxWeaponFalsePositiveRate: 0.10,
      minPersonPrecision: 0.70
    });

    expect(badResult.passed).toBe(false);
  });

  it('verifies ArrayBuffer model integrity using SHA-256', async () => {
    const testData = new TextEncoder().encode('SpatialMapper3D_Model_Weights_V2');
    // Calculate expected hash
    const hashBuf = await crypto.subtle.digest('SHA-256', testData);
    const expectedHex = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const res = await verifyModelIntegrity(testData.buffer, expectedHex);
    expect(res.valid).toBe(true);
    expect(res.actualSha256).toBe(expectedHex);

    const badRes = await verifyModelIntegrity(testData.buffer, '0000000000000000000000000000000000000000000000000000000000000000');
    expect(badRes.valid).toBe(false);
  });
});
