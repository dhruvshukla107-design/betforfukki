/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Unified Source Picker & Online Player Lab (Phase G)
 * 
 * Features:
 *   - Big Tabs: [Online Player] [YouTube] [Live Camera] [Upload File] [IP Camera] [Video URL] [Simulated CCTV]
 *   - Live Status: Connecting / Live / Buffering / Ended / Error
 *   - Online Player with URL validation, HLS/DASH/MP4/WebM detection, CORS anonymous negotiation,
 *     'Watch only' fallback mode if CORS headers are missing, and full player controls.
 *   - YouTube Tab with strict URL validation, example chips, embedded player stage (<div id="stage">),
 *     Region Capture (CropTarget) activation, playback rate control (0.25x - 2x), and privacy consent text.
 */

import React, { useState, useEffect, useRef } from 'react';
import { CameraSourceConfig, SourceStatus, SourceType } from '../types/spatial';
import { YouTubeParser, YouTubeParseResult } from '../core/sources/youtubeParser';
import { YouTubeCaptureBridge, YouTubePlayerState } from '../core/sources/youtubeCaptureBridge';
import { OnlinePlayerParser, StreamFormat, StreamValidationResult } from '../core/sources/onlinePlayerParser';
import { useVideo } from '../hooks/useVideo';
import {
  Camera,
  Globe,
  Link,
  Upload,
  Youtube,
  FolderOpen,
  X,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Sliders,
  ShieldCheck,
  ClipboardPaste,
  ExternalLink,
  Layers,
  Volume2,
  VolumeX,
  Film,
  FileVideo,
  Info
} from 'lucide-react';

interface UnifiedSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSource: CameraSourceConfig;
  onSelectSource: (source: CameraSourceConfig, stream?: MediaStream) => void;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const UnifiedSourceModal: React.FC<UnifiedSourceModalProps> = ({
  isOpen,
  onClose,
  currentSource,
  onSelectSource
}) => {
  const [activeTab, setActiveTab] = useState<SourceType>(
    currentSource.type === 'test_feed' ? 'online_player' : currentSource.type
  );

  // Status indicators
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>(currentSource.status || 'live');
  const [statusMessage, setStatusMessage] = useState<string>(currentSource.statusMessage || 'Ready to connect');

  // =========================================================================
  // ONLINE PLAYER STATE & HOOK
  // =========================================================================
  const [onlineUrlInput, setOnlineUrlInput] = useState<string>(
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
  );
  const [onlineValidation, setOnlineValidation] = useState<StreamValidationResult>(() =>
    OnlinePlayerParser.validate(
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
    )
  );
  const [onlineSelectedFile, setOnlineSelectedFile] = useState<File | null>(null);
  const onlineFileInputRef = useRef<HTMLInputElement | null>(null);

  const onlinePlayer = useVideo({
    autoPlay: true,
    loop: true,
    initialPlaybackRate: 1.0,
    initialMuted: true
  });

  // Handle URL change & validation
  const handleValidateOnlineUrl = (url: string) => {
    setOnlineUrlInput(url);
    setOnlineSelectedFile(null);
    const result = OnlinePlayerParser.validate(url);
    setOnlineValidation(result);
    if (result.isValid) {
      onlinePlayer.loadSource(result.url, { autoPlay: true });
    }
  };

  // Load online video on mount or tab change if valid
  useEffect(() => {
    if (isOpen && activeTab === 'online_player' && onlineValidation.isValid && !onlinePlayer.currentUrl) {
      onlinePlayer.loadSource(onlineValidation.url, { autoPlay: true });
    }
  }, [isOpen, activeTab, onlineValidation.isValid, onlineValidation.url, onlinePlayer]);

  // Handle local file selection inside Online Player
  const handleSelectOnlineFile = (file: File) => {
    setOnlineSelectedFile(file);
    setOnlineUrlInput(`Local File: ${file.name}`);
    const detected = OnlinePlayerParser.detectFormat('', file);
    setOnlineValidation({
      isValid: true,
      url: file.name,
      format: detected,
      formatLabel: `Local File (${file.type || detected.toUpperCase()})`
    });
    onlinePlayer.loadSource(file, { autoPlay: true });
  };

  const handlePasteOnlineClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleValidateOnlineUrl(text);
      }
    } catch {
      // Clipboard denied
    }
  };

  const handleApplyOnlinePlayer = () => {
    const isBlob = onlinePlayer.currentUrl.startsWith('blob:');
    const sourceName = isBlob
      ? (onlineSelectedFile?.name || 'Local Video File')
      : `Online Video (${onlinePlayer.streamType.toUpperCase()})`;

    onSelectSource({
      type: 'online_player',
      name: sourceName,
      url: onlinePlayer.currentUrl,
      file: onlineSelectedFile || undefined,
      status: 'live',
      statusMessage:
        onlinePlayer.corsMode === 'watch_only'
          ? 'Watch-only playback (CORS restricted)'
          : 'Full 3D & AI analysis active',
      playbackRate: onlinePlayer.playbackRate,
      corsMode: onlinePlayer.corsMode === 'watch_only' ? 'watch_only' : 'cors',
      streamType: onlinePlayer.streamType
    });
    onClose();
  };

  // =========================================================================
  // YOUTUBE TAB STATE
  // =========================================================================
  const [youtubeInput, setYoutubeInput] = useState<string>('https://www.youtube.com/watch?v=1EiC9bvVGnk');
  const [youtubeParseResult, setYoutubeParseResult] = useState<YouTubeParseResult>(() =>
    YouTubeParser.parse('https://www.youtube.com/watch?v=1EiC9bvVGnk')
  );
  const [ytPlayerState, setYtPlayerState] = useState<YouTubePlayerState>({
    isReady: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1.0
  });
  const [isCapturingYouTube, setIsCapturingYouTube] = useState<boolean>(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Live Camera Devices
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // IP Camera / Network URL
  const [ipCameraUrl, setIpCameraUrl] = useState<string>('http://192.168.1.100:8080/video');
  const [directVideoUrl, setDirectVideoUrl] = useState<string>(
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
  );

  // Upload File
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // YouTube Player & Stage Ref
  const stageRef = useRef<HTMLDivElement | null>(null);
  const ytBridgeRef = useRef<YouTubeCaptureBridge>(new YouTubeCaptureBridge());

  // Enumerate Camera Devices
  useEffect(() => {
    if (!isOpen) return;

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setCameraDevices(videoInputs);
          if (videoInputs.length > 0 && !selectedDeviceId) {
            setSelectedDeviceId(videoInputs[0].deviceId);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, selectedDeviceId]);

  // Handle YouTube URL Validation & Parsing
  const handleValidateYouTubeUrl = (url: string) => {
    setYoutubeInput(url);
    const parsed = YouTubeParser.parse(url);
    setYoutubeParseResult(parsed);
  };

  // Paste from clipboard helper
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleValidateYouTubeUrl(text);
      }
    } catch {
      // Fallback
    }
  };

  // Mount YouTube Player when entering YouTube Tab
  useEffect(() => {
    if (!isOpen || activeTab !== 'youtube' || !youtubeParseResult.isValid || !youtubeParseResult.videoId) {
      return;
    }

    const bridge = ytBridgeRef.current;
    let isCancelled = false;

    const timer = setTimeout(() => {
      if (isCancelled) return;
      bridge
        .initPlayer('yt-player-frame', youtubeParseResult.videoId!, youtubeParseResult.startTimeSec, (state) => {
          setYtPlayerState((prev) => ({ ...prev, ...state }));
        })
        .catch((err) => {
          console.warn('YouTube IFrame API init warning:', err);
        });
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, activeTab, youtubeParseResult.videoId, youtubeParseResult.startTimeSec, youtubeParseResult.isValid]);

  // Start YouTube Region Capture Analysis
  const handleStartYouTubeAnalysis = async () => {
    if (!stageRef.current) return;
    setCaptureError(null);
    setIsCapturingYouTube(true);
    setSourceStatus('connecting');
    setStatusMessage('Requesting Region Capture for YouTube stage...');

    try {
      const { stream, isRegionCropped } = await ytBridgeRef.current.startCapture(stageRef.current);

      setSourceStatus('live');
      setStatusMessage(
        isRegionCropped
          ? 'Live Analysis Active (Region Cropped to Video Player)'
          : 'Live Analysis Active (Display Tab Share)'
      );

      ytBridgeRef.current.play();

      onSelectSource(
        {
          type: 'youtube',
          name: `YouTube: ${youtubeParseResult.videoId}`,
          youtubeId: youtubeParseResult.videoId,
          startTimeSec: youtubeParseResult.startTimeSec,
          status: 'live',
          statusMessage: 'Streaming via Region Capture',
          playbackRate: ytPlayerState.playbackRate
        },
        stream
      );

      onClose();
    } catch (err: unknown) {
      setIsCapturingYouTube(false);
      setSourceStatus('error');
      const msg = err instanceof Error ? err.message : String(err);
      setCaptureError(msg);
      setStatusMessage(msg);
    }
  };

  // Handle Tab Switch Actions
  const handleApplyWebcam = () => {
    const selectedDev = cameraDevices.find((d) => d.deviceId === selectedDeviceId);
    onSelectSource({
      type: 'webcam',
      name: selectedDev?.label || 'Live Webcam Stream',
      deviceId: selectedDeviceId,
      status: 'live',
      statusMessage: 'Webcam stream active'
    });
    onClose();
  };

  const handleApplyIpCamera = () => {
    onSelectSource({
      type: 'ip_camera',
      name: 'Network IP Camera',
      url: ipCameraUrl,
      status: 'live',
      statusMessage: `IP Feed: ${ipCameraUrl}`
    });
    onClose();
  };

  const handleApplyVideoUrl = () => {
    onSelectSource({
      type: 'video_url',
      name: 'Direct Video URL',
      url: directVideoUrl,
      status: 'live',
      statusMessage: `Stream: ${directVideoUrl}`
    });
    onClose();
  };

  const handleApplyFileUpload = () => {
    if (!selectedFile) return;
    onSelectSource({
      type: 'upload_file',
      name: selectedFile.name,
      file: selectedFile,
      status: 'live',
      statusMessage: `Local file: ${selectedFile.name}`
    });
    onClose();
  };

  const handleApplyTestFeed = () => {
    onSelectSource({
      type: 'test_feed',
      name: 'Simulated CCTV Feed',
      status: 'live',
      statusMessage: 'Synthetic pedestrian & vehicle traffic'
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[92vh] bg-[#16100B] border border-amber-500/25 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[#FDFBF7]">
        {/* Modal Header */}
        <div className="p-4 border-b border-amber-500/20 bg-[#120D0A]/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-[#F59E0B] flex items-center justify-center border border-amber-500/30">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#FEF3C7] tracking-wide font-display">
                Unified Video Source Picker &amp; Online Player
              </h2>
              <p className="text-xs text-[#A89F91]">
                Single pipeline contract: Online Player (HLS/DASH/MP4), YouTube, Live Camera, IP Stream, or Local Files
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Source Status Pill */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(30,20,15,0.8)] border border-amber-500/30 text-xs font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  sourceStatus === 'live'
                    ? 'bg-emerald-400 animate-pulse'
                    : sourceStatus === 'connecting'
                    ? 'bg-amber-400 animate-ping'
                    : sourceStatus === 'buffering'
                    ? 'bg-yellow-400'
                    : 'bg-rose-500'
                }`}
              />
              <span className="capitalize text-[#FEF3C7]">{sourceStatus}</span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#A89F91] hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Big Tabs Navigation Bar */}
        <div className="flex items-center overflow-x-auto bg-[#120D0A]/60 border-b border-amber-500/20 p-2 gap-1.5 shrink-0 text-xs font-semibold">
          {/* Online Player Tab (Fourth source tab added / data-tab="url") */}
          <button
            data-tab="url"
            onClick={() => setActiveTab('online_player')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all shrink-0 font-display ${
              activeTab === 'online_player'
                ? 'bg-gradient-to-r from-[#D97706] to-[#B45309] text-white shadow-lg shadow-amber-950/60 font-bold border border-amber-400/30'
                : 'text-[#A89F91] hover:text-[#FEF3C7] hover:bg-white/5'
            }`}
          >
            <Film className="w-4 h-4 text-amber-300" />
            <span>Online Player</span>
          </button>

          <button
            onClick={() => setActiveTab('youtube')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all shrink-0 font-display ${
              activeTab === 'youtube'
                ? 'bg-red-600 text-white shadow-lg shadow-red-950/60 font-bold'
                : 'text-[#A89F91] hover:text-[#FEF3C7] hover:bg-white/5'
            }`}
          >
            <Youtube className="w-4 h-4 text-red-300" />
            <span>YouTube Stream</span>
          </button>

          <button
            onClick={() => setActiveTab('webcam')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all shrink-0 font-display ${
              activeTab === 'webcam'
                ? 'bg-gradient-to-r from-[#D97706] to-[#B45309] text-white shadow-lg font-bold'
                : 'text-[#A89F91] hover:text-[#FEF3C7] hover:bg-white/5'
            }`}
          >
            <Camera className="w-4 h-4 text-amber-300" />
            <span>Live Camera</span>
          </button>

          <button
            onClick={() => setActiveTab('upload_file')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all shrink-0 font-display ${
              activeTab === 'upload_file'
                ? 'bg-gradient-to-r from-[#D97706] to-[#B45309] text-white shadow-lg font-bold'
                : 'text-[#A89F91] hover:text-[#FEF3C7] hover:bg-white/5'
            }`}
          >
            <Upload className="w-4 h-4 text-amber-300" />
            <span>Upload File</span>
          </button>

          <button
            onClick={() => setActiveTab('ip_camera')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all shrink-0 font-display ${
              activeTab === 'ip_camera'
                ? 'bg-gradient-to-r from-[#D97706] to-[#B45309] text-white shadow-lg font-bold'
                : 'text-[#A89F91] hover:text-[#FEF3C7] hover:bg-white/5'
            }`}
          >
            <Radio className="w-4 h-4 text-amber-300" />
            <span>IP Camera</span>
          </button>

          <button
            onClick={() => setActiveTab('video_url')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all shrink-0 font-display ${
              activeTab === 'video_url'
                ? 'bg-gradient-to-r from-[#D97706] to-[#B45309] text-white shadow-lg font-bold'
                : 'text-[#A89F91] hover:text-[#FEF3C7] hover:bg-white/5'
            }`}
          >
            <Globe className="w-4 h-4 text-amber-300" />
            <span>Direct Video URL</span>
          </button>

          <button
            onClick={() => setActiveTab('test_feed')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all shrink-0 font-display ${
              activeTab === 'test_feed'
                ? 'bg-gradient-to-r from-[#D97706] to-[#B45309] text-white shadow-lg font-bold'
                : 'text-[#A89F91] hover:text-[#FEF3C7] hover:bg-white/5'
            }`}
          >
            <Sliders className="w-4 h-4 text-amber-300" />
            <span>Simulated CCTV</span>
          </button>
        </div>

        {/* Tab Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* =========================================================================
              TAB: ONLINE PLAYER (Full-featured with URL validation & CORS fallback)
          ========================================================================= */}
          {activeTab === 'online_player' && (
            <div className="space-y-4">
              {/* URL Input Bar & Controls */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#FEF3C7] flex items-center justify-between">
                  <span className="font-display">Paste Direct Video URL or Pick Local File:</span>
                  <span className="text-[11px] text-[#A89F91] font-mono">
                    HLS (.m3u8), DASH (.mpd), MP4 (.mp4), WebM (.webm)
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={onlineUrlInput}
                      onChange={(e) => handleValidateOnlineUrl(e.target.value)}
                      placeholder="https://example.com/stream.m3u8 or sample.mp4"
                      className={`w-full bg-[#120D0A] border px-3.5 py-2.5 rounded-xl text-sm font-mono focus:outline-none transition-colors ${
                        onlineValidation.isValid
                          ? 'border-amber-500/60 focus:border-amber-400 text-amber-200'
                          : 'border-red-700/80 focus:border-red-500 text-red-200'
                      }`}
                    />
                  </div>

                  <button
                    onClick={handlePasteOnlineClipboard}
                    className="min-h-[44px] px-3.5 rounded-xl bg-[rgba(30,20,15,0.7)] hover:bg-[rgba(40,25,18,0.9)] text-[#FEF3C7] border border-amber-500/30 flex items-center gap-1.5 text-xs font-medium transition-colors font-display"
                    title="Paste from clipboard"
                  >
                    <ClipboardPaste className="w-4 h-4 text-amber-400" />
                    <span>Paste</span>
                  </button>

                  <input
                    ref={onlineFileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/ogg,video/quicktime,.m3u8,.mpd"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleSelectOnlineFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />

                  <button
                    onClick={() => onlineFileInputRef.current?.click()}
                    className="min-h-[44px] px-3.5 rounded-xl bg-[rgba(30,20,15,0.7)] hover:bg-[rgba(40,25,18,0.9)] text-[#FEF3C7] border border-amber-500/30 flex items-center gap-1.5 text-xs font-medium transition-colors font-display"
                    title="Choose local video file"
                  >
                    <FileVideo className="w-4 h-4 text-emerald-400" />
                    <span>Pick File</span>
                  </button>
                </div>

                {/* Validation and stream format feedback */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {!onlineValidation.isValid && onlineValidation.error ? (
                    <p className="text-xs text-rose-400 flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{onlineValidation.error}</span>
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-[#F59E0B] border border-amber-500/30 font-mono font-bold">
                        Format: {onlineValidation.formatLabel}
                      </span>
                      {onlineSelectedFile && (
                        <span className="text-[#A89F91] text-[11px] font-mono">
                          {(onlineSelectedFile.size / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      )}
                    </div>
                  )}

                  {/* CORS Security Mode Indicator */}
                  <div className="flex items-center gap-2">
                    {onlinePlayer.corsMode === 'cors_allowed' && (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-[11px] font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>CORS Ready (3D &amp; AI Enabled)</span>
                      </span>
                    )}
                    {onlinePlayer.corsMode === 'watch_only' && (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-950/80 border border-amber-600/80 text-amber-300 text-[11px] font-mono">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Watch-Only Mode (CORS restricted)</span>
                      </span>
                    )}
                    {onlinePlayer.corsMode === 'checking' && (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-mono">
                        <Radio className="w-3 h-3 text-amber-400 animate-spin" />
                        <span>Verifying CORS...</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Example Benchmark Link Chips */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#A89F91] font-mono">
                  Benchmark Streams (CORS-Ready / Public Domain):
                </span>
                <div className="flex flex-wrap gap-2">
                  {OnlinePlayerParser.getBenchmarkClips().map((clip, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleValidateOnlineUrl(clip.url)}
                      className="px-2.5 py-1.5 rounded-lg bg-[rgba(30,20,15,0.7)] hover:bg-[rgba(40,25,18,0.9)] border border-amber-500/25 text-xs text-[#FEF3C7] text-left transition-colors flex items-center gap-1.5"
                      title={clip.description}
                    >
                      <Film className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{clip.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Embedded Online Video Player Stage */}
              <div className="relative rounded-2xl overflow-hidden border border-amber-500/20 bg-black aspect-video flex items-center justify-center shadow-inner">
                <video
                  ref={onlinePlayer.videoRef}
                  playsInline
                  className="w-full h-full object-contain"
                />

                {/* Buffering Indicator */}
                {onlinePlayer.isBuffering && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/70 border border-amber-500/30 text-xs text-amber-300 font-mono">
                      <Radio className="w-4 h-4 animate-spin text-amber-400" />
                      <span>Buffering stream...</span>
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {onlinePlayer.status === 'error' && (
                  <div className="absolute inset-0 bg-[#120D0A]/95 flex flex-col items-center justify-center p-6 text-center z-20">
                    <AlertTriangle className="w-10 h-10 text-rose-400 mb-2" />
                    <h4 className="text-sm font-bold text-white mb-1 font-display">Playback Failed</h4>
                    <p className="text-xs text-[#D1C7BD] max-w-md mb-4 font-mono">
                      {onlinePlayer.errorMessage || 'Unable to decode stream from host.'}
                    </p>
                    <button
                      onClick={() => onlinePlayer.loadSource(onlineUrlInput, { autoPlay: true })}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-bold text-white shadow font-display"
                    >
                      Retry Stream
                    </button>
                  </div>
                )}
              </div>

              {/* Full-Featured Video Control Bar (IDs: #pp, #sk, #tm, #mu, #vo, #spd, #ql) */}
              <div className="space-y-2 p-3 rounded-xl bg-[#120D0A]/80 border border-amber-500/20 text-xs">
                {/* Seek Bar (#sk) & Time Display (#tm) */}
                <div className="flex items-center gap-3">
                  <input
                    id="sk"
                    type="range"
                    min="0"
                    max={onlinePlayer.duration || 100}
                    step="0.1"
                    value={onlinePlayer.currentTime || 0}
                    onChange={(e) => onlinePlayer.seek(parseFloat(e.target.value))}
                    className="flex-1 accent-amber-500 cursor-pointer"
                  />
                  <div id="tm" className="font-mono text-[11px] text-[#FEF3C7] shrink-0">
                    {formatTime(onlinePlayer.currentTime)} / {formatTime(onlinePlayer.duration)}
                  </div>
                </div>

                {/* Button Controls Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    {/* Play/Pause Button (#pp) */}
                    <button
                      id="pp"
                      onClick={onlinePlayer.togglePlay}
                      className="p-2 rounded-lg bg-[rgba(30,20,15,0.7)] hover:bg-[rgba(40,25,18,0.9)] text-[#FEF3C7] border border-amber-500/30"
                      title={onlinePlayer.isPlaying ? 'Pause' : 'Play'}
                    >
                      {onlinePlayer.isPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                    </button>

                    {/* Rewind */}
                    <button
                      onClick={() => onlinePlayer.seek(0)}
                      className="p-2 rounded-lg bg-[rgba(30,20,15,0.7)] hover:bg-[rgba(40,25,18,0.9)] text-[#FEF3C7] border border-amber-500/30"
                      title="Rewind to start"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>

                    {/* Mute/Volume (#mu, #vo) */}
                    <div className="flex items-center gap-2 pl-2 border-l border-amber-500/20">
                      <button
                        id="mu"
                        onClick={onlinePlayer.toggleMute}
                        className="p-1.5 rounded-lg text-[#FEF3C7] hover:bg-white/5"
                        title={onlinePlayer.isMuted ? 'Unmute' : 'Mute'}
                      >
                        {onlinePlayer.isMuted ? (
                          <VolumeX className="w-4 h-4 text-amber-400" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-[#FEF3C7]" />
                        )}
                      </button>
                      <input
                        id="vo"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={onlinePlayer.isMuted ? 0 : onlinePlayer.volume}
                        onChange={(e) => onlinePlayer.setVol(parseFloat(e.target.value))}
                        className="w-16 accent-amber-500 cursor-pointer"
                        title="Volume"
                      />
                    </div>
                  </div>

                  {/* Playback Rate Selector (#spd) */}
                  <div id="spd" className="flex items-center gap-1 font-mono">
                    <span className="text-[#A89F91] text-[11px]">Speed:</span>
                    {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => onlinePlayer.setSpeed(rate)}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                          onlinePlayer.playbackRate === rate
                            ? 'bg-amber-600 text-white'
                            : 'bg-black/30 text-[#A89F91] hover:text-white'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  {/* Quality / Format badge (#ql) */}
                  <div id="ql" className="hidden sm:flex items-center gap-1 px-2 py-1 rounded bg-black/40 text-[11px] font-mono text-amber-300 border border-amber-500/20">
                    <span className="uppercase">{onlinePlayer.streamType}</span>
                    <span>•</span>
                    <span>{onlinePlayer.videoElement?.videoWidth || 1280}x{onlinePlayer.videoElement?.videoHeight || 720}</span>
                  </div>
                </div>
              </div>

              {/* Watch Only Explanation Notice */}
              {onlinePlayer.corsMode === 'watch_only' && (
                <div className="p-3 bg-amber-950/40 border border-amber-600/70 rounded-xl text-xs text-amber-200 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-[#F59E0B] font-display">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Watch-Only Fallback Active</span>
                  </div>
                  <p className="leading-relaxed text-[11px] text-amber-200/90">
                    The remote video server did not provide <code>Access-Control-Allow-Origin: *</code> headers.
                    The video can be watched and monitored smoothly in the viewport, but monocular 3D depth extraction and edge AI pixel reading are restricted by browser security.
                  </p>
                </div>
              )}

              {/* Start Analysis Button */}
              <div className="pt-2">
                <button
                  onClick={handleApplyOnlinePlayer}
                  disabled={!onlineValidation.isValid || onlinePlayer.status === 'error'}
                  className="w-full min-h-[48px] py-3 rounded-xl bg-gradient-to-r from-[#D97706] via-[#B45309] to-[#065F46] hover:opacity-95 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-950/60 transition-all active:scale-[0.99] font-display"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    Start Analysis on Online Player
                    {onlinePlayer.corsMode === 'watch_only' ? ' (Watch-Only Mode)' : ' (Full 3D & AI)'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB: YOUTUBE STREAM
          ========================================================================= */}
          {activeTab === 'youtube' && (
            <div className="space-y-4">
              {/* URL Input Bar */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#FEF3C7] flex items-center justify-between font-display">
                  <span>Paste Complete YouTube Video Link:</span>
                  <span className="text-[11px] text-[#A89F91] font-mono">
                    Supports watch, youtu.be, shorts, embed &amp; timestamps
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={youtubeInput}
                      onChange={(e) => handleValidateYouTubeUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className={`w-full bg-[#120D0A] border px-3.5 py-2.5 rounded-xl text-sm font-mono focus:outline-none transition-colors ${
                        youtubeParseResult.isValid
                          ? 'border-emerald-700/80 focus:border-emerald-500 text-emerald-200'
                          : 'border-red-700/80 focus:border-red-500 text-red-200'
                      }`}
                    />
                  </div>

                  <button
                    onClick={handlePasteClipboard}
                    className="min-h-[44px] px-3 rounded-xl bg-[rgba(30,20,15,0.7)] hover:bg-[rgba(40,25,18,0.9)] text-[#FEF3C7] border border-amber-500/30 flex items-center gap-1.5 text-xs font-medium transition-colors font-display"
                    title="Paste from clipboard"
                  >
                    <ClipboardPaste className="w-4 h-4 text-amber-400" />
                    <span>Paste</span>
                  </button>
                </div>

                {/* Validation status feedback */}
                {!youtubeParseResult.isValid && youtubeParseResult.error && (
                  <p className="text-xs text-rose-400 flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{youtubeParseResult.error}</span>
                  </p>
                )}
                {youtubeParseResult.isValid && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1.5 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Video ID: {youtubeParseResult.videoId}
                      {youtubeParseResult.startTimeSec > 0 && ` • Start time: ${youtubeParseResult.startTimeSec}s`}
                    </span>
                  </p>
                )}
              </div>

              {/* Example Benchmark Link Chips */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#A89F91] font-mono">
                  Example Benchmark Clips (Creative Commons / Public Domain):
                </span>
                <div className="flex flex-wrap gap-2">
                  {YouTubeParser.getExampleClips().map((clip, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleValidateYouTubeUrl(clip.url)}
                      className="px-2.5 py-1.5 rounded-lg bg-[rgba(30,20,15,0.7)] hover:bg-[rgba(40,25,18,0.9)] border border-amber-500/25 text-xs text-[#FEF3C7] text-left transition-colors flex items-center gap-1.5"
                      title={clip.description}
                    >
                      <Youtube className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span>{clip.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* YouTube Stage Container (<div id="stage">) */}
              <div className="relative rounded-2xl overflow-hidden border border-amber-500/20 bg-black aspect-video flex items-center justify-center shadow-inner">
                <div id="stage" ref={stageRef} className="relative w-full h-full">
                  <div id="yt-player-frame" className="w-full h-full" />
                </div>

                {/* Error Banner if YouTube Owner Disabled Embedding */}
                {ytPlayerState.errorMessage && (
                  <div className="absolute inset-0 bg-[#120D0A]/90 flex flex-col items-center justify-center p-6 text-center z-20">
                    <AlertTriangle className="w-10 h-10 text-amber-400 mb-2" />
                    <h4 className="text-sm font-bold text-white mb-1 font-display">Embedding Restricted by Content Owner</h4>
                    <p className="text-xs text-[#D1C7BD] max-w-md mb-4">{ytPlayerState.errorMessage}</p>
                    <button
                      onClick={() => setActiveTab('online_player')}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-bold text-white shadow font-display"
                    >
                      Switch to Online Player
                    </button>
                  </div>
                )}
              </div>

              {/* Playback Controls & Rate Adjuster */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#120D0A]/80 border border-amber-500/20 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => ytBridgeRef.current.play()}
                    className="p-2 rounded-lg bg-[rgba(30,20,15,0.7)] hover:bg-[rgba(40,25,18,0.9)] text-[#FEF3C7] border border-amber-500/30"
                    title="Play"
                  >
                    <Play className="w-4 h-4 fill-current" />
                  </button>
                  <button
                    onClick={() => ytBridgeRef.current.pause()}
                    className="p-2 rounded-lg bg-[rgba(30,20,15,0.7)] hover:bg-[rgba(40,25,18,0.9)] text-[#FEF3C7] border border-amber-500/30"
                    title="Pause"
                  >
                    <Pause className="w-4 h-4 fill-current" />
                  </button>
                  <button
                    onClick={() => ytBridgeRef.current.seekTo(0)}
                    className="p-2 rounded-lg bg-[rgba(30,20,15,0.7)] hover:bg-[rgba(40,25,18,0.9)] text-[#FEF3C7] border border-amber-500/30"
                    title="Rewind to start"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>

                {/* Playback Rate Selector (0.25x - 2.0x) */}
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="text-[#A89F91] text-[11px]">Speed Rate:</span>
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => {
                        ytBridgeRef.current.setPlaybackRate(rate);
                        setYtPlayerState((prev) => ({ ...prev, playbackRate: rate }));
                      }}
                      className={`px-2 py-1 rounded text-[11px] font-bold ${
                        ytPlayerState.playbackRate === rate
                          ? 'bg-red-600 text-white'
                          : 'bg-black/30 text-[#A89F91] hover:text-white'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Analysis Button (Region Capture) */}
              <div className="pt-2">
                <button
                  onClick={handleStartYouTubeAnalysis}
                  disabled={!youtubeParseResult.isValid}
                  className="w-full min-h-[48px] py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-red-950/60 transition-all active:scale-[0.99] font-display"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start YouTube CCTV Analysis (Region Capture)</span>
                </button>
              </div>

              {/* Capture Error Advice */}
              {captureError && (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-200">
                  <p className="font-bold mb-1">Capture Interrupted:</p>
                  <p>{captureError}</p>
                </div>
              )}

              {/* Consent & Ethics Notice */}
              <div className="p-3 bg-[#120D0A]/80 border border-amber-500/20 rounded-xl text-xs text-[#A89F91] space-y-1">
                <div className="flex items-center gap-2 text-amber-400 font-semibold font-display">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Local Client-Side Processing &amp; Licensing Notice</span>
                </div>
                <p className="leading-relaxed">
                  Your browser will ask which tab to share. <strong>Nothing is uploaded to any server.</strong> The video frames stay strictly inside your local device memory.
                </p>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB: LIVE CAMERA
          ========================================================================= */}
          {activeTab === 'webcam' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#FEF3C7] font-display">Select Local Camera Device:</label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="w-full bg-[#120D0A] border border-amber-500/30 px-3.5 py-2.5 rounded-xl text-sm focus:outline-none focus:border-amber-400 text-[#FEF3C7]"
                >
                  {cameraDevices.map((dev) => (
                    <option key={dev.deviceId} value={dev.deviceId}>
                      {dev.label || `Camera ${dev.deviceId.substring(0, 8)}...`}
                    </option>
                  ))}
                  {cameraDevices.length === 0 && <option value="">Default Web Camera</option>}
                </select>
              </div>

              <button
                onClick={handleApplyWebcam}
                className="w-full min-h-[48px] py-3 rounded-xl bg-gradient-to-r from-[#D97706] to-[#B45309] hover:opacity-95 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg font-display"
              >
                <Camera className="w-4 h-4" />
                <span>Connect Live Camera</span>
              </button>
            </div>
          )}

          {/* =========================================================================
              TAB: UPLOAD FILE
          ========================================================================= */}
          {activeTab === 'upload_file' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-amber-500/30 hover:border-amber-400 rounded-2xl p-8 text-center cursor-pointer bg-[#120D0A]/60 hover:bg-[#120D0A] transition-colors"
              >
                <Upload className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-white mb-1 font-display">
                  {selectedFile ? selectedFile.name : 'Click to Browse or Drag & Drop Video'}
                </h4>
                <p className="text-xs text-[#A89F91]">
                  {selectedFile
                    ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB • Ready to analyze`
                    : 'Supports MP4, WebM, MOV video files directly in browser'}
                </p>
              </div>

              {selectedFile && (
                <button
                  onClick={handleApplyFileUpload}
                  className="w-full min-h-[48px] py-3 rounded-xl bg-gradient-to-r from-[#D97706] to-[#B45309] hover:opacity-95 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg font-display"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Analyze Uploaded Video</span>
                </button>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB: IP CAMERA
          ========================================================================= */}
          {activeTab === 'ip_camera' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#FEF3C7] font-display">
                  Network IP Camera Stream URL (MJPEG / HLS / HTTP):
                </label>
                <input
                  type="text"
                  value={ipCameraUrl}
                  onChange={(e) => setIpCameraUrl(e.target.value)}
                  placeholder="http://192.168.1.50:8080/stream"
                  className="w-full bg-[#120D0A] border border-amber-500/30 px-3.5 py-2.5 rounded-xl text-sm font-mono focus:outline-none focus:border-amber-400 text-amber-200"
                />
                <p className="text-[11px] text-[#A89F91]">
                  Accepts direct browser-accessible HTTP/HTTPS MJPEG or HLS endpoints. For RTSP streams, use a local proxy like go2rtc.
                </p>
              </div>

              <button
                onClick={handleApplyIpCamera}
                className="w-full min-h-[48px] py-3 rounded-xl bg-gradient-to-r from-[#D97706] to-[#B45309] hover:opacity-95 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg font-display"
              >
                <Radio className="w-4 h-4" />
                <span>Connect to IP Camera</span>
              </button>
            </div>
          )}

          {/* =========================================================================
              TAB: DIRECT VIDEO URL
          ========================================================================= */}
          {activeTab === 'video_url' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#FEF3C7] font-display">Direct Video URL (.mp4 / .webm):</label>
                <input
                  type="text"
                  value={directVideoUrl}
                  onChange={(e) => setDirectVideoUrl(e.target.value)}
                  placeholder="https://example.com/cctv_sample.mp4"
                  className="w-full bg-[#120D0A] border border-amber-500/30 px-3.5 py-2.5 rounded-xl text-sm font-mono focus:outline-none focus:border-amber-400 text-amber-200"
                />
              </div>

              <button
                onClick={handleApplyVideoUrl}
                className="w-full min-h-[48px] py-3 rounded-xl bg-gradient-to-r from-[#D97706] to-[#B45309] hover:opacity-95 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg font-display"
              >
                <Globe className="w-4 h-4" />
                <span>Load Network Video</span>
              </button>
            </div>
          )}

          {/* =========================================================================
              TAB: SIMULATED CCTV FEED
          ========================================================================= */}
          {activeTab === 'test_feed' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#120D0A]/80 border border-amber-500/20 text-xs text-[#D1C7BD] space-y-2">
                <h4 className="font-bold text-white text-sm font-display">Synthetic Traffic Simulation</h4>
                <p>
                  Generates procedural moving agents, crossing pedestrians, loitering entities, and object interactions in real time on an offscreen WebGL/Canvas buffer.
                </p>
                <p className="text-[#A89F91]">
                  Ideal for testing 3D ruler distances, kinematic Kalman filter convergence, and zone breach alerts without requiring physical camera hardware.
                </p>
              </div>

              <button
                onClick={handleApplyTestFeed}
                className="w-full min-h-[48px] py-3 rounded-xl bg-gradient-to-r from-[#D97706] to-[#B45309] hover:opacity-95 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg font-display"
              >
                <Sliders className="w-4 h-4" />
                <span>Activate Simulated Feed</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
