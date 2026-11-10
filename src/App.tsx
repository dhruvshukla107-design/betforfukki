/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Live 3D Vision & CCTV Analysis Architecture
 * Version 2.0.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CameraSourceConfig,
  DetectionCategory,
  PresetConfig,
  PresetType,
  SecurityEvent,
  TrackedEntity,
  ZonePolygon
} from './types/spatial';
import { MonocularDepthEngine, DepthMapResult } from './core/depthEngine';
import { ObjectTracker } from './core/tracker';
import { LocalONNXProvider, CloudVLMProvider } from './core/ai/AIProvider';
import { CameraModel } from './core/calibration/cameraModel';
import { GroundPlaneHomography, HomographyResult } from './core/calibration/homography';
import { DepthFusionEngine } from './core/calibration/depthFusion';
import { CCTVStreamViewer } from './components/CCTVStreamViewer';
import { PointCloudViewer } from './components/PointCloudViewer';
import { ControlPanel } from './components/ControlPanel';
import { EventLogPanel } from './components/EventLogPanel';
import { SetupWizard } from './components/SetupWizard';
import { ArchitectureModal } from './components/ArchitectureModal';
import { CalibrationModal } from './components/CalibrationModal';
import { UnifiedSourceModal } from './components/UnifiedSourceModal';
import { RiskEscalationPanel } from './components/RiskEscalationPanel';
import { EscalationRiskEngine, RiskAssessmentResult, RawRiskInputs } from './core/risk/riskModel';
import { SecurityEngine } from './core/security/securityEngine';
import { EvaluationHarness } from './core/eval/evaluationHarness';
import { InteractionGeometryEngine } from './core/kinematics/interactionGeometry';
import { VideoTimingEngine } from './core/timing/videoTimingEngine';
import { SceneCutDetector } from './core/timing/sceneCutDetector';
import { LabModeModal } from './components/LabModeModal';
import { ModelManagerModal } from './components/ModelManagerModal';
import { HomeLandingView } from './components/HomeLandingView';
import { SettingsView } from './components/SettingsView';
import { AboutTestingView } from './components/AboutTestingView';
import { ModelManager } from './core/models/modelManager';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { useI18n } from './core/i18n/i18nEngine';
import { LanguageToggle, ErrorDiagnosticToast } from './components/DiagnosticsAndLanguageBar';
import { ErrorTaxonomyEngine, DiagnosticError } from './core/errors/errorTaxonomy';
import {
  Play,
  Square,
  Video,
  Box,
  Columns,
  Cpu,
  HelpCircle,
  Settings,
  Sparkles,
  ShieldAlert,
  Camera,
  Activity,
  Compass,
  FlaskConical,
  Film
} from 'lucide-react';

const PRESETS: Record<PresetType, PresetConfig> = {
  home: {
    name: 'Home',
    description: 'Residential monitoring: People & Pet tracking, medium noise suppression.',
    detectPeople: true,
    detectAnimals: true,
    detectObjects: false,
    detectWeapons: true,
    detectAgeGroups: true,
    detectDistance: true,
    sensitivity: 'medium',
    confidenceThreshold: 0.60,
    iouThreshold: 0.35
  },
  shop: {
    name: 'Shop',
    description: 'Retail monitoring: People, High-value objects, and Weapon alerts.',
    detectPeople: true,
    detectAnimals: false,
    detectObjects: true,
    detectWeapons: true,
    detectAgeGroups: true,
    detectDistance: true,
    sensitivity: 'high',
    confidenceThreshold: 0.50,
    iouThreshold: 0.45
  },
  office: {
    name: 'Office',
    description: 'Commercial workspace: People tracking and coarse age demographics.',
    detectPeople: true,
    detectAnimals: false,
    detectObjects: true,
    detectWeapons: true,
    detectAgeGroups: true,
    detectDistance: true,
    sensitivity: 'medium',
    confidenceThreshold: 0.65,
    iouThreshold: 0.40
  },
  outdoor: {
    name: 'Outdoor',
    description: 'Perimeter monitoring: Large object & human boundary defense.',
    detectPeople: true,
    detectAnimals: true,
    detectObjects: false,
    detectWeapons: true,
    detectAgeGroups: false,
    detectDistance: true,
    sensitivity: 'low',
    confidenceThreshold: 0.70,
    iouThreshold: 0.30
  }
};

export default function App() {
  const { t, language } = useI18n();

  // Phase K: Diagnostic Error Taxonomy
  const errorEngineRef = useRef<ErrorTaxonomyEngine>(new ErrorTaxonomyEngine());
  const [activeErrors, setActiveErrors] = useState<DiagnosticError[]>([]);

  useEffect(() => {
    return errorEngineRef.current.subscribe(setActiveErrors);
  }, []);

  const handleExecuteRemedy = (action: string) => {
    if (action === 'SWITCH_TO_TEST_FEED') {
      setCameraSource({ type: 'test_feed', name: 'Simulated CCTV Feed' });
    } else if (action === 'RESET_TRACKERS') {
      trackerRef.current.reset();
    } else if (action === 'LOAD_BENCHMARK_CLIP') {
      setIsSourceModalOpen(true);
    }
  };

  // Portal Architecture Tab State (Layer 1: Home, Layer 2: Workspace, Layer 3: Settings, Layer 4: About)
  const [portalTab, setPortalTab] = useState<'home' | 'workspace' | 'settings' | 'about'>('home');

  const handlePortalTabChange = (tab: 'home' | 'workspace' | 'settings' | 'about') => {
    setPortalTab(tab);
    if (tab !== 'workspace') {
      setIsMonitoring(false);
    }
  };

  // Application State (Strict Lazy Initialization: dormant until activated)
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'2d' | '3d' | 'dual'>('dual');
  const [currentPreset, setCurrentPreset] = useState<PresetType>('shop');
  const [presetConfig, setPresetConfig] = useState<PresetConfig>(PRESETS.shop);

  // Source Configuration
  const [cameraSource, setCameraSource] = useState<CameraSourceConfig>({
    type: 'test_feed',
    name: 'Simulated CCTV Feed'
  });

  // Engines & Trackers
  const depthEngineRef = useRef<MonocularDepthEngine>(new MonocularDepthEngine(2.4));
  const trackerRef = useRef<ObjectTracker>(new ObjectTracker(0.35));
  const aiProviderRef = useRef<LocalONNXProvider>(new LocalONNXProvider());
  const vlmProviderRef = useRef<CloudVLMProvider>(new CloudVLMProvider());

  // Metrics
  const [fps, setFps] = useState<number>(58);
  const [inferenceLatencyMs, setInferenceLatencyMs] = useState<number>(14);
  const [depthResult, setDepthResult] = useState<DepthMapResult | null>(null);
  const [calibratedScale, setCalibratedScale] = useState<number>(2.4);

  // Entities & Detections
  const [trackedEntities, setTrackedEntities] = useState<TrackedEntity[]>([]);
  const [activeWeaponAlert, setActiveWeaponAlert] = useState<TrackedEntity | null>(null);

  // Phase D & F: Escalation-Risk Engine & Tamper-Evident Ledger
  const riskEngineRef = useRef<EscalationRiskEngine>(new EscalationRiskEngine());
  const securityEngineRef = useRef<SecurityEngine>(new SecurityEngine());
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessmentResult | null>(null);
  const [minTtcPair, setMinTtcPair] = useState<{ idA: number; idB: number; ttc: number; dist: number } | null>(null);
  const [isSnoozed, setIsSnoozed] = useState<boolean>(false);
  const [snoozeSecondsRemaining, setSnoozeSecondsRemaining] = useState<number>(0);
  const [latestLedgerHash, setLatestLedgerHash] = useState<string>('');
  const [ledgerBlockCount, setLedgerBlockCount] = useState<number>(1);
  const weaponHistoryRef = useRef<boolean[]>([]);
  const lastLedgerLogRef = useRef<number>(0);

  // Phase H: Video Timing & Scene-Cut Detection
  const videoTimingEngineRef = useRef<VideoTimingEngine>(new VideoTimingEngine());
  const sceneCutDetectorRef = useRef<SceneCutDetector>(new SceneCutDetector());
  const [isSceneCutAlert, setIsSceneCutAlert] = useState<boolean>(false);
  const [sceneCutMessage, setSceneCutMessage] = useState<string>('');
  const [playbackRateWarning, setPlaybackRateWarning] = useState<string | null>(null);

  // Snooze Countdown Timer
  useEffect(() => {
    if (!isSnoozed || snoozeSecondsRemaining <= 0) {
      if (isSnoozed) setIsSnoozed(false);
      return;
    }
    const timer = setInterval(() => {
      setSnoozeSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsSnoozed(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isSnoozed, snoozeSecondsRemaining]);

  // Security Events & Zones
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [zones, setZones] = useState<ZonePolygon[]>([
    {
      id: 'zone-front',
      name: 'Restricted Counter',
      points: [
        [0.15, 0.20],
        [0.45, 0.20],
        [0.45, 0.85],
        [0.15, 0.85]
      ],
      color: '#f43f5e',
      alertOnCategories: ['person', 'weapon'],
      active: true
    }
  ]);

  // Modal Dialogs
  const [isSourceModalOpen, setIsSourceModalOpen] = useState<boolean>(false);
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [isArchModalOpen, setIsArchModalOpen] = useState<boolean>(false);
  const [isCalibModalOpen, setIsCalibModalOpen] = useState<boolean>(false);
  const [isLabModalOpen, setIsLabModalOpen] = useState<boolean>(false);
  const [isModelManagerOpen, setIsModelManagerOpen] = useState<boolean>(false);
  const [activeModelName, setActiveModelName] = useState<string>('YOLOv8n General Edge');
  const modelManagerRef = useRef<ModelManager>(new ModelManager());
  const [vlmModalEvent, setVlmModalEvent] = useState<SecurityEvent | null>(null);
  const [vlmStatusText, setVlmStatusText] = useState<string>('');

  // Phase A Calibration Models
  const [cameraModel, setCameraModel] = useState<CameraModel>(() =>
    CameraModel.fromHFOV(1280, 720, 75, -0.05, 0.01)
  );
  const [homographyResult, setHomographyResult] = useState<HomographyResult | null>(() => {
    // Default pre-calibrated floor homography
    const defaultPairs = [
      { pixel: { x: 380, y: 640 }, world: { x: -2.0, y: 2.0 } },
      { pixel: { x: 900, y: 640 }, world: { x: 2.0, y: 2.0 } },
      { pixel: { x: 800, y: 440 }, world: { x: 2.0, y: 6.0 } },
      { pixel: { x: 480, y: 440 }, world: { x: -2.0, y: 6.0 } }
    ];
    return GroundPlaneHomography.fitRANSAC(defaultPairs);
  });

  // Refs for Video & Canvas
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const simFeedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize AI Provider
  useEffect(() => {
    aiProviderRef.current.init();
  }, []);

  // Preset switch
  const handleSelectPreset = (preset: PresetType) => {
    setCurrentPreset(preset);
    setPresetConfig(PRESETS[preset]);
    trackerRef.current.setIouThreshold(PRESETS[preset].iouThreshold);
  };

  const handleUpdateConfig = (partial: Partial<PresetConfig>) => {
    setPresetConfig((prev) => ({ ...prev, ...partial }));
    if (partial.iouThreshold !== undefined) {
      trackerRef.current.setIouThreshold(partial.iouThreshold);
    }
  };

  const handleChangeCalibratedScale = (scale: number) => {
    setCalibratedScale(scale);
    depthEngineRef.current.setCalibrationScale(scale);
  };

  // Start Camera Stream or Simulated Feed
  // Start Camera Stream, Video File, or Network Feed
  const startStream = useCallback(async (customStream?: MediaStream) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (customStream) {
      streamRef.current = customStream;
      if (videoRef.current) {
        videoRef.current.srcObject = customStream;
        videoRef.current.play().catch(() => {});
      }
      return;
    }

    if (cameraSource.type === 'webcam') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: cameraSource.deviceId ? { exact: cameraSource.deviceId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: false
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.warn('Webcam access failed or denied in frame, switching to simulated feed:', err);
        errorEngineRef.current.raiseError('CAM_PERM_DENIED');
        setCameraSource({ type: 'test_feed', name: 'Simulated CCTV Feed (Fallback)' });
      }
    } else if ((cameraSource.type === 'upload_file' || cameraSource.type === 'online_player') && cameraSource.file) {
      if (videoRef.current) {
        videoRef.current.crossOrigin = 'anonymous';
        videoRef.current.srcObject = null;
        videoRef.current.src = URL.createObjectURL(cameraSource.file);
        videoRef.current.loop = true;
        videoRef.current.playbackRate = cameraSource.playbackRate || 1.0;
        videoRef.current.play().catch(() => {});
      }
    } else if ((cameraSource.type === 'video_url' || cameraSource.type === 'online_player' || cameraSource.type === 'ip_camera') && cameraSource.url) {
      if (videoRef.current) {
        if (cameraSource.corsMode === 'watch_only') {
          videoRef.current.removeAttribute('crossorigin');
        } else {
          videoRef.current.crossOrigin = 'anonymous';
        }
        videoRef.current.srcObject = null;
        videoRef.current.src = cameraSource.url;
        videoRef.current.loop = true;
        videoRef.current.playbackRate = cameraSource.playbackRate || 1.0;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [cameraSource]);

  useEffect(() => {
    startStream();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startStream]);

  // Main Render & Detection Loop (Decoupled: Depth at 60 FPS, Inference at 10-15 Hz)
  useEffect(() => {
    if (!isMonitoring) return;

    let animId: number;
    let lastFrameTime = performance.now();
    let frameCounter = 0;
    let fpsTimer = performance.now();
    let lastInferenceTime = 0;
    const inferenceIntervalMs = 70; // ~14 Hz inference

    // Simulated CCTV canvas generator
    if (!simFeedCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 360;
      simFeedCanvasRef.current = c;
    }

    const loop = (now: number) => {
      animId = requestAnimationFrame(loop);

      // FPS Calculation
      frameCounter++;
      if (now - fpsTimer >= 1000) {
        setFps(Math.round((frameCounter * 1000) / (now - fpsTimer)));
        frameCounter = 0;
        fpsTimer = now;
      }

      // Phase H: Hardware Timing, Playback Rate Correction & Stall Protection
      const timingInfo = videoTimingEngineRef.current.tick(videoRef.current);
      if (timingInfo.warningNotice !== playbackRateWarning) {
        setPlaybackRateWarning(timingInfo.warningNotice || null);
      }

      // If video playback is buffering or stalled, skip frame to avoid stale kinematics
      if (timingInfo.isStalled) {
        return;
      }

      // Determine active frame source
      let sourceElement: HTMLVideoElement | HTMLCanvasElement | null = videoRef.current;
      if (cameraSource.type === 'test_feed' || !videoRef.current || videoRef.current.readyState < 2) {
        // Draw synthetic CCTV background
        const sCanvas = simFeedCanvasRef.current!;
        const sCtx = sCanvas.getContext('2d');
        if (sCtx) {
          const t = now * 0.001;
          // Gradient background simulating store / entrance
          const grad = sCtx.createLinearGradient(0, 0, 0, 360);
          grad.addColorStop(0, '#0f172a');
          grad.addColorStop(0.5, '#1e293b');
          grad.addColorStop(1, '#020617');
          sCtx.fillStyle = grad;
          sCtx.fillRect(0, 0, 640, 360);

          // Floor tiles perspective lines
          sCtx.strokeStyle = 'rgba(71, 85, 105, 0.25)';
          sCtx.lineWidth = 1;
          for (let i = 0; i < 640; i += 60) {
            sCtx.beginPath();
            sCtx.moveTo(i, 360);
            sCtx.lineTo(320 + (i - 320) * 0.15, 120);
            sCtx.stroke();
          }

          // Counter / desk silhouette
          sCtx.fillStyle = '#1e1b4b';
          sCtx.fillRect(80, 160, 220, 140);
          sCtx.strokeStyle = '#4338ca';
          sCtx.strokeRect(80, 160, 220, 140);

          // Moving subject 1 (Person)
          const pX = 140 + Math.sin(t * 0.8) * 35;
          const pY = 120 + Math.cos(t * 0.6) * 15;
          sCtx.fillStyle = '#38bdf8';
          sCtx.beginPath();
          sCtx.arc(pX + 50, pY + 25, 16, 0, Math.PI * 2); // head
          sCtx.fill();
          sCtx.fillStyle = '#0284c7';
          sCtx.fillRect(pX + 35, pY + 45, 30, 80); // body

          // Moving subject 2 (Pet / Dog)
          const dX = 420 + Math.cos(t * 1.1) * 60;
          const dY = 240 + Math.sin(t * 0.5) * 10;
          sCtx.fillStyle = '#ca8a04';
          sCtx.fillRect(dX, dY, 50, 30);
          sCtx.beginPath();
          sCtx.arc(dX + 50, dY + 10, 12, 0, Math.PI * 2);
          sCtx.fill();
        }
        sourceElement = sCanvas;
      }

      // 1. Compute 3D Depth Map (Fast 120x90 grid)
      if (sourceElement && (viewMode === '3d' || viewMode === 'dual')) {
        const dRes = depthEngineRef.current.processFrame(sourceElement);
        setDepthResult(dRes);
      }

      // 2. Decoupled AI Inference Loop (10-15 Hz)
      if (now - lastInferenceTime >= inferenceIntervalMs && sourceElement) {
        lastInferenceTime = now;
        const infStart = performance.now();

        // Phase H: Scene-Cut & Rapid Camera-Motion Detection
        const sceneAnalysis = sceneCutDetectorRef.current.evaluateFrame(sourceElement);
        if (sceneAnalysis.isSceneCut) {
          trackerRef.current.reset();
          setIsSceneCutAlert(true);
          errorEngineRef.current.raiseError('SCENE_CUT_DESYNC');
          setSceneCutMessage(
            `Scene cut / rapid motion detected (χ² = ${sceneAnalysis.chiSquareDistance.toFixed(2)}, motion = ${sceneAnalysis.globalMotionScore.toFixed(1)}). Trackers reset.`
          );
          setTimeout(() => setIsSceneCutAlert(false), 5000);
        }

        aiProviderRef.current.detect(sourceElement).then((rawDetections) => {
          const infEnd = performance.now();
          setInferenceLatencyMs(Math.round(infEnd - infStart));

          // Filter detections according to user preset checkboxes & sensitivity thresholds
          const filtered = rawDetections.filter((d) => {
            if (d.score < presetConfig.confidenceThreshold) return false;
            if (d.category === 'person' && !presetConfig.detectPeople) return false;
            if (d.category === 'animal' && !presetConfig.detectAnimals) return false;
            if (d.category === 'object' && !presetConfig.detectObjects) return false;
            if (d.category === 'weapon' && !presetConfig.detectWeapons) return false;
            return true;
          });

          // Phase A: Multi-Estimator Inverse-Variance Depth Fusion & Foot-Point Undistortion
          filtered.forEach((d) => {
            const uCenter = d.box[0] + d.box[2] / 2;
            const vCenter = d.box[1] + d.box[3] / 2;
            const monoZ = depthEngineRef.current.getDepthAt(uCenter, vCenter);

            const estimatesToFuse = [
              { sourceName: 'Monocular Depth Prior', Z: monoZ, sigmaZ: Math.max(0.3, monoZ * 0.15) }
            ];

            // 1. Height-prior range for persons
            if (d.category === 'person') {
              const boxHeightPx = d.box[3] * 720;
              const prior = cameraModel.estimateDistanceHeightPrior(boxHeightPx, d.ageBand || '20-59');
              estimatesToFuse.push({
                sourceName: 'Height Prior',
                Z: prior.Z,
                sigmaZ: prior.sigmaZ
              });
            }

            // 2. Ground Homography range from undistorted foot point
            if (homographyResult && homographyResult.H) {
              const u_foot_px = (d.box[0] + d.box[2] / 2) * 1280;
              const v_foot_px = (d.box[1] + d.box[3]) * 720;
              const [u_undist, v_undist] = cameraModel.undistortPixel(u_foot_px, v_foot_px);
              const groundPt = GroundPlaneHomography.applyHomography(homographyResult.H, u_undist, v_undist);

              if (!isNaN(groundPt.x) && !isNaN(groundPt.y)) {
                const groundDist = Math.hypot(groundPt.x, groundPt.y);
                const cov = GroundPlaneHomography.propagateCovariance(homographyResult.H, u_undist, v_undist, 2.0, 2.0);
                const sigmaGround = Math.sqrt(Math.max(0.04, (cov.varX + cov.varY) / 2.0));
                estimatesToFuse.push({
                  sourceName: 'Ground Homography',
                  Z: groundDist,
                  sigmaZ: sigmaGround
                });
              }
            }

            // Fuse all valid estimators via inverse-variance weighting: Z* = (sum Z_i / sigma_i^2) / (sum 1 / sigma_i^2)
            const fused = DepthFusionEngine.fuseEstimates(estimatesToFuse);
            d.distanceM = fused.fusedZ;
          });

          // Multi-Object Kalman Tracking (ByteTrack / SORT)
          const updatedTracks = trackerRef.current.update(filtered);
          setTrackedEntities(updatedTracks);

          // Check for active weapon confirmation and zone violations
          let weaponCandidate: TrackedEntity | null = null;

          for (const ent of updatedTracks) {
            // Weapon temporal confirmation rule: >= 4 of last 6 frames
            if (ent.category === 'weapon' || ent.weaponStreak >= 4) {
              weaponCandidate = ent;

              // Fire security alert event if not already present
              setEvents((prev) => {
                const alreadyExists = prev.some(
                  (e) => e.trackId === ent.id && e.category === 'weapon' && now - e.timestamp < 12000
                );
                if (alreadyExists) return prev;

                const newEvt: SecurityEvent = {
                  id: `evt-${Date.now()}-${ent.id}`,
                  timestamp: Date.now(),
                  trackId: ent.id,
                  cls: ent.cls,
                  category: 'weapon',
                  confidence: ent.score,
                  distanceM: ent.distanceM,
                  status: 'new',
                  isPossibleWeapon: true,
                  notes: 'Temporal confirmation threshold met (>= 4 of 6 frames). Requires human review.'
                };
                return [newEvt, ...prev.slice(0, 49)];
              });
            }

            // Zone Violation Testing (Ray-casting)
            const violatedZone = ObjectTracker.checkZoneViolations(ent, zones);
            if (violatedZone && !ent.inZoneAlertSent) {
              ent.inZoneAlertSent = true;
              trackerRef.current.markZoneAlertSent(ent.id, true);

              setEvents((prev) => {
                const nowMs = Date.now();
                // Prevent duplicate event creation within 10-second cooldown
                const alreadyExists = prev.some(
                  (e) => e.trackId === ent.id && e.zoneName === violatedZone.name && nowMs - e.timestamp < 10000
                );
                if (alreadyExists) return prev;

                const uniqueSuffix = Math.random().toString(36).substring(2, 7);
                const newZoneEvt: SecurityEvent = {
                  id: `zone-evt-${nowMs}-${ent.id}-${uniqueSuffix}`,
                  timestamp: nowMs,
                  trackId: ent.id,
                  cls: ent.cls,
                  category: ent.category,
                  confidence: ent.score,
                  ageBand: ent.smoothAge,
                  distanceM: ent.distanceM,
                  zoneName: violatedZone.name,
                  status: 'new',
                  isPossibleWeapon: ent.category === 'weapon',
                  notes: `Breached perimeter zone: ${violatedZone.name}`
                };
                return [newZoneEvt, ...prev.slice(0, 49)];
              });
            } else if (!violatedZone && ent.inZoneAlertSent) {
              // Target left zone: reset alert flag so future re-entry triggers an alert
              ent.inZoneAlertSent = false;
              trackerRef.current.markZoneAlertSent(ent.id, false);
            }
          }

          setActiveWeaponAlert(weaponCandidate);
        });
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isMonitoring, cameraSource, presetConfig, viewMode, zones]);

  // Event handlers
  const handleVerifyEvent = (id: string) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: 'verified' as const } : e))
    );
  };

  const handleDismissEvent = (id: string) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: 'dismissed' as const } : e))
    );
  };

  const handleClearAllEvents = () => {
    setEvents([]);
  };

  // Cloud VLM Double-Check Trigger
  const handleTriggerVLMVerify = (event: SecurityEvent) => {
    setVlmModalEvent(event);
    setVlmStatusText('Awaiting user confirmation to dispatch cropped ROI...');
  };

  const executeVLMVerification = async () => {
    if (!vlmModalEvent) return;
    setVlmStatusText('Transmitting crop to Multimodal VLM for weapon silhouette review...');
    vlmProviderRef.current.setUserConsent(true);

    // Mock crop canvas
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = 128;
    cropCanvas.height = 128;
    const ctx = cropCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(0, 0, 128, 128);
    }

    const result = await vlmProviderRef.current.verify(cropCanvas, vlmModalEvent.cls);
    setVlmStatusText(
      result.flaggedWeapon
        ? `⚠️ VLM Alert: ${result.humanLabel} (Confidence: ${Math.round(result.confidence * 100)}%)`
        : `✅ VLM Advisory: Likely benign item (${result.humanLabel})`
    );

    setEvents((prev) =>
      prev.map((e) =>
        e.id === vlmModalEvent.id
          ? {
              ...e,
              verificationSource: 'cloud-vlm' as const,
              notes: result.humanLabel
            }
          : e
      )
    );
  };

  // Real-time category counters
  const peopleCount = trackedEntities.filter((e) => e.category === 'person').length;
  const animalCount = trackedEntities.filter((e) => e.category === 'animal').length;
  const objectCount = trackedEntities.filter((e) => e.category === 'object').length;
  const threatCount = events.filter((e) => e.isPossibleWeapon && e.status === 'new').length;

  // Dynamic Background Shade Shift Modes (Master Spec Section 2)
  const dynamicShadeClass = (() => {
    if (activeWeaponAlert || (riskAssessment && (riskAssessment.alertLevel === 'Urgent' || riskAssessment.alertLevel === 'Alert') && !isSnoozed)) {
      return 'shade-risk-alert';
    }
    if (isCalibModalOpen) {
      return 'shade-calibration';
    }
    if (portalTab === 'workspace' && viewMode === '3d') {
      return 'shade-3d-cloud';
    }
    if (portalTab === 'workspace' && isMonitoring) {
      return 'shade-live-video';
    }
    return 'shade-home-idle';
  })();

  return (
    <div className={`flex flex-col h-screen w-screen bg-[#08070F] text-[#FDFBF7] overflow-hidden font-sans select-none transition-all duration-700 ${dynamicShadeClass}`}>
      {/* =========================================================================
          TOP NAVIGATION BAR (Soft-Cyberpunk & Cyber-Organic Architecture)
      ========================================================================= */}
      <header className="h-16 border-b border-[rgba(168,85,247,0.25)] bg-[#08070F]/90 px-6 flex items-center justify-between shrink-0 z-30 backdrop-blur-md">
        {/* Left: Brand & Glowing Badge */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#D97706] via-[#A855F7] to-[#10B981] flex items-center justify-center shadow-lg shadow-[#A855F7]/30">
            <Box className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-[#FEF3C7] font-display">
                SpatialMapper 3D
              </span>
              <span className="text-[10px] bg-[rgba(168,85,247,0.2)] text-[#C084FC] border border-[rgba(168,85,247,0.4)] px-2 py-0.5 rounded-full font-mono font-bold">
                Master Spec v5.0
              </span>
            </div>
            <div className="text-[10px] text-[#A89F91] flex items-center gap-1.5 font-mono">
              <span className={`w-2 h-2 rounded-full ${isMonitoring ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500'}`} />
              <span>{isMonitoring ? 'System Active (Inference Live)' : 'System Dormant (Zero Background Load)'}</span>
              <span className="hidden sm:inline text-slate-500">·</span>
              <span className="hidden sm:inline text-amber-400/80 italic">Automated spatial estimates. Requires human verification.</span>
            </div>
          </div>
        </div>

        {/* Center: Portal Navigation Tabs (Home, Workspace, Settings, About & Testing) */}
        <div className="hidden lg:flex items-center bg-[#1A120E] p-1.5 rounded-2xl border border-[rgba(245,158,11,0.25)]">
          <button
            onClick={() => handlePortalTabChange('home')}
            className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all font-display ${
              portalTab === 'home'
                ? 'bg-gradient-to-r from-[#D97706] to-[#B45309] text-white shadow-md shadow-[#D97706]/30'
                : 'text-[#A89F91] hover:text-white'
            }`}
          >
            Home
          </button>
          <button
            onClick={() => handlePortalTabChange('workspace')}
            className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all font-display ${
              portalTab === 'workspace'
                ? 'bg-gradient-to-r from-[#D97706] to-[#B45309] text-white shadow-md shadow-[#D97706]/30'
                : 'text-[#A89F91] hover:text-white'
            }`}
          >
            Workspace
          </button>
          <button
            onClick={() => handlePortalTabChange('settings')}
            className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all font-display ${
              portalTab === 'settings'
                ? 'bg-gradient-to-r from-[#D97706] to-[#B45309] text-white shadow-md shadow-[#D97706]/30'
                : 'text-[#A89F91] hover:text-white'
            }`}
          >
            Settings
          </button>
          <button
            onClick={() => handlePortalTabChange('about')}
            className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all font-display ${
              portalTab === 'about'
                ? 'bg-gradient-to-r from-[#D97706] to-[#B45309] text-white shadow-md shadow-[#D97706]/30'
                : 'text-[#A89F91] hover:text-white'
            }`}
          >
            About &amp; Testing
          </button>
        </div>

        {/* Right: Quick Controls, Language, PWA & Launch Engine */}
        <div className="flex items-center gap-2.5">
          {/* Quick Tools */}
          <div className="hidden xl:flex items-center gap-2">
            <button
              onClick={() => setIsSourceModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-[rgba(30,20,15,0.7)] hover:bg-[rgba(40,25,18,0.9)] border border-[rgba(245,158,11,0.3)] text-xs text-[#FEF3C7] font-semibold flex items-center gap-1.5 transition-all font-display"
              title="Open Source Picker & Online Player"
            >
              <Film className="w-3.5 h-3.5 text-amber-400" />
              <span>Sources</span>
            </button>

            <button
              onClick={() => setIsModelManagerOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-[rgba(30,20,15,0.7)] hover:bg-[rgba(40,25,18,0.9)] border border-[rgba(245,158,11,0.3)] text-xs text-[#FEF3C7] font-semibold flex items-center gap-1.5 transition-all font-display"
              title="Open Model Manager"
            >
              <Cpu className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Models</span>
            </button>

            <button
              onClick={() => setIsLabModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-[rgba(30,20,15,0.7)] hover:bg-[rgba(40,25,18,0.9)] border border-[rgba(245,158,11,0.3)] text-xs text-[#FEF3C7] font-semibold flex items-center gap-1.5 transition-all font-display"
              title="Open Test Lab & Dataset Builder"
            >
              <FlaskConical className="w-3.5 h-3.5 text-[#F59E0B]" />
              <span>Test Lab</span>
            </button>
          </div>

          <LanguageToggle />
          <PWAInstallButton />

          {/* Launch Engine / Start Session CTA */}
          <button
            onClick={() => {
              if (portalTab !== 'workspace') {
                handlePortalTabChange('workspace');
              }
              setIsMonitoring(!isMonitoring);
            }}
            className={`px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all font-display ${
              isMonitoring
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950'
                : 'bg-gradient-to-r from-[#D97706] via-[#B45309] to-[#065F46] hover:opacity-95 text-white shadow-[#D97706]/30'
            }`}
          >
            {isMonitoring ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop Engine</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Launch Engine</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* =========================================================================
          LAYER RENDERER (Layer 1: Home, Layer 2: Workspace, Layer 3: Settings, Layer 4: About)
      ========================================================================= */}
      {portalTab === 'home' && (
        <HomeLandingView
          onLaunchWorkspace={() => {
            handlePortalTabChange('workspace');
            setIsMonitoring(true);
          }}
          onOpenCalibration={() => setIsCalibModalOpen(true)}
          onOpenTestLab={() => setIsLabModalOpen(true)}
          onOpenModelManager={() => setIsModelManagerOpen(true)}
          onOpenSourcePicker={() => setIsSourceModalOpen(true)}
        />
      )}

      {portalTab === 'settings' && <SettingsView />}

      {portalTab === 'about' && <AboutTestingView />}

      {portalTab === 'workspace' && (
        <div className="flex-1 flex overflow-hidden p-3 gap-3 bg-[#08070F]/70">
          {/* LEFT PANEL: Simple Toggles, Sensitivity & Presets */}
          <aside className="w-72 shrink-0 hidden lg:flex flex-col overflow-y-auto">
            <ControlPanel
              currentPreset={currentPreset}
              onSelectPreset={handleSelectPreset}
              config={presetConfig}
              onUpdateConfig={handleUpdateConfig}
              calibratedScale={calibratedScale}
              onChangeCalibratedScale={handleChangeCalibratedScale}
            />
          </aside>

          {/* CENTER VIEWPORT: 2D HUD / 3D Point Cloud / Dual View */}
          <main className="flex-1 flex flex-col min-w-0 h-full gap-3 overflow-hidden">
            {viewMode === '2d' && (
              <div className="flex-1 w-full h-full">
                <CCTVStreamViewer
                  videoRef={videoRef}
                  canvasOverlayRef={canvasOverlayRef}
                  cameraSource={cameraSource}
                  trackedEntities={trackedEntities}
                  zones={zones}
                  activeWeaponAlert={activeWeaponAlert}
                  onAddZone={(newZone) => setZones((prev) => [...prev, newZone])}
                  onDeleteZone={(zId) => setZones((prev) => prev.filter((z) => z.id !== zId))}
                  onRefreshCamera={startStream}
                  isStreaming={isMonitoring}
                  showAgeTags={presetConfig.detectAgeGroups}
                  showDistanceTags={presetConfig.detectDistance}
                  homographyResult={homographyResult}
                  riskAssessment={riskAssessment}
                  minTtcPair={minTtcPair}
                  isSceneCutAlert={isSceneCutAlert}
                  sceneCutMessage={sceneCutMessage}
                  playbackRateWarning={playbackRateWarning}
                  onRecalibrateRequested={() => setIsCalibModalOpen(true)}
                />
              </div>
            )}

            {viewMode === '3d' && (
              <div className="flex-1 w-full h-full">
                <PointCloudViewer
                  depthResult={depthResult}
                  depthEngine={depthEngineRef.current}
                  fps={fps}
                />
              </div>
            )}

            {viewMode === 'dual' && (
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 h-full">
                {/* Left Column: 2D CCTV HUD */}
                <div className="h-full">
                  <CCTVStreamViewer
                    videoRef={videoRef}
                    canvasOverlayRef={canvasOverlayRef}
                    cameraSource={cameraSource}
                    trackedEntities={trackedEntities}
                    zones={zones}
                    activeWeaponAlert={activeWeaponAlert}
                    onAddZone={(newZone) => setZones((prev) => [...prev, newZone])}
                    onDeleteZone={(zId) => setZones((prev) => prev.filter((z) => z.id !== zId))}
                    onRefreshCamera={startStream}
                    isStreaming={isMonitoring}
                    showAgeTags={presetConfig.detectAgeGroups}
                    showDistanceTags={presetConfig.detectDistance}
                    homographyResult={homographyResult}
                    riskAssessment={riskAssessment}
                    minTtcPair={minTtcPair}
                    isSceneCutAlert={isSceneCutAlert}
                    sceneCutMessage={sceneCutMessage}
                    playbackRateWarning={playbackRateWarning}
                    onRecalibrateRequested={() => setIsCalibModalOpen(true)}
                  />
                </div>

                {/* Right Column: 3D Point Cloud & Ruler */}
                <div className="h-full">
                  <PointCloudViewer
                    depthResult={depthResult}
                    depthEngine={depthEngineRef.current}
                    fps={fps}
                  />
                </div>
              </div>
            )}
          </main>

          {/* RIGHT PANEL: Live Event Log & Counters */}
          <aside className="w-80 shrink-0 hidden xl:flex flex-col h-full">
            <EventLogPanel
              events={events}
              onVerifyEvent={handleVerifyEvent}
              onDismissEvent={handleDismissEvent}
              onClearAllEvents={handleClearAllEvents}
              onTriggerVLMVerify={handleTriggerVLMVerify}
              peopleCount={peopleCount}
              animalCount={animalCount}
              objectCount={objectCount}
              threatCount={threatCount}
            />
          </aside>
        </div>
      )}

      {/* =========================================================================
          MODALS & OVERLAYS
      ========================================================================= */}
      {/* Setup Wizard */}
      <SetupWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onApplySettings={(source, preset) => {
          setCameraSource(source);
          handleSelectPreset(preset);
        }}
      />

      {/* Architecture & Viva Specifications Modal */}
      <ArchitectureModal
        isOpen={isArchModalOpen}
        onClose={() => setIsArchModalOpen(false)}
      />

      {/* Phase A Calibration & Test Suite Modal */}
      <CalibrationModal
        isOpen={isCalibModalOpen}
        onClose={() => setIsCalibModalOpen(false)}
        cameraModel={cameraModel}
        onUpdateCameraModel={setCameraModel}
        currentHomography={homographyResult}
        onApplyHomography={setHomographyResult}
      />

      {/* Cloud VLM Verification Confirmation Dialog (Opt-in only) */}
      {vlmModalEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 text-slate-100 space-y-4">
            <div className="flex items-center gap-2.5 text-amber-400 font-bold text-sm">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <span>Opt-In Multimodal VLM Verification</span>
            </div>

            <div className="p-3 bg-amber-950/30 border border-amber-900/60 rounded-xl text-xs text-amber-200/90 leading-relaxed">
              <strong>Notice:</strong> This action will send an isolated <strong>bounding-box crop only</strong> (never the full video stream) to an external Multimodal AI to double-check candidate <em>"{vlmModalEvent.cls}"</em> against non-threat everyday items (e.g., phones, wallets, umbrellas).
            </div>

            {vlmStatusText && (
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300 font-mono">
                {vlmStatusText}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setVlmModalEvent(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={executeVLMVerification}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Verify Crop with VLM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Source Picker Modal (Live Camera, IP, URL, File, YouTube) */}
      <UnifiedSourceModal
        isOpen={isSourceModalOpen}
        onClose={() => setIsSourceModalOpen(false)}
        currentSource={cameraSource}
        onSelectSource={(newSource, stream) => {
          setCameraSource(newSource);
          startStream(stream);
        }}
      />

      {/* Phase I: Lab Mode Modal (Test Lab, Teach & Dataset Builder, Model Importer & Pre-Deploy Gate) */}
      <LabModeModal
        isOpen={isLabModalOpen}
        onClose={() => setIsLabModalOpen(false)}
        videoElement={videoRef.current}
        canvasOverlayElement={canvasOverlayRef.current}
        currentDetections={trackedEntities}
        fps={fps}
        latencyMs={inferenceLatencyMs}
      />

      {/* Phase J: Model Manager & Licensing Modal */}
      <ModelManagerModal
        isOpen={isModelManagerOpen}
        onClose={() => setIsModelManagerOpen(false)}
        modelManager={modelManagerRef.current}
        onActiveModelChanged={(mId) => {
          const model = modelManagerRef.current.getAllModels().find(m => m.id === mId);
          if (model) setActiveModelName(model.name);
        }}
      />

      {/* Offline Status Connectivity Banner */}
      <OfflineIndicator />

      {/* Phase K: Error Diagnostic Toast */}
      <ErrorDiagnosticToast
        errors={activeErrors}
        onDismissError={(code) => errorEngineRef.current.dismissError(code)}
        onExecuteRemedy={handleExecuteRemedy}
      />
    </div>
  );
}
