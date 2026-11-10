/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - useVideo Hook
 * 
 * Manages full-featured HTMLVideoElement lifecycle, HLS/DASH/MP4 streaming,
 * crossOrigin = 'anonymous' negotiation, and seamless fallback to 'watch_only' mode
 * when remote video hosts omit CORS headers.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { OnlinePlayerParser, StreamFormat } from '../core/sources/onlinePlayerParser';

export type CorsStatus = 'checking' | 'cors_allowed' | 'watch_only' | 'error';
export type VideoPlaybackStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

export interface UseVideoOptions {
  autoPlay?: boolean;
  loop?: boolean;
  initialPlaybackRate?: number;
  initialMuted?: boolean;
}

export interface UseVideoReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoElement: HTMLVideoElement | null;
  status: VideoPlaybackStatus;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isBuffering: boolean;
  corsMode: CorsStatus;
  streamType: StreamFormat;
  errorMessage: string | null;
  currentUrl: string;
  loadSource: (source: string | File, options?: { autoPlay?: boolean }) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  setSpeed: (rate: number) => void;
  setVol: (volume: number) => void;
  toggleMute: () => void;
  cleanup: () => void;
}

export function useVideo(options: UseVideoOptions = {}): UseVideoReturn {
  const {
    autoPlay = false,
    loop = true,
    initialPlaybackRate = 1.0,
    initialMuted = true
  } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  const [status, setStatus] = useState<VideoPlaybackStatus>('idle');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(initialPlaybackRate);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(initialMuted);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [corsMode, setCorsMode] = useState<CorsStatus>('checking');
  const [streamType, setStreamType] = useState<StreamFormat>('unknown');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>('');

  // Clean up object URLs
  const cleanupBlobUrl = useCallback(() => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
  }, []);

  // Check CORS access
  const checkCors = useCallback(async (videoEl: HTMLVideoElement) => {
    setCorsMode('checking');
    const probe = await OnlinePlayerParser.probeCorsPixelAccess(videoEl);
    if (probe.allowed) {
      setCorsMode('cors_allowed');
    } else {
      setCorsMode('watch_only');
      console.warn('Video CORS probe restricted pixel reading; fallback to watch-only mode:', probe.error);
    }
  }, []);

  // Load a video source
  const loadSource = useCallback(async (source: string | File, loadOpts?: { autoPlay?: boolean }) => {
    cleanupBlobUrl();
    setErrorMessage(null);
    setStatus('loading');
    setCorsMode('checking');

    let resolvedUrl = '';
    let detectedFormat: StreamFormat = 'direct';

    if (source instanceof File) {
      const blobUrl = URL.createObjectURL(source);
      activeBlobUrlRef.current = blobUrl;
      resolvedUrl = blobUrl;
      detectedFormat = OnlinePlayerParser.detectFormat('', source);
    } else if (typeof source === 'string') {
      const validation = OnlinePlayerParser.validate(source);
      if (!validation.isValid) {
        setStatus('error');
        setErrorMessage(validation.error || 'Invalid video source');
        return;
      }
      resolvedUrl = validation.url;
      detectedFormat = validation.format;
    }

    setStreamType(detectedFormat);
    setCurrentUrl(resolvedUrl);

    const video = videoRef.current;
    if (!video) return;

    // Reset video state
    video.pause();
    video.loop = loop;
    video.muted = isMuted;
    video.playbackRate = playbackRate;

    // Try crossOrigin = 'anonymous' first for AI & depth inspection
    video.crossOrigin = 'anonymous';

    // Handle HLS streams if browser natively supports or fallback
    if (detectedFormat === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl')) {
      // If Hls.js is loaded in window or runtime
      const win = window as unknown as { Hls?: { isSupported: () => boolean; new(): { loadSource: (u: string) => void; attachMedia: (v: HTMLVideoElement) => void } } };
      if (win.Hls && win.Hls.isSupported()) {
        const hls = new win.Hls();
        hls.loadSource(resolvedUrl);
        hls.attachMedia(video);
      } else {
        video.src = resolvedUrl;
      }
    } else {
      video.src = resolvedUrl;
    }

    video.load();

    const shouldPlay = loadOpts?.autoPlay ?? autoPlay;
    if (shouldPlay) {
      video.play().catch(() => {
        // Autoplay may be deferred until user interaction
      });
    }
  }, [cleanupBlobUrl, loop, isMuted, playbackRate, autoPlay]);

  // Player controls
  const play = useCallback(async () => {
    if (videoRef.current) {
      try {
        await videoRef.current.play();
      } catch (err: unknown) {
        console.debug('Playback request interrupted:', err);
      }
    }
  }, []);

  const pause = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      play();
    } else {
      pause();
    }
  }, [play, pause]);

  const seek = useCallback((seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(seconds, videoRef.current.duration || 0));
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const setSpeed = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }, []);

  const setVol = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolume(clamped);
    if (videoRef.current) {
      videoRef.current.volume = clamped;
      if (clamped > 0 && videoRef.current.muted) {
        videoRef.current.muted = false;
        setIsMuted(false);
      }
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const nextMuted = !videoRef.current.muted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    }
  }, []);

  const cleanup = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    cleanupBlobUrl();
    setStatus('idle');
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [cleanupBlobUrl]);

  // Wire HTMLVideoElement listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadedMetadata = () => {
      setDuration(video.duration || 0);
      setStatus('ready');
      checkCors(video);
    };

    const onCanPlay = () => {
      setIsBuffering(false);
      setStatus((prev) => (prev === 'loading' ? 'ready' : prev));
      checkCors(video);
    };

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const onPlay = () => {
      setIsPlaying(true);
      setStatus('playing');
    };

    const onPause = () => {
      setIsPlaying(false);
      setStatus('paused');
    };

    const onWaiting = () => {
      setIsBuffering(true);
      setStatus('buffering');
    };

    const onEnded = () => {
      setIsPlaying(false);
      setStatus('ended');
    };

    const onError = () => {
      const err = video.error;
      // If error occurred with crossOrigin = 'anonymous', attempt fallback without CORS for watch-only
      if (video.crossOrigin && currentUrl) {
        console.warn('Video failed with crossOrigin="anonymous", falling back to watch-only without crossOrigin');
        video.removeAttribute('crossorigin');
        setCorsMode('watch_only');
        video.src = currentUrl;
        video.load();
        video.play().catch(() => {});
        return;
      }

      setStatus('error');
      setIsBuffering(false);
      setCorsMode('error');
      setErrorMessage(
        err ? `Media Error code ${err.code}: ${err.message || 'Failed to decode video'}` : 'Video playback failed'
      );
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
    };
  }, [checkCors, currentUrl]);

  return {
    videoRef,
    videoElement: videoRef.current,
    status,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    volume,
    isMuted,
    isBuffering,
    corsMode,
    streamType,
    errorMessage,
    currentUrl,
    loadSource,
    play,
    pause,
    togglePlay,
    seek,
    setSpeed,
    setVol,
    toggleMute,
    cleanup
  };
}
