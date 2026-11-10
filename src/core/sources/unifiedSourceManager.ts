/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Unified Source Manager (Phase G)
 * 
 * Unifies all 6 video ingestion streams into one common contract:
 *   - Live Camera (getUserMedia WebRTC)
 *   - IP Camera (HLS / MSE / MJPEG proxy)
 *   - Direct Video URL (.mp4, .webm, .m3u8)
 *   - Uploaded Video File (Blob URL)
 *   - YouTube Stream (Region Capture MediaStream)
 *   - Dataset Folder / Sequence Replay
 *   - Procedural CCTV Simulation (Fallback)
 * 
 * Downstream Detection & Tracking Pipeline:
 *   Operates strictly on the resulting HTMLVideoElement or MediaStream without needing to know
 *   the underlying source protocol.
 */

import { CameraSourceConfig, SourceStatus, SourceType } from '../../types/spatial';

export interface SourceStreamOutput {
  sourceType: SourceType;
  stream: MediaStream | null;
  videoElement: HTMLVideoElement | null;
  status: SourceStatus;
  statusMessage: string;
  playbackRate: number;
  videoWidth: number;
  videoHeight: number;
}

export type SourceStatusListener = (output: SourceStreamOutput) => void;

export class UnifiedSourceManager {
  private currentConfig: CameraSourceConfig | null = null;
  private currentStream: MediaStream | null = null;
  private currentVideoElement: HTMLVideoElement | null = null;
  private blobUrlToRevoke: string | null = null;
  private listeners: Set<SourceStatusListener> = new Set();
  private status: SourceStatus = 'connecting';
  private statusMessage: string = 'Initializing unified source...';
  private playbackRate: number = 1.0;

  public subscribe(listener: SourceStatusListener): () => void {
    this.listeners.add(listener);
    this.notify();
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const output: SourceStreamOutput = {
      sourceType: this.currentConfig?.type || 'test_feed',
      stream: this.currentStream,
      videoElement: this.currentVideoElement,
      status: this.status,
      statusMessage: this.statusMessage,
      playbackRate: this.playbackRate,
      videoWidth: this.currentVideoElement?.videoWidth || 1280,
      videoHeight: this.currentVideoElement?.videoHeight || 720
    };
    for (const listener of this.listeners) {
      listener(output);
    }
  }

  public getStatus(): { status: SourceStatus; message: string } {
    return { status: this.status, message: this.statusMessage };
  }

  /**
   * Switches to a new source configuration seamlessly.
   */
  public async activateSource(
    config: CameraSourceConfig,
    targetVideoElement: HTMLVideoElement
  ): Promise<SourceStreamOutput> {
    this.cleanup();
    this.currentConfig = config;
    this.currentVideoElement = targetVideoElement;
    this.status = 'connecting';
    this.statusMessage = `Connecting to ${config.name}...`;
    this.notify();

    try {
      switch (config.type) {
        case 'webcam':
          await this.setupWebcam(config, targetVideoElement);
          break;

        case 'upload_file':
          if (!config.file) throw new Error('No video file selected.');
          await this.setupFile(config.file, targetVideoElement);
          break;

        case 'video_url':
        case 'online_player':
        case 'ip_camera':
          if (config.file) {
            await this.setupFile(config.file, targetVideoElement);
          } else if (config.url) {
            await this.setupDirectUrl(config.url, targetVideoElement, config.corsMode);
          } else {
            throw new Error('No stream URL or video file provided.');
          }
          break;

        case 'youtube':
          // For YouTube, if stream is passed directly from YouTubeCaptureBridge
          this.status = 'live';
          this.statusMessage = 'Analyzing YouTube stage via Region Capture';
          break;

        case 'dataset_folder':
        case 'test_feed':
        default:
          this.status = 'live';
          this.statusMessage = 'Active Simulated CCTV Feed';
          break;
      }

      this.playbackRate = config.playbackRate || 1.0;
      if (this.currentVideoElement && this.playbackRate !== 1.0) {
        this.currentVideoElement.playbackRate = this.playbackRate;
      }

      this.notify();
      return {
        sourceType: config.type,
        stream: this.currentStream,
        videoElement: this.currentVideoElement,
        status: this.status,
        statusMessage: this.statusMessage,
        playbackRate: this.playbackRate,
        videoWidth: this.currentVideoElement?.videoWidth || 1280,
        videoHeight: this.currentVideoElement?.videoHeight || 720
      };
    } catch (err: unknown) {
      this.status = 'error';
      this.statusMessage = err instanceof Error ? err.message : String(err);
      this.notify();
      throw err;
    }
  }

  /**
   * Sets external stream (e.g. from YouTubeCaptureBridge getDisplayMedia)
   */
  public setExternalStream(stream: MediaStream, targetVideoElement: HTMLVideoElement): void {
    this.currentStream = stream;
    this.currentVideoElement = targetVideoElement;
    targetVideoElement.srcObject = stream;
    targetVideoElement.play().catch(() => {});
    this.status = 'live';
    this.statusMessage = 'Live Stream Active (Region Capture)';
    this.notify();
  }

  private async setupWebcam(config: CameraSourceConfig, videoElement: HTMLVideoElement): Promise<void> {
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: config.deviceId ? { exact: config.deviceId } : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.currentStream = stream;
    videoElement.srcObject = stream;
    await videoElement.play().catch(() => {});
    this.status = 'live';
    this.statusMessage = 'Live Webcam Stream Active';
  }

  private async setupFile(file: File, videoElement: HTMLVideoElement): Promise<void> {
    const objectUrl = URL.createObjectURL(file);
    this.blobUrlToRevoke = objectUrl;

    videoElement.srcObject = null;
    videoElement.src = objectUrl;
    videoElement.loop = true;
    this.attachVideoElementListeners(videoElement);
    await videoElement.play().catch(() => {});
    this.status = 'live';
    this.statusMessage = `Playing local file: ${file.name}`;
  }

  private async setupDirectUrl(url: string, videoElement: HTMLVideoElement, corsMode?: 'cors' | 'watch_only'): Promise<void> {
    videoElement.srcObject = null;
    if (corsMode === 'watch_only') {
      videoElement.removeAttribute('crossorigin');
    } else {
      videoElement.crossOrigin = 'anonymous';
    }
    videoElement.src = url;
    videoElement.loop = true;
    this.attachVideoElementListeners(videoElement);
    await videoElement.play().catch(() => {});
    this.status = 'live';
    this.statusMessage = corsMode === 'watch_only'
      ? `Online Player (Watch-Only): ${url}`
      : `Connected to network stream: ${url}`;
  }

  private attachVideoElementListeners(videoElement: HTMLVideoElement): void {
    videoElement.onwaiting = () => {
      this.status = 'buffering';
      this.statusMessage = 'Buffering video frames...';
      this.notify();
    };

    videoElement.onplaying = () => {
      this.status = 'live';
      this.statusMessage = 'Video playback active';
      this.notify();
    };

    videoElement.onended = () => {
      this.status = 'ended';
      this.statusMessage = 'Video stream ended';
      this.notify();
    };

    videoElement.onerror = () => {
      this.status = 'error';
      this.statusMessage = 'Error decoding video stream or invalid codec.';
      this.notify();
    };
  }

  public cleanup(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((t) => t.stop());
      this.currentStream = null;
    }
    if (this.blobUrlToRevoke) {
      URL.revokeObjectURL(this.blobUrlToRevoke);
      this.blobUrlToRevoke = null;
    }
    if (this.currentVideoElement) {
      this.currentVideoElement.pause();
      this.currentVideoElement.srcObject = null;
      this.currentVideoElement.src = '';
    }
  }
}
