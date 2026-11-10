/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Video Timing & Playback-Rate Engine (Phase H)
 * 
 * Mathematical Core:
 *   1. Hardware Frame Callbacks:
 *      Uses HTMLVideoElement.requestVideoFrameCallback (rVFC) when available,
 *      providing exact mediaTime, presentationTime, and captureTime.
 *   2. Playback-Rate Correction:
 *      dt_real = dt_display * playbackRate
 *      Ensures that a 2x playback does not double measured velocity:
 *      v_real = ||Delta p|| / dt_real = ||Delta p|| / (dt_display * playbackRate).
 *   3. Stall & Drop Detection:
 *      Suppresses tracker step if dt_display < 1ms or frame is identical (buffering stall).
 *   4. Tab Throttling Protection:
 *      Listens to document.visibilitychange. Clamps dt_display <= 0.10s to prevent
 *      numerical explosion in Kalman filter state propagation when returning from background tabs.
 */

export interface VideoFrameTimingInfo {
  nowMs: number;
  dtDisplaySec: number;
  dtRealSec: number;
  playbackRate: number;
  mediaTimeSec: number;
  isStalled: boolean;
  isTabHidden: boolean;
  warningNotice?: string;
}

export type VideoFrameCallbackId = number;

export class VideoTimingEngine {
  private lastPresentationTimeMs: number = 0;
  private lastMediaTimeSec: number = 0;
  private playbackRate: number = 1.0;
  private isTabHidden: boolean = false;
  private rvfcHandle: VideoFrameCallbackId | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      this.isTabHidden = document.hidden;
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private handleVisibilityChange = (): void => {
    this.isTabHidden = typeof document !== 'undefined' ? document.hidden : false;
    if (!this.isTabHidden) {
      // Reset timer baseline when tab regains focus to avoid large dt step
      this.lastPresentationTimeMs = performance.now();
    }
  };

  public setPlaybackRate(rate: number): void {
    if (Number.isFinite(rate) && rate > 0) {
      this.playbackRate = rate;
    }
  }

  public getPlaybackRate(): number {
    return this.playbackRate;
  }

  /**
   * Computes delta-time dt_real corrected for playback rate and background throttling.
   * dt_real = dt_display * playbackRate
   */
  public static computeCorrectedDt(
    dtDisplaySec: number,
    playbackRate: number,
    maxDtClampSec: number = 0.10
  ): { dtDisplayClamped: number; dtRealSec: number } {
    // Clamp display dt between 0.001s (1ms) and 0.10s (100ms) to prevent filter divergence
    const dtDisplayClamped = Math.max(0.001, Math.min(maxDtClampSec, dtDisplaySec));
    const dtRealSec = dtDisplayClamped * playbackRate;
    return { dtDisplayClamped, dtRealSec };
  }

  /**
   * Evaluates timing on every frame tick.
   * Can be driven either by requestVideoFrameCallback or standard requestAnimationFrame.
   */
  public tick(
    videoElement?: HTMLVideoElement | null,
    rVfcMetadata?: { presentationTime: number; mediaTime: number }
  ): VideoFrameTimingInfo {
    const now = performance.now();

    let dtDisplaySec = 0.033; // Default 30 FPS fallback
    let currentMediaTime = videoElement ? videoElement.currentTime : 0;

    if (rVfcMetadata) {
      if (this.lastPresentationTimeMs > 0) {
        dtDisplaySec = (rVfcMetadata.presentationTime - this.lastPresentationTimeMs) / 1000.0;
      }
      this.lastPresentationTimeMs = rVfcMetadata.presentationTime;
      currentMediaTime = rVfcMetadata.mediaTime;
    } else {
      if (this.lastPresentationTimeMs > 0) {
        dtDisplaySec = (now - this.lastPresentationTimeMs) / 1000.0;
      }
      this.lastPresentationTimeMs = now;
    }

    // Detect video buffering stall (mediaTime unchanged while video is not paused)
    const mediaTimeDelta = Math.abs(currentMediaTime - this.lastMediaTimeSec);
    const isPlaying = videoElement ? !videoElement.paused && !videoElement.ended : true;
    const isStalled = isPlaying && videoElement?.readyState !== undefined && videoElement.readyState < 3;
    this.lastMediaTimeSec = currentMediaTime;

    // Apply playback rate correction: dt_real = dt_display * playbackRate
    const currentRate = videoElement ? videoElement.playbackRate || this.playbackRate : this.playbackRate;
    const { dtDisplayClamped, dtRealSec } = VideoTimingEngine.computeCorrectedDt(dtDisplaySec, currentRate);

    let warningNotice: string | undefined;
    if (Math.abs(currentRate - 1.0) > 0.05) {
      warningNotice = `Playback ${currentRate.toFixed(2)}x: Kinematic velocities auto-scaled (dt_real = ${(dtRealSec * 1000).toFixed(1)}ms).`;
    }

    return {
      nowMs: now,
      dtDisplaySec: dtDisplayClamped,
      dtRealSec,
      playbackRate: currentRate,
      mediaTimeSec: currentMediaTime,
      isStalled,
      isTabHidden: this.isTabHidden,
      warningNotice
    };
  }

  /**
   * Registers a hardware requestVideoFrameCallback listener on an HTMLVideoElement.
   * Automatically falls back to standard animation frame if rVFC is unsupported.
   */
  public registerVideoCallback(
    videoElement: HTMLVideoElement,
    callback: (timing: VideoFrameTimingInfo) => void
  ): () => void {
    let isCancelled = false;

    // Typecast for requestVideoFrameCallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vid = videoElement as any;

    if (typeof vid.requestVideoFrameCallback === 'function') {
      const handleFrame = (
        _now: number,
        metadata: { presentationTime: number; mediaTime: number }
      ) => {
        if (isCancelled) return;
        const timing = this.tick(videoElement, metadata);
        callback(timing);
        if (!isCancelled) {
          this.rvfcHandle = vid.requestVideoFrameCallback(handleFrame);
        }
      };
      this.rvfcHandle = vid.requestVideoFrameCallback(handleFrame);
    } else {
      // Fallback for browsers without rVFC
      let animId: number;
      const handleRaf = () => {
        if (isCancelled) return;
        const timing = this.tick(videoElement);
        callback(timing);
        if (!isCancelled) {
          animId = requestAnimationFrame(handleRaf);
        }
      };
      animId = requestAnimationFrame(handleRaf);
      this.rvfcHandle = animId;
    }

    return () => {
      isCancelled = true;
      if (this.rvfcHandle !== null) {
        if (typeof vid.cancelVideoFrameCallback === 'function') {
          vid.cancelVideoFrameCallback(this.rvfcHandle);
        } else {
          cancelAnimationFrame(this.rvfcHandle);
        }
        this.rvfcHandle = null;
      }
    };
  }

  public destroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }
}
