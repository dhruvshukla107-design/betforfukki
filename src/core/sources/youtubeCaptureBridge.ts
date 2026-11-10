/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - YouTube Capture Bridge & Region Capture (Phase G)
 * 
 * Key Principles:
 *   1. Cross-Origin IFrame Isolation: Pixels never come directly from the iframe (browser security restriction).
 *   2. Region Capture (Chromium): Uses CropTarget.fromElement(stage) + track.cropTo(cropTarget) to capture
 *      ONLY the video player area, avoiding recursive feedback loops where the app analyses its own overlay boxes.
 *   3. Firefox / Safari Fallback: Gracefully handles environments without CropTarget by providing
 *      guided window-selection or direct file / simulated stream fallback.
 *   4. YouTube IFrame Player API: Dynamic loader with play/pause, seekTo, playbackRate (0.25x-2.0x),
 *      and error taxonomy mapping (codes 2, 5, 100, 101, 150).
 */

export interface YouTubePlayerState {
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  errorCode?: number;
  errorMessage?: string;
}

export type PlayerStateCallback = (state: Partial<YouTubePlayerState>) => void;

// Type definition for Chromium Region Capture CropTarget API
declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    YT?: any;
    CropTarget?: {
      fromElement(element: Element): Promise<unknown>;
    };
  }

  interface MediaStreamTrack {
    cropTo?(cropTarget: unknown): Promise<void>;
  }
}

export class YouTubeCaptureBridge {
  private static isApiLoaded = false;
  private static apiLoadPromise: Promise<void> | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private player: any = null;
  private activeStream: MediaStream | null = null;
  private hiddenVideo: HTMLVideoElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  /**
   * Loads YouTube IFrame API script once safely.
   */
  public static loadIFrameAPI(): Promise<void> {
    if (YouTubeCaptureBridge.isApiLoaded && window.YT && window.YT.Player) {
      return Promise.resolve();
    }
    if (YouTubeCaptureBridge.apiLoadPromise) {
      return YouTubeCaptureBridge.apiLoadPromise;
    }

    YouTubeCaptureBridge.apiLoadPromise = new Promise<void>((resolve, reject) => {
      // Check if already injected
      if (document.getElementById('yt-iframe-api-script')) {
        const checkInterval = setInterval(() => {
          if (window.YT && window.YT.Player) {
            clearInterval(checkInterval);
            YouTubeCaptureBridge.isApiLoaded = true;
            resolve();
          }
        }, 100);
        return;
      }

      window.onYouTubeIframeAPIReady = () => {
        YouTubeCaptureBridge.isApiLoaded = true;
        resolve();
      };

      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.onerror = () => reject(new Error('Failed to load YouTube IFrame API script.'));
      document.head.appendChild(tag);
    });

    return YouTubeCaptureBridge.apiLoadPromise;
  }

  /**
   * Translates YouTube IFrame error codes into user-friendly explanations.
   */
  public static mapErrorCode(code: number): string {
    switch (code) {
      case 2:
        return 'Invalid video link or malformed parameter (Error 2).';
      case 5:
        return 'HTML5 player error: this video cannot be played in this browser context (Error 5).';
      case 100:
        return 'Video not found, private, or has been removed (Error 100).';
      case 101:
      case 150:
        return 'The video owner does not allow playback in embedded third-party players (Error 150). Try another video or upload a file.';
      default:
        return `Playback error code: ${code}.`;
    }
  }

  /**
   * Creates YouTube Player instance inside container element.
   */
  public async initPlayer(
    containerId: string,
    videoId: string,
    startTimeSec: number = 0,
    onStateChange: PlayerStateCallback
  ): Promise<void> {
    await YouTubeCaptureBridge.loadIFrameAPI();

    if (this.player) {
      try {
        this.player.destroy();
      } catch {
        // ignore
      }
      this.player = null;
    }

    return new Promise<void>((resolve) => {
      this.player = new window.YT.Player(containerId, {
        videoId,
        playerVars: {
          autoplay: 1,
          mute: 1, // Muted needed for automatic autoplay in modern browsers
          controls: 1,
          rel: 0,
          start: startTimeSec,
          enablejsapi: 1,
          origin: window.location.origin,
          playsinline: 1
        },
        events: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onReady: (event: any) => {
            onStateChange({
              isReady: true,
              duration: event.target.getDuration ? event.target.getDuration() : 0,
              playbackRate: event.target.getPlaybackRate ? event.target.getPlaybackRate() : 1
            });
            resolve();
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStateChange: (event: any) => {
            const isPlaying = event.data === window.YT.PlayerState.PLAYING;
            onStateChange({
              isPlaying,
              currentTime: event.target.getCurrentTime ? event.target.getCurrentTime() : 0
            });
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onError: (event: any) => {
            const code = event.data;
            const message = YouTubeCaptureBridge.mapErrorCode(code);
            onStateChange({ errorCode: code, errorMessage: message });
          }
        }
      });
    });
  }

  public play(): void {
    if (this.player && this.player.playVideo) {
      this.player.playVideo();
    }
  }

  public pause(): void {
    if (this.player && this.player.pauseVideo) {
      this.player.pauseVideo();
    }
  }

  public seekTo(seconds: number): void {
    if (this.player && this.player.seekTo) {
      this.player.seekTo(seconds, true);
    }
  }

  public setPlaybackRate(rate: number): void {
    if (this.player && this.player.setPlaybackRate) {
      this.player.setPlaybackRate(rate);
    }
  }

  public getCurrentTime(): number {
    return this.player && this.player.getCurrentTime ? this.player.getCurrentTime() : 0;
  }

  public getDuration(): number {
    return this.player && this.player.getDuration ? this.player.getDuration() : 0;
  }

  /**
   * Initiates Screen / Region Capture for the player stage.
   * Uses Region Capture (CropTarget) when supported by browser to isolate only the player stage.
   */
  public async startCapture(
    stageElement: HTMLElement
  ): Promise<{ stream: MediaStream; videoElement: HTMLVideoElement; isRegionCropped: boolean }> {
    // 1. Check getDisplayMedia availability
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error(
        'Screen / tab capture is not supported in this browser environment. Use Upload File or local webcam.'
      );
    }

    // 2. Request tab stream
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const displayOptions: any = {
      video: {
        frameRate: { ideal: 30, max: 30 },
        cursor: 'never'
      },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include'
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(displayOptions);
    } catch (err: unknown) {
      const errorStr = String(err);
      if (errorStr.includes('NotAllowedError') || errorStr.includes('Permission denied')) {
        throw new Error('Screen capture permission was denied. Please re-open and select this tab.');
      }
      throw err;
    }

    this.activeStream = stream;
    let isRegionCropped = false;

    // 3. Region Capture: Crop to stageElement if supported (Chromium 104+)
    const videoTrack = stream.getVideoTracks()[0];
    if (window.CropTarget && typeof window.CropTarget.fromElement === 'function' && videoTrack && videoTrack.cropTo) {
      try {
        const cropTarget = await window.CropTarget.fromElement(stageElement);
        await videoTrack.cropTo(cropTarget);
        isRegionCropped = true;
      } catch (cropErr) {
        console.warn('Region Capture (cropTo) failed or not permitted, falling back to full tab:', cropErr);
      }
    }

    // 4. Create internal hidden <video> to feed pipeline
    if (!this.hiddenVideo) {
      this.hiddenVideo = document.createElement('video');
      this.hiddenVideo.muted = true;
      this.hiddenVideo.playsInline = true;
      this.hiddenVideo.autoplay = true;
      this.hiddenVideo.style.position = 'fixed';
      this.hiddenVideo.style.opacity = '0';
      this.hiddenVideo.style.pointerEvents = 'none';
      this.hiddenVideo.style.zIndex = '-9999';
      document.body.appendChild(this.hiddenVideo);
    }

    this.hiddenVideo.srcObject = stream;
    await this.hiddenVideo.play().catch(() => {});

    return {
      stream,
      videoElement: this.hiddenVideo,
      isRegionCropped
    };
  }

  /**
   * Stops active display capture stream and cleans up tracks.
   */
  public stopCapture(): void {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((t) => t.stop());
      this.activeStream = null;
    }
    if (this.hiddenVideo) {
      this.hiddenVideo.pause();
      this.hiddenVideo.srcObject = null;
    }
  }

  /**
   * Keeps overlay canvas pixel dimensions strictly aligned with the stage element.
   */
  public setupOverlayAlignment(
    stageElement: HTMLElement,
    canvasElement: HTMLCanvasElement
  ): () => void {
    const updateSize = () => {
      const rect = stageElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);

      if (canvasElement.width !== targetW || canvasElement.height !== targetH) {
        canvasElement.width = targetW;
        canvasElement.height = targetH;
      }
      canvasElement.style.width = `${rect.width}px`;
      canvasElement.style.height = `${rect.height}px`;
    };

    updateSize();

    this.resizeObserver = new ResizeObserver(() => {
      updateSize();
    });

    this.resizeObserver.observe(stageElement);

    return () => {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
    };
  }

  /**
   * Cleans up all resources, observers, and player instances.
   */
  public destroy(): void {
    this.stopCapture();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.player) {
      try {
        this.player.destroy();
      } catch {
        // ignore
      }
      this.player = null;
    }
    if (this.hiddenVideo && this.hiddenVideo.parentNode) {
      this.hiddenVideo.parentNode.removeChild(this.hiddenVideo);
      this.hiddenVideo = null;
    }
  }
}
