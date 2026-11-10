/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Online Player URL Parser & Stream Format Detector
 * 
 * Capabilities:
 *   1. Robust URL validation: parses http, https, blob, and data schemes.
 *   2. Stream format detection: detects HLS (.m3u8), DASH (.mpd), MP4 (.mp4), WebM (.webm).
 *   3. CORS validation & Probe helper: checks if an online video allows pixel inspection.
 *   4. Curated benchmark video feeds (Creative Commons / Public Domain) for testing.
 */

export type StreamFormat = 'hls' | 'dash' | 'mp4' | 'webm' | 'direct' | 'unknown';

export interface StreamValidationResult {
  isValid: boolean;
  url: string;
  format: StreamFormat;
  formatLabel: string;
  error?: string;
}

export interface ExampleOnlineClip {
  label: string;
  url: string;
  format: StreamFormat;
  description: string;
}

export class OnlinePlayerParser {
  private static readonly HLS_REGEX = /\.(m3u8)($|\?)/i;
  private static readonly DASH_REGEX = /\.(mpd)($|\?)/i;
  private static readonly MP4_REGEX = /\.(mp4|m4v)($|\?)/i;
  private static readonly WEBM_REGEX = /\.(webm)($|\?)/i;

  /**
   * Validates a video source URL and detects stream format.
   */
  public static validate(inputUrl: string): StreamValidationResult {
    const trimmed = (inputUrl || '').trim();

    if (!trimmed) {
      return {
        isValid: false,
        url: '',
        format: 'unknown',
        formatLabel: 'Unknown',
        error: 'Please enter a video URL.'
      };
    }

    // Support blob: URLs from local file inputs
    if (trimmed.startsWith('blob:')) {
      return {
        isValid: true,
        url: trimmed,
        format: 'direct',
        formatLabel: 'Local File Blob'
      };
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      return {
        isValid: false,
        url: trimmed,
        format: 'unknown',
        formatLabel: 'Invalid',
        error: 'Invalid URL format. Include http:// or https://'
      };
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        isValid: false,
        url: trimmed,
        format: 'unknown',
        formatLabel: 'Unsupported Protocol',
        error: `Protocol "${parsedUrl.protocol}" is not supported. Use http:// or https://`
      };
    }

    // Detect format from path and query
    const fullPath = parsedUrl.pathname + parsedUrl.search;
    const format = this.detectFormat(fullPath);
    const formatLabel = this.getFormatLabel(format);

    return {
      isValid: true,
      url: trimmed,
      format,
      formatLabel
    };
  }

  /**
   * Detects stream format from URL string or file object.
   */
  public static detectFormat(pathOrMime: string, file?: File | null): StreamFormat {
    if (file) {
      if (file.type.includes('mp4')) return 'mp4';
      if (file.type.includes('webm')) return 'webm';
      if (file.name.endsWith('.m3u8')) return 'hls';
      if (file.name.endsWith('.mpd')) return 'dash';
      return 'direct';
    }

    const str = pathOrMime.toLowerCase();
    if (this.HLS_REGEX.test(str) || str.includes('application/x-mpegurl') || str.includes('vnd.apple.mpegurl')) {
      return 'hls';
    }
    if (this.DASH_REGEX.test(str) || str.includes('application/dash+xml')) {
      return 'dash';
    }
    if (this.MP4_REGEX.test(str) || str.includes('video/mp4')) {
      return 'mp4';
    }
    if (this.WEBM_REGEX.test(str) || str.includes('video/webm')) {
      return 'webm';
    }

    // Default to direct HTTP stream
    return 'direct';
  }

  public static getFormatLabel(format: StreamFormat): string {
    switch (format) {
      case 'hls':
        return 'HLS Stream (.m3u8)';
      case 'dash':
        return 'DASH Stream (.mpd)';
      case 'mp4':
        return 'MP4 Video (.mp4)';
      case 'webm':
        return 'WebM Video (.webm)';
      case 'direct':
        return 'Direct Video Stream';
      default:
        return 'Standard Video';
    }
  }

  /**
   * Tests whether an HTMLVideoElement can be captured into a 2D canvas without CORS tainting.
   */
  public static async probeCorsPixelAccess(video: HTMLVideoElement): Promise<{
    allowed: boolean;
    error?: string;
  }> {
    return new Promise((resolve) => {
      try {
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 16;
        testCanvas.height = 16;
        const ctx = testCanvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve({ allowed: true });
          return;
        }

        ctx.drawImage(video, 0, 0, 16, 16);
        // Attempt pixel read - will throw SecurityError if canvas is tainted by cross-origin video
        ctx.getImageData(0, 0, 1, 1);
        resolve({ allowed: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        resolve({
          allowed: false,
          error: `CORS pixel read blocked (${msg}). Watch-only mode enabled.`
        });
      }
    });
  }

  /**
   * Benchmark sample feeds for instant testing in the UI.
   */
  public static getBenchmarkClips(): ExampleOnlineClip[] {
    return [
      {
        label: 'Traffic Sample (MP4)',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        format: 'mp4',
        description: 'Google GTV Sample Video with full CORS access for testing.'
      },
      {
        label: 'Big Buck Bunny (MP4)',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        format: 'mp4',
        description: 'Open source animated benchmark clip.'
      },
      {
        label: 'Tears of Steel (MP4)',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
        format: 'mp4',
        description: 'VFX benchmark film clip with humans & motion dynamics.'
      },
      {
        label: 'Mux Test (HLS)',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        format: 'hls',
        description: 'Standard HLS test stream.'
      },
      {
        label: 'Akamai BBB (DASH)',
        url: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd',
        format: 'dash',
        description: 'Akamai public DASH reference stream.'
      }
    ];
  }
}
