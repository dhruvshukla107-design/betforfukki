/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Scene-Cut, Camera-Motion & Letterbox Detection (Phase H)
 * 
 * Exact Math:
 *   1. 64-bin Luminance Histogram:
 *      Y = 0.299*R + 0.587*G + 0.114*B in [0, 255]
 *      bin = floor(Y / 4), bin in [0, 63]
 *      Normalized so sum(h_i) = 1.0.
 * 
 *   2. Chi-Square Histogram Distance:
 *      chi^2 = sum_{i=0}^{63} [ (h1_i - h2_i)^2 / (h1_i + h2_i + eps) ]
 *      Theoretical bounds:
 *        - Identical images: chi^2 = 0.0
 *        - Completely disjoint images: chi^2 = 2.0
 *        - Scene-cut threshold: chi^2 > 0.45
 * 
 *   3. Global Camera-Motion Estimate (Grid Phase Flow):
 *      Computes 8x8 spatial block luminance differences:
 *      M_bar = (1 / 64) * sum_{k=1}^{64} |cell1_k - cell2_k|
 *      Threshold: M_bar > 28.0 indicates rapid camera pan / sweep / zoom.
 * 
 *   4. Letterbox & Pillarbox Black-Bar Detection:
 *      Scans borders for dark margins (mean luminance < 14.0) to crop active video pixels.
 */

export interface SceneCutAnalysisResult {
  isSceneCut: boolean;
  chiSquareDistance: number;
  globalMotionScore: number;
  reason?: 'histogram_shift' | 'rapid_global_motion' | 'none';
  activeContentRect: ActiveCropRect;
}

export interface ActiveCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
  isLetterboxed: boolean;
  cropTop: number;
  cropBottom: number;
  cropLeft: number;
  cropRight: number;
}

export class SceneCutDetector {
  public static readonly NUM_BINS: number = 64;
  public static readonly EPSILON: number = 1e-7;
  public static readonly CHI2_THRESHOLD: number = 0.45;
  public static readonly MOTION_THRESHOLD: number = 28.0;

  private previousHistogram: Float32Array | null = null;
  private previousBlockLuma: Float32Array | null = null;
  private sampleCanvas: HTMLCanvasElement;
  private sampleCtx: CanvasRenderingContext2D;

  constructor() {
    this.sampleCanvas = document.createElement('canvas');
    this.sampleCanvas.width = 160;
    this.sampleCanvas.height = 90;
    this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true })!;
  }

  /**
   * Computes a normalized 64-bin luminance histogram from raw RGBA pixel buffer.
   */
  public static computeLuminanceHistogram(
    rgbaData: Uint8ClampedArray | Uint8Array,
    numPixels: number
  ): Float32Array {
    const hist = new Float32Array(SceneCutDetector.NUM_BINS);
    if (numPixels <= 0) return hist;

    for (let i = 0; i < numPixels; i++) {
      const idx = i * 4;
      const r = rgbaData[idx];
      const g = rgbaData[idx + 1];
      const b = rgbaData[idx + 2];

      // ITU-R BT.601 standard luma formula
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      let bin = Math.floor(luma / 4);
      if (bin > 63) bin = 63;
      hist[bin]++;
    }

    // Normalize so sum(hist) = 1.0
    const invN = 1.0 / numPixels;
    for (let b = 0; b < SceneCutDetector.NUM_BINS; b++) {
      hist[b] *= invN;
    }

    return hist;
  }

  /**
   * Computes exact Chi-Square distance between two normalized 64-bin histograms:
   * chi^2 = sum_{i=0}^{63} [ (h1_i - h2_i)^2 / (h1_i + h2_i + eps) ]
   */
  public static computeChiSquareDistance(
    h1: Float32Array | number[],
    h2: Float32Array | number[]
  ): number {
    let chi2 = 0.0;
    const len = Math.min(h1.length, h2.length, SceneCutDetector.NUM_BINS);

    for (let i = 0; i < len; i++) {
      const v1 = h1[i];
      const v2 = h2[i];
      const diff = v1 - v2;
      const sum = v1 + v2;
      chi2 += (diff * diff) / (sum + SceneCutDetector.EPSILON);
    }

    return chi2;
  }

  /**
   * Computes 8x8 spatial block luminance averages for global camera motion estimation.
   */
  public static computeBlockLuma(
    rgbaData: Uint8ClampedArray | Uint8Array,
    width: number,
    height: number
  ): Float32Array {
    const blocks = new Float32Array(64); // 8x8 grid
    const blockW = Math.floor(width / 8);
    const blockH = Math.floor(height / 8);

    for (let by = 0; by < 8; by++) {
      for (let bx = 0; bx < 8; bx++) {
        let sumLuma = 0;
        let count = 0;

        for (let y = by * blockH; y < (by + 1) * blockH; y++) {
          for (let x = bx * blockW; x < (bx + 1) * blockW; x++) {
            const idx = (y * width + x) * 4;
            const luma = 0.299 * rgbaData[idx] + 0.587 * rgbaData[idx + 1] + 0.114 * rgbaData[idx + 2];
            sumLuma += luma;
            count++;
          }
        }

        blocks[by * 8 + bx] = count > 0 ? sumLuma / count : 0;
      }
    }

    return blocks;
  }

  /**
   * Computes global motion score by comparing 8x8 block luminance differences.
   */
  public static computeGlobalMotionScore(
    currentBlocks: Float32Array,
    previousBlocks: Float32Array
  ): number {
    let sumDiff = 0;
    for (let i = 0; i < 64; i++) {
      sumDiff += Math.abs(currentBlocks[i] - previousBlocks[i]);
    }
    return sumDiff / 64.0;
  }

  /**
   * Detects letterbox (top/bottom) and pillarbox (left/right) black bars.
   */
  public static detectActiveContentRect(
    rgbaData: Uint8ClampedArray | Uint8Array,
    width: number,
    height: number,
    blackThresholdLuma: number = 14.0
  ): ActiveCropRect {
    let top = 0;
    let bottom = height - 1;
    let left = 0;
    let right = width - 1;

    // Scan top rows
    for (let y = 0; y < Math.floor(height * 0.35); y++) {
      let rowLuma = 0;
      for (let x = 0; x < width; x += 4) {
        const idx = (y * width + x) * 4;
        rowLuma += 0.299 * rgbaData[idx] + 0.587 * rgbaData[idx + 1] + 0.114 * rgbaData[idx + 2];
      }
      rowLuma /= Math.ceil(width / 4);
      if (rowLuma < blackThresholdLuma) {
        top = y;
      } else {
        break;
      }
    }

    // Scan bottom rows
    for (let y = height - 1; y > Math.floor(height * 0.65); y--) {
      let rowLuma = 0;
      for (let x = 0; x < width; x += 4) {
        const idx = (y * width + x) * 4;
        rowLuma += 0.299 * rgbaData[idx] + 0.587 * rgbaData[idx + 1] + 0.114 * rgbaData[idx + 2];
      }
      rowLuma /= Math.ceil(width / 4);
      if (rowLuma < blackThresholdLuma) {
        bottom = y;
      } else {
        break;
      }
    }

    // Scan left columns
    for (let x = 0; x < Math.floor(width * 0.35); x++) {
      let colLuma = 0;
      for (let y = 0; y < height; y += 4) {
        const idx = (y * width + x) * 4;
        colLuma += 0.299 * rgbaData[idx] + 0.587 * rgbaData[idx + 1] + 0.114 * rgbaData[idx + 2];
      }
      colLuma /= Math.ceil(height / 4);
      if (colLuma < blackThresholdLuma) {
        left = x;
      } else {
        break;
      }
    }

    // Scan right columns
    for (let x = width - 1; x > Math.floor(width * 0.65); x--) {
      let colLuma = 0;
      for (let y = 0; y < height; y += 4) {
        const idx = (y * width + x) * 4;
        colLuma += 0.299 * rgbaData[idx] + 0.587 * rgbaData[idx + 1] + 0.114 * rgbaData[idx + 2];
      }
      colLuma /= Math.ceil(height / 4);
      if (colLuma < blackThresholdLuma) {
        right = x;
      } else {
        break;
      }
    }

    const cropTop = top;
    const cropBottom = height - 1 - bottom;
    const cropLeft = left;
    const cropRight = width - 1 - right;

    const cropW = Math.max(10, right - left + 1);
    const cropH = Math.max(10, bottom - top + 1);
    const isLetterboxed = cropTop > 4 || cropBottom > 4 || cropLeft > 4 || cropRight > 4;

    return {
      x: left,
      y: top,
      width: cropW,
      height: cropH,
      isLetterboxed,
      cropTop,
      cropBottom,
      cropLeft,
      cropRight
    };
  }

  /**
   * Evaluates a frame element (video or canvas) for scene-cut or camera movement.
   */
  public evaluateFrame(sourceElement: CanvasImageSource): SceneCutAnalysisResult {
    const sw = this.sampleCanvas.width;
    const sh = this.sampleCanvas.height;

    let imgData: ImageData;
    try {
      this.sampleCtx.drawImage(sourceElement, 0, 0, sw, sh);
      imgData = this.sampleCtx.getImageData(0, 0, sw, sh);
    } catch {
      // Cross-origin tainted canvas fallback (Watch-Only mode)
      return {
        isSceneCut: false,
        chiSquareDistance: 0,
        globalMotionScore: 0,
        reason: 'none',
        activeContentRect: {
          x: 0,
          y: 0,
          width: sw,
          height: sh,
          isLetterboxed: false,
          cropTop: 0,
          cropBottom: 0,
          cropLeft: 0,
          cropRight: 0
        }
      };
    }
    const pixels = imgData.data;
    const numPixels = sw * sh;

    // 1. Compute 64-bin luminance histogram
    const currentHist = SceneCutDetector.computeLuminanceHistogram(pixels, numPixels);

    // 2. Compute 8x8 block luminance for motion
    const currentBlocks = SceneCutDetector.computeBlockLuma(pixels, sw, sh);

    // 3. Detect letterboxing
    const activeRect = SceneCutDetector.detectActiveContentRect(pixels, sw, sh);

    if (!this.previousHistogram || !this.previousBlockLuma) {
      this.previousHistogram = currentHist;
      this.previousBlockLuma = currentBlocks;
      return {
        isSceneCut: false,
        chiSquareDistance: 0,
        globalMotionScore: 0,
        reason: 'none',
        activeContentRect: activeRect
      };
    }

    // 4. Calculate Chi-Square distance
    const chi2 = SceneCutDetector.computeChiSquareDistance(currentHist, this.previousHistogram);

    // 5. Calculate Global Motion score
    const motionScore = SceneCutDetector.computeGlobalMotionScore(currentBlocks, this.previousBlockLuma);

    // Update historical states
    this.previousHistogram = currentHist;
    this.previousBlockLuma = currentBlocks;

    let isCut = false;
    let reason: 'histogram_shift' | 'rapid_global_motion' | 'none' = 'none';

    if (chi2 > SceneCutDetector.CHI2_THRESHOLD) {
      isCut = true;
      reason = 'histogram_shift';
    } else if (motionScore > SceneCutDetector.MOTION_THRESHOLD) {
      isCut = true;
      reason = 'rapid_global_motion';
    }

    return {
      isSceneCut: isCut,
      chiSquareDistance: chi2,
      globalMotionScore: motionScore,
      reason,
      activeContentRect: activeRect
    };
  }

  public reset(): void {
    this.previousHistogram = null;
    this.previousBlockLuma = null;
  }
}
