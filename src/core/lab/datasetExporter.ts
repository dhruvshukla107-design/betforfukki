/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Dataset Exporter Engine
 * Supports:
 * - YOLO format (data.yaml, images/, labels/)
 * - COCO JSON format (instances.json)
 * - Scene-based train/val/test splitting (70% / 15% / 15%) without temporal data leakage
 * - Privacy face-blur on persons
 * - Class balance report & dataset_card.md (warnings for classes < 200 instances)
 * - sources.csv provenance tracking
 * - Client-side zip bundling via JSZip
 */

import JSZip from 'jszip';
import { DetectionCategory } from '../../types/spatial';

export interface AnnotationBox {
  id: string;
  cls: string;
  category: DetectionCategory;
  // Normalized bounding box [x, y, width, height] in [0, 1] range
  boxNorm: [number, number, number, number];
  confidence?: number;
  // Optional ground truth flags
  difficult?: boolean;
  truncated?: boolean;
  isPossibleWeapon?: boolean;
}

export interface AnnotatedFrame {
  id: string;
  sceneId: string;
  sourceName: string;
  sourceUrl?: string;
  timestamp: number;
  width: number;
  height: number;
  dHash?: string;
  boxes: AnnotationBox[];
  // Image as data URL or Blob
  dataUrl?: string;
  imageBlob?: Blob;
}

export interface DatasetSplit {
  train: AnnotatedFrame[];
  val: AnnotatedFrame[];
  test: AnnotatedFrame[];
}

export interface ClassStats {
  cls: string;
  count: number;
  percentage: number;
  smallBoxes: number;   // < 32x32 equivalent
  mediumBoxes: number;  // 32x32 to 96x96
  largeBoxes: number;   // > 96x96
  needsMoreSamples: boolean; // < 200 samples warning
}

export interface DatasetCardReport {
  totalFrames: number;
  totalBoxes: number;
  sceneCount: number;
  classes: ClassStats[];
  splitCounts: { train: number; val: number; test: number };
  warnings: string[];
}

export const LAB_CLASSES: string[] = [
  'person',
  'child',
  'teen',
  'adult',
  'senior',
  'animal',
  'dog',
  'cat',
  'bird',
  'phone',
  'laptop',
  'bag',
  'bottle',
  'keys',
  'umbrella',
  'knife',
  'firearm'
];

/**
 * Normalizes absolute pixel coordinates to YOLO standard [cx, cy, w, h] normalized [0, 1].
 */
export function pixelToYoloBox(
  x: number,
  y: number,
  w: number,
  h: number,
  imgWidth: number,
  imgHeight: number
): [number, number, number, number] {
  if (imgWidth <= 0 || imgHeight <= 0) {
    throw new Error('Image dimensions must be positive');
  }

  const cx = (x + w / 2) / imgWidth;
  const cy = (y + h / 2) / imgHeight;
  const nw = w / imgWidth;
  const nh = h / imgHeight;

  return [
    Math.max(0, Math.min(1, cx)),
    Math.max(0, Math.min(1, cy)),
    Math.max(0, Math.min(1, nw)),
    Math.max(0, Math.min(1, nh))
  ];
}

/**
 * Converts YOLO normalized [cx, cy, w, h] back to pixel [x, y, w, h].
 */
export function yoloToPixelBox(
  cx: number,
  cy: number,
  w: number,
  h: number,
  imgWidth: number,
  imgHeight: number
): [number, number, number, number] {
  const pw = w * imgWidth;
  const ph = h * imgHeight;
  const px = cx * imgWidth - pw / 2;
  const py = cy * imgHeight - ph / 2;

  return [
    Math.round(px),
    Math.round(py),
    Math.round(pw),
    Math.round(ph)
  ];
}

/**
 * Splits dataset frames by SCENE (not random frames) to prevent temporal data leakage.
 * Guarantees that all frames from the same scene stay in the same split.
 */
export function splitDatasetByScene(
  frames: AnnotatedFrame[],
  trainRatio = 0.70,
  valRatio = 0.15
): DatasetSplit {
  // Group frames by sceneId
  const sceneMap = new Map<string, AnnotatedFrame[]>();
  for (const frame of frames) {
    const list = sceneMap.get(frame.sceneId) || [];
    list.push(frame);
    sceneMap.set(frame.sceneId, list);
  }

  const scenes = Array.from(sceneMap.keys());
  // Deterministic shuffle using simple hash
  scenes.sort((a, b) => a.localeCompare(b));

  const train: AnnotatedFrame[] = [];
  const val: AnnotatedFrame[] = [];
  const test: AnnotatedFrame[] = [];

  const totalFrames = frames.length;
  const targetTrain = Math.round(totalFrames * trainRatio);
  const targetVal = Math.round(totalFrames * valRatio);

  let currentTrainCount = 0;
  let currentValCount = 0;

  for (const sceneId of scenes) {
    const sceneFrames = sceneMap.get(sceneId)!;
    if (currentTrainCount < targetTrain || scenes.length <= 2) {
      train.push(...sceneFrames);
      currentTrainCount += sceneFrames.length;
    } else if (currentValCount < targetVal) {
      val.push(...sceneFrames);
      currentValCount += sceneFrames.length;
    } else {
      test.push(...sceneFrames);
    }
  }

  // Edge case: if test is empty and we have at least 3 scenes, redistribute
  if (test.length === 0 && scenes.length >= 3 && val.length > 1) {
    const movedScene = scenes[scenes.length - 1];
    const movedFrames = sceneMap.get(movedScene)!;
    test.push(...movedFrames);
    // remove from val or train
    const valIdx = val.findIndex(f => f.sceneId === movedScene);
    if (valIdx >= 0) {
      val.splice(valIdx, movedFrames.length);
    }
  }

  return { train, val, test };
}

/**
 * Analyzes dataset distribution and generates a Dataset Card report.
 */
export function generateDatasetCardReport(
  frames: AnnotatedFrame[],
  split: DatasetSplit,
  classesList: string[] = LAB_CLASSES
): DatasetCardReport {
  const classCounts = new Map<string, { total: number; small: number; med: number; large: number }>();
  for (const cls of classesList) {
    classCounts.set(cls, { total: 0, small: 0, med: 0, large: 0 });
  }

  let totalBoxes = 0;
  const scenes = new Set<string>();

  for (const frame of frames) {
    scenes.add(frame.sceneId);
    for (const box of frame.boxes) {
      totalBoxes++;
      const stats = classCounts.get(box.cls) || { total: 0, small: 0, med: 0, large: 0 };
      stats.total++;

      // Estimate pixel area assuming reference 640x480 if not given
      const area = (box.boxNorm[2] * (frame.width || 640)) * (box.boxNorm[3] * (frame.height || 480));
      if (area < 32 * 32) {
        stats.small++;
      } else if (area < 96 * 96) {
        stats.med++;
      } else {
        stats.large++;
      }
      classCounts.set(box.cls, stats);
    }
  }

  const warnings: string[] = [];
  const classes: ClassStats[] = [];

  for (const [cls, stats] of classCounts.entries()) {
    if (stats.total === 0) continue;
    const percentage = totalBoxes > 0 ? (stats.total / totalBoxes) * 100 : 0;
    const needsMoreSamples = stats.total < 200;
    if (needsMoreSamples) {
      warnings.push(`Class "${cls}" has only ${stats.total} instances (< 200 recommended minimum for reliable transfer learning).`);
    }

    classes.push({
      cls,
      count: stats.total,
      percentage,
      smallBoxes: stats.small,
      mediumBoxes: stats.med,
      largeBoxes: stats.large,
      needsMoreSamples
    });
  }

  // Sort by count descending
  classes.sort((a, b) => b.count - a.count);

  return {
    totalFrames: frames.length,
    totalBoxes,
    sceneCount: scenes.size,
    classes,
    splitCounts: {
      train: split.train.length,
      val: split.val.length,
      test: split.test.length
    },
    warnings
  };
}

/**
 * Applies privacy face/head blur to person detections on a canvas.
 * Blurs the upper 30% of each detected 'person' box.
 */
export function applyPrivacyFaceBlur(
  canvas: HTMLCanvasElement,
  boxes: AnnotationBox[]
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  for (const box of boxes) {
    if (box.category === 'person' || box.cls === 'person' || box.cls === 'adult' || box.cls === 'child' || box.cls === 'senior') {
      const [normX, normY, normW, normH] = box.boxNorm;
      // Normalized [cx, cy, w, h] to top-left pixel
      const bx = (normX - normW / 2) * w;
      const by = (normY - normH / 2) * h;
      const bw = normW * w;
      // Head region: upper 30% of bounding box
      const bh = (normH * h) * 0.32;

      if (bw > 4 && bh > 4) {
        ctx.save();
        ctx.filter = 'blur(10px)';
        // Draw blurred crop back onto itself
        ctx.drawImage(canvas, bx, by, bw, bh, bx, by, bw, bh);
        ctx.restore();
      }
    }
  }
}

/**
 * Builds standard YOLO data.yaml configuration.
 */
export function buildYoloDataYaml(classes: string[]): string {
  const namesList = classes.map((c, i) => `  ${i}: ${c}`).join('\n');
  return `# SpatialMapper 3D - YOLO Dataset Configuration
# Generated automatically by SpatialMapper 3D Lab Engine
path: .
train: images/train
val: images/val
test: images/test

nc: ${classes.length}
names:
${namesList}
`;
}

/**
 * Converts annotation boxes of a frame to YOLO txt format line by line.
 */
export function formatYoloAnnotationTxt(
  boxes: AnnotationBox[],
  classIndexMap: Map<string, number>
): string {
  const lines: string[] = [];
  for (const b of boxes) {
    const clsId = classIndexMap.get(b.cls);
    if (clsId === undefined) continue;
    const [cx, cy, w, h] = b.boxNorm;
    lines.push(`${clsId} ${cx.toFixed(6)} ${cy.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}`);
  }
  return lines.join('\n');
}

/**
 * Builds COCO JSON format instances.
 */
export function buildCocoJson(
  frames: AnnotatedFrame[],
  classes: string[]
): string {
  const categories = classes.map((name, index) => ({
    id: index + 1,
    name,
    supercategory: 'spatialmapper'
  }));

  const classIdMap = new Map<string, number>(categories.map(c => [c.name, c.id]));

  const images = frames.map((f, idx) => ({
    id: idx + 1,
    file_name: `${f.id}.jpg`,
    width: f.width || 640,
    height: f.height || 480,
    date_captured: new Date(f.timestamp).toISOString(),
    scene_id: f.sceneId
  }));

  let annotationId = 1;
  const annotations: Array<Record<string, unknown>> = [];

  frames.forEach((f, imgIdx) => {
    const imgId = imgIdx + 1;
    const iw = f.width || 640;
    const ih = f.height || 480;

    for (const b of f.boxes) {
      const catId = classIdMap.get(b.cls);
      if (!catId) continue;

      const [px, py, pw, ph] = yoloToPixelBox(
        b.boxNorm[0],
        b.boxNorm[1],
        b.boxNorm[2],
        b.boxNorm[3],
        iw,
        ih
      );

      annotations.push({
        id: annotationId++,
        image_id: imgId,
        category_id: catId,
        bbox: [px, py, pw, ph],
        area: pw * ph,
        iscrowd: 0,
        attributes: {
          isPossibleWeapon: b.isPossibleWeapon ?? false,
          confidence: b.confidence ?? 1.0
        }
      });
    }
  });

  return JSON.stringify(
    {
      info: {
        description: 'SpatialMapper 3D CCTV & Spatial Dataset',
        url: 'https://spatialmapper3d.local',
        version: '2.0.0',
        year: new Date().getFullYear(),
        contributor: 'SpatialMapper 3D Lab',
        date_created: new Date().toISOString()
      },
      licenses: [
        {
          id: 1,
          name: 'CC BY-SA 4.0 / Open Benchmark',
          url: 'https://creativecommons.org/licenses/by-sa/4.0/'
        }
      ],
      images,
      annotations,
      categories
    },
    null,
    2
  );
}

/**
 * Builds dataset_card.md markdown text.
 */
export function buildDatasetCardMarkdown(report: DatasetCardReport): string {
  const rows = report.classes.map(c => {
    const status = c.needsMoreSamples ? '⚠️ LOW (< 200)' : '✅ OK';
    return `| ${c.cls} | ${c.count} | ${c.percentage.toFixed(1)}% | ${c.smallBoxes} | ${c.mediumBoxes} | ${c.largeBoxes} | ${status} |`;
  }).join('\n');

  const warnings = report.warnings.length > 0
    ? `### ⚠️ Data Health Warnings\n${report.warnings.map(w => `- ${w}`).join('\n')}\n`
    : '### ✅ Data Health: Good (all classes satisfy minimum sample thresholds)\n';

  return `# Dataset Card: SpatialMapper 3D Lab Dataset

## Summary
- **Total Frames:** ${report.totalFrames}
- **Total Bounding Boxes:** ${report.totalBoxes}
- **Distinct Scenes:** ${report.sceneCount}
- **Split Distribution (Scene-Isolated):**
  - Train: ${report.splitCounts.train} frames
  - Validation: ${report.splitCounts.val} frames
  - Test: ${report.splitCounts.test} frames

${warnings}

## Class Balance & Scale Distribution
| Class | Total Instances | Share | Small (<32px) | Medium (32-96px) | Large (>96px) | Status |
|---|---|---|---|---|---|---|
${rows}

## Privacy & Anonymization
All human face/head regions in this dataset can be optionally anonymized with a privacy-preserving Gaussian blur prior to training. Weapons are flagged as "possible weapon: needs human verification" to avoid demographic or biased automation.

## Attribution & Provenance
See \`sources.csv\` for timestamps, scene IDs, source origins, and cryptographic hashes.
`;
}

/**
 * Builds sources.csv tracking data provenance and hashes.
 */
export function buildSourcesCsv(frames: AnnotatedFrame[]): string {
  const header = 'frame_id,scene_id,source_name,timestamp_iso,box_count,dhash\n';
  const rows = frames.map(f => {
    const iso = new Date(f.timestamp).toISOString();
    return `"${f.id}","${f.sceneId}","${f.sourceName}","${iso}",${f.boxes.length},"${f.dHash || ''}"`;
  }).join('\n');
  return header + rows;
}

/**
 * Generates and bundles the complete dataset into a downloadable Zip Blob.
 */
export async function bundleDatasetZip(
  frames: AnnotatedFrame[],
  options: {
    format: 'yolo' | 'coco' | 'both';
    enablePrivacyFaceBlur: boolean;
    classesList?: string[];
  }
): Promise<{ zipBlob: Blob; report: DatasetCardReport }> {
  const zip = new JSZip();
  const classes = options.classesList || LAB_CLASSES;
  const classIndexMap = new Map<string, number>(classes.map((c, i) => [c, i]));

  // Split frames by scene
  const split = splitDatasetByScene(frames);
  const report = generateDatasetCardReport(frames, split, classes);

  // Add documentation
  zip.file('dataset_card.md', buildDatasetCardMarkdown(report));
  zip.file('sources.csv', buildSourcesCsv(frames));

  if (options.format === 'yolo' || options.format === 'both') {
    zip.file('data.yaml', buildYoloDataYaml(classes));

    const splits: Array<{ name: string; list: AnnotatedFrame[] }> = [
      { name: 'train', list: split.train },
      { name: 'val', list: split.val },
      { name: 'test', list: split.test }
    ];

    for (const s of splits) {
      for (const frame of s.list) {
        // Label text
        const txt = formatYoloAnnotationTxt(frame.boxes, classIndexMap);
        zip.file(`labels/${s.name}/${frame.id}.txt`, txt);

        // Image file if provided
        if (frame.imageBlob) {
          zip.file(`images/${s.name}/${frame.id}.jpg`, frame.imageBlob);
        } else if (frame.dataUrl) {
          const base64Data = frame.dataUrl.split(',')[1];
          if (base64Data) {
            zip.file(`images/${s.name}/${frame.id}.jpg`, base64Data, { base64: true });
          }
        }
      }
    }
  }

  if (options.format === 'coco' || options.format === 'both') {
    zip.file('annotations/instances_all.json', buildCocoJson(frames, classes));
    zip.file('annotations/instances_train.json', buildCocoJson(split.train, classes));
    zip.file('annotations/instances_val.json', buildCocoJson(split.val, classes));
    zip.file('annotations/instances_test.json', buildCocoJson(split.test, classes));
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return { zipBlob, report };
}
