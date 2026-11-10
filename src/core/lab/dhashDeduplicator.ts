/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Perceptual Hash & Frame Deduplicator (dHash)
 * 
 * Implements 64-bit difference hash (dHash):
 * 1. Grayscale reduction.
 * 2. Downsample to 9x8 pixels (9 columns x 8 rows = 72 pixels).
 * 3. Adjacent horizontal comparison: p[r, c] > p[r, c+1] yields 1 bit per column, 8 bits/row x 8 rows = 64 bits.
 * 4. Hamming distance threshold: Hamming distance < 5 indicates near-duplicate frames.
 */

export interface DHashResult {
  hashHex: string;
  hashBigInt: bigint;
}

/**
 * Computes 64-bit difference hash (dHash) from raw RGB or RGBA pixel buffer of size W x H.
 * Compatible with pure Node/Vitest environments without requiring Canvas DOM.
 */
export function computeDHashFromGrayscale9x8(gray9x8: Uint8Array): DHashResult {
  if (gray9x8.length < 72) {
    throw new Error('dHash requires exactly 72 (9x8) grayscale pixel values');
  }

  let hash = 0n;
  let bitIndex = 0n;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const left = gray9x8[r * 9 + c];
      const right = gray9x8[r * 9 + (c + 1)];
      if (left > right) {
        hash |= (1n << bitIndex);
      }
      bitIndex++;
    }
  }

  const hashHex = hash.toString(16).padStart(16, '0');
  return { hashHex, hashBigInt: hash };
}

/**
 * Downsamples an arbitrary WxH grayscale buffer to 9x8 using area averaging (box filter).
 */
export function downsampleTo9x8(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  channels: 1 | 3 | 4 = 4
): Uint8Array {
  const result = new Uint8Array(72);
  const targetW = 9;
  const targetH = 8;

  const cellW = width / targetW;
  const cellH = height / targetH;

  for (let tr = 0; tr < targetH; tr++) {
    const y0 = Math.floor(tr * cellH);
    const y1 = Math.min(height, Math.floor((tr + 1) * cellH));

    for (let tc = 0; tc < targetW; tc++) {
      const x0 = Math.floor(tc * cellW);
      const x1 = Math.min(width, Math.floor((tc + 1) * cellW));

      let sum = 0;
      let count = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * width + x) * channels;
          if (channels === 1) {
            sum += pixels[idx];
          } else {
            // ITU-R BT.601 luminance
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];
            sum += (0.299 * r + 0.587 * g + 0.114 * b);
          }
          count++;
        }
      }

      result[tr * targetW + tc] = count > 0 ? Math.round(sum / count) : 0;
    }
  }

  return result;
}

/**
 * Computes dHash from an HTML Canvas or ImageBitmap in browser environment.
 */
export function computeCanvasDHash(canvas: HTMLCanvasElement): DHashResult {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context for dHash');
  }

  // Draw scaled 9x8 image onto temporary miniature canvas
  const miniCanvas = document.createElement('canvas');
  miniCanvas.width = 9;
  miniCanvas.height = 8;
  const miniCtx = miniCanvas.getContext('2d', { willReadFrequently: true });
  if (!miniCtx) {
    throw new Error('Mini canvas context creation failed');
  }

  miniCtx.drawImage(canvas, 0, 0, 9, 8);
  const imgData = miniCtx.getImageData(0, 0, 9, 8);
  const gray9x8 = new Uint8Array(72);

  for (let i = 0; i < 72; i++) {
    const r = imgData.data[i * 4];
    const g = imgData.data[i * 4 + 1];
    const b = imgData.data[i * 4 + 2];
    gray9x8[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  return computeDHashFromGrayscale9x8(gray9x8);
}

/**
 * Calculates Hamming distance between two 64-bit dHash hex strings.
 * Distance range: 0 (identical) to 64 (inverted).
 */
export function computeHammingDistance(hashA: string, hashB: string): number {
  const a = BigInt('0x' + hashA);
  const b = BigInt('0x' + hashB);
  let xor = a ^ b;
  let distance = 0;

  while (xor > 0n) {
    if ((xor & 1n) === 1n) {
      distance++;
    }
    xor >>= 1n;
  }

  return distance;
}

/**
 * Returns true if the two frames are perceptual near-duplicates (Hamming distance < threshold, default 5).
 */
export function isNearDuplicate(hashA: string, hashB: string, threshold = 5): boolean {
  return computeHammingDistance(hashA, hashB) < threshold;
}

export class DHashDeduplicator {
  private recentHashes: { hash: string; timestamp: number }[] = [];
  private readonly threshold: number;
  private readonly maxWindow: number;

  constructor(threshold = 5, maxWindow = 120) {
    this.threshold = threshold;
    this.maxWindow = maxWindow;
  }

  /**
   * Checks if candidate hash is a duplicate of any recent frame.
   * If not duplicate, records it and returns false. If duplicate, returns true.
   */
  public isDuplicateAndRecord(hash: string, timestamp = Date.now()): boolean {
    for (const item of this.recentHashes) {
      if (computeHammingDistance(item.hash, hash) < this.threshold) {
        return true;
      }
    }

    this.recentHashes.push({ hash, timestamp });
    if (this.recentHashes.length > this.maxWindow) {
      this.recentHashes.shift();
    }
    return false;
  }

  public clear(): void {
    this.recentHashes = [];
  }

  public get count(): number {
    return this.recentHashes.length;
  }
}
