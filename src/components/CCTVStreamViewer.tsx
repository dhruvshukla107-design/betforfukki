/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - CCTV Stream Viewer & HUD Overlay
 * Renders live stream, color-coded detections, age estimates, distance tags,
 * polygon zones, and weapon alert banners.
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { CameraSourceConfig, DetectionCategory, TrackedEntity, ZonePolygon } from '../types/spatial';
import { HomographyResult, GroundPlaneHomography } from '../core/calibration/homography';
import { RiskAssessmentResult } from '../core/risk/riskModel';
import {
  AlertTriangle,
  ShieldAlert,
  Crosshair,
  PlusCircle,
  Trash2,
  Camera,
  RefreshCw,
  Navigation,
  Radio
} from 'lucide-react';

interface CCTVStreamViewerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasOverlayRef: React.RefObject<HTMLCanvasElement | null>;
  cameraSource: CameraSourceConfig;
  trackedEntities: TrackedEntity[];
  zones: ZonePolygon[];
  activeWeaponAlert: TrackedEntity | null;
  onAddZone: (zone: ZonePolygon) => void;
  onDeleteZone: (zoneId: string) => void;
  onRefreshCamera: () => void;
  isStreaming: boolean;
  showAgeTags: boolean;
  showDistanceTags: boolean;
  homographyResult?: HomographyResult | null;
  riskAssessment?: RiskAssessmentResult | null;
  minTtcPair?: { idA: number; idB: number; ttc: number; dist: number } | null;
  showSpeedArrows?: boolean;
  showDistanceRings?: boolean;
  isSceneCutAlert?: boolean;
  sceneCutMessage?: string;
  playbackRateWarning?: string | null;
  onRecalibrateRequested?: () => void;
}

export const CCTVStreamViewer: React.FC<CCTVStreamViewerProps> = ({
  videoRef,
  canvasOverlayRef,
  cameraSource,
  trackedEntities,
  zones,
  activeWeaponAlert,
  onAddZone,
  onDeleteZone,
  onRefreshCamera,
  isStreaming,
  showAgeTags,
  showDistanceTags,
  homographyResult,
  riskAssessment,
  minTtcPair,
  showSpeedArrows = true,
  showDistanceRings = true,
  isSceneCutAlert = false,
  sceneCutMessage,
  playbackRateWarning,
  onRecalibrateRequested
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawingZone, setIsDrawingZone] = useState<boolean>(false);
  const [currentZonePoints, setCurrentZonePoints] = useState<[number, number][]>([]);
  const [zoneCategoryFilter, setZoneCategoryFilter] = useState<DetectionCategory>('person');
  const [zoneNameInput, setZoneNameInput] = useState<string>('Perimeter Zone');

  // Handle polygon zone clicks on canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingZone || !canvasOverlayRef.current) return;

    const rect = canvasOverlayRef.current.getBoundingClientRect();
    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const newPoints = [...currentZonePoints, [normX, normY] as [number, number]];
    setCurrentZonePoints(newPoints);
  };

  const handleFinishZone = () => {
    if (currentZonePoints.length >= 3) {
      const colors = ['#f43f5e', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981'];
      const pickedColor = colors[zones.length % colors.length];

      onAddZone({
        id: `zone-${Date.now()}`,
        name: zoneNameInput || `Zone ${zones.length + 1}`,
        points: currentZonePoints,
        color: pickedColor,
        alertOnCategories: [zoneCategoryFilter, 'weapon'],
        active: true
      });
    }
    setCurrentZonePoints([]);
    setIsDrawingZone(false);
  };

  const handleCancelZone = () => {
    setCurrentZonePoints([]);
    setIsDrawingZone(false);
  };

  // Render HUD Overlay (bounding boxes, zones, labels)
  useEffect(() => {
    const canvas = canvasOverlayRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Ground Distance Concentric Rings (2m, 5m, 10m) if Homography Calibrated
    if (showDistanceRings && homographyResult?.H) {
      try {
        const H_inv = GroundPlaneHomography.invertHomography(homographyResult.H);
        const ringRadii = [2.0, 5.0, 10.0];

        ctx.save();
        for (const radius of ringRadii) {
          ctx.beginPath();
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = radius === 2.0 ? 'rgba(244, 63, 94, 0.35)' : 'rgba(56, 189, 248, 0.30)';

          let first = true;
          let labelPos: { x: number; y: number } | null = null;

          // Sweep angle from -80 to +80 deg in front of camera
          for (let deg = -80; deg <= 80; deg += 4) {
            const rad = (deg * Math.PI) / 180.0;
            const X = radius * Math.sin(rad);
            const Y = radius * Math.cos(rad) + 0.5;

            const px = GroundPlaneHomography.projectWorldToPixel(H_inv, X, Y);
            if (Number.isFinite(px.x) && Number.isFinite(px.y) && px.x >= 0 && px.x <= width && px.y >= 0 && px.y <= height) {
              if (first) {
                ctx.moveTo(px.x, px.y);
                first = false;
                labelPos = { x: px.x, y: px.y };
              } else {
                ctx.lineTo(px.x, px.y);
              }
            }
          }
          ctx.stroke();

          // Render Range Label
          if (labelPos) {
            ctx.font = 'bold 10px monospace';
            ctx.fillStyle = radius === 2.0 ? 'rgba(244, 63, 94, 0.7)' : 'rgba(56, 189, 248, 0.65)';
            ctx.fillText(`${radius.toFixed(0)}m perimeter`, labelPos.x + 4, labelPos.y - 4);
          }
        }
        ctx.restore();
      } catch {
        // Homography singular, skip ground rings
      }
    }

    // 2. Draw Saved Zones
    for (const zone of zones) {
      if (zone.points.length < 3) continue;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(zone.points[0][0] * width, zone.points[0][1] * height);
      for (let i = 1; i < zone.points.length; i++) {
        ctx.lineTo(zone.points[i][0] * width, zone.points[i][1] * height);
      }
      ctx.closePath();

      // Translucent fill
      ctx.fillStyle = `${zone.color}22`;
      ctx.fill();

      // Dashed border
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = zone.color;
      ctx.stroke();

      // Zone Label
      const p0 = zone.points[0];
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = zone.color;
      ctx.fillText(`🛡️ ${zone.name}`, p0[0] * width + 4, p0[1] * height - 6);
      ctx.restore();
    }

    // 3. Draw Current Zone In-Progress
    if (currentZonePoints.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(currentZonePoints[0][0] * width, currentZonePoints[0][1] * height);
      for (let i = 1; i < currentZonePoints.length; i++) {
        ctx.lineTo(currentZonePoints[i][0] * width, currentZonePoints[i][1] * height);
      }
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      // Draw point handles
      for (const pt of currentZonePoints) {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(pt[0] * width, pt[1] * height, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 4. Draw Tracked Detections & Speed Vectors
    for (const entity of trackedEntities) {
      const [cx, cy, w, h] = entity.box;
      const x = (cx - w / 2) * width;
      const y = (cy - h / 2) * height;
      const boxW = w * width;
      const boxH = h * height;

      // Color mapping:
      // Green = person, Blue = animal, Yellow = object, Red = possible weapon
      let strokeColor = '#eab308'; // yellow object
      let bgColor = 'rgba(234, 179, 8, 0.85)';
      let labelPrefix = '📦 Object';

      if (entity.category === 'person') {
        strokeColor = '#22c55e'; // green person
        bgColor = 'rgba(34, 197, 94, 0.85)';
        labelPrefix = '👤 Person';
      } else if (entity.category === 'animal') {
        strokeColor = '#3b82f6'; // blue animal
        bgColor = 'rgba(59, 130, 246, 0.85)';
        labelPrefix = '🐾 Animal';
      } else if (entity.category === 'weapon' || entity.weaponStreak >= 3) {
        strokeColor = '#ef4444'; // red weapon
        bgColor = 'rgba(239, 68, 68, 0.95)';
        labelPrefix = '⚠️ Possible Weapon';
      }

      // Draw Bounding Box with rounded corners look
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = entity.category === 'weapon' ? 3 : 2;
      ctx.strokeRect(x, y, boxW, boxH);

      // Corner target brackets
      const bracketLen = Math.min(14, boxW * 0.25);
      ctx.beginPath();
      ctx.moveTo(x, y + bracketLen); ctx.lineTo(x, y); ctx.lineTo(x + bracketLen, y);
      ctx.moveTo(x + boxW - bracketLen, y); ctx.lineTo(x + boxW, y); ctx.lineTo(x + boxW, y + bracketLen);
      ctx.moveTo(x, y + boxH - bracketLen); ctx.lineTo(x, y + boxH); ctx.lineTo(x + bracketLen, y + boxH);
      ctx.moveTo(x + boxW - bracketLen, y + boxH); ctx.lineTo(x + boxW, y + boxH); ctx.lineTo(x + boxW, y + boxH - bracketLen);
      ctx.stroke();

      // Velocity Vector Arrow (Kinematics Phase B / E)
      if (showSpeedArrows && entity.velocity) {
        const [vx, vy] = entity.velocity;
        const speed = Math.hypot(vx, vy);
        if (speed > 0.02) {
          const footX = x + boxW / 2;
          const footY = y + boxH;
          const arrowLen = Math.min(48, Math.max(12, speed * 220));
          const angle = Math.atan2(vy, vx);

          const endX = footX + Math.cos(angle) * arrowLen;
          const endY = footY + Math.sin(angle) * arrowLen;

          ctx.beginPath();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 2.5;
          ctx.moveTo(footX, footY);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          // Arrowhead
          const headLen = 7;
          ctx.beginPath();
          ctx.fillStyle = strokeColor;
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - headLen * Math.cos(angle - Math.PI / 6),
            endY - headLen * Math.sin(angle - Math.PI / 6)
          );
          ctx.lineTo(
            endX - headLen * Math.cos(angle + Math.PI / 6),
            endY - headLen * Math.sin(angle + Math.PI / 6)
          );
          ctx.closePath();
          ctx.fill();

          // Speed annotation
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(`${(speed * 3.0).toFixed(1)}m/s`, endX + 4, endY + 3);
        }
      }

      // Label Content
      let labelText = `${labelPrefix} #${entity.id} (${Math.round(entity.score * 100)}%)`;

      if (entity.category === 'person') {
        if (riskAssessment && riskAssessment.alertLevel !== 'Low') {
          labelText += ` • [${riskAssessment.alertLevel.toUpperCase()}]`;
        }
        if (showAgeTags && entity.smoothAge && entity.smoothAge !== 'Unknown') {
          labelText += ` • Age: ${entity.smoothAge}`;
        }
      }

      if (showDistanceTags && entity.distanceM !== undefined) {
        if (homographyResult) {
          labelText += ` • ${entity.distanceM.toFixed(1)}m`;
        } else {
          const sigma = (entity.distanceM * 0.12).toFixed(1);
          labelText += ` • ~${entity.distanceM.toFixed(1)}m (approx. ±${sigma}m)`;
        }
      }

      // Render Label Badge
      ctx.font = 'bold 11px sans-serif';
      const textMetrics = ctx.measureText(labelText);
      const badgeH = 18;
      const badgeW = textMetrics.width + 12;

      ctx.fillStyle = bgColor;
      ctx.fillRect(x, Math.max(0, y - badgeH), badgeW, badgeH);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, x + 6, Math.max(13, y - 4));
      ctx.restore();
    }
  }, [
    trackedEntities,
    zones,
    currentZonePoints,
    isDrawingZone,
    showAgeTags,
    showDistanceTags,
    homographyResult,
    riskAssessment,
    showSpeedArrows,
    showDistanceRings
  ]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center bg-slate-950 rounded-xl overflow-hidden border border-slate-800"
    >
      {/* Underlying Video Stream */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
      />

      {/* Interactive HUD Canvas Overlay */}
      <canvas
        ref={canvasOverlayRef}
        width={1280}
        height={720}
        onClick={handleCanvasClick}
        className={`absolute inset-0 w-full h-full object-contain ${
          isDrawingZone ? 'cursor-crosshair' : 'cursor-default'
        }`}
      />

      {/* Possible Weapon Alert Banner (Mandatory Human Verification Notice) */}
      {activeWeaponAlert && (
        <div className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between bg-red-950/95 border-2 border-red-500 text-white px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md animate-bounce">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-600/30 flex items-center justify-center shrink-0 border border-red-500">
              <ShieldAlert className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wide uppercase flex items-center gap-2 text-red-200">
                <span>Threat Alert Triggered</span>
                <span className="text-xs px-2 py-0.5 rounded bg-red-800 text-red-100 font-mono">
                  Track #{activeWeaponAlert.id}
                </span>
              </div>
              <p className="text-xs text-red-300 font-medium mt-0.5">
                Possible weapon detected ({activeWeaponAlert.cls}) — <strong className="underline decoration-red-400">NEEDS ON-SITE HUMAN VERIFICATION</strong>. Probabilistic assistive signal only.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-mono text-red-200 bg-red-900/60 px-2 py-1 rounded">
              Temporal Streak: {activeWeaponAlert.weaponStreak}/6
            </span>
          </div>
        </div>
      )}

      {/* Closest Approach TTC Countdown Indicator */}
      {minTtcPair && minTtcPair.ttc < 8.0 && (
        <div
          className={`absolute ${activeWeaponAlert ? 'top-24' : 'top-4'} left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border backdrop-blur-md shadow-xl text-xs font-mono transition-all ${
            minTtcPair.ttc < 2.5
              ? 'bg-rose-950/90 border-rose-500 text-rose-200 animate-pulse'
              : 'bg-amber-950/80 border-amber-600/80 text-amber-200'
          }`}
        >
          <Radio className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Trajectory Alert: #{minTtcPair.idA} & #{minTtcPair.idB} • Dist {minTtcPair.dist.toFixed(1)}m •{' '}
            <strong className="underline">TTC {minTtcPair.ttc.toFixed(1)}s</strong>
          </span>
        </div>
      )}

      {/* Scene-Cut / Recalibration Alert Banner */}
      {isSceneCutAlert && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 px-4 py-2 rounded-xl bg-amber-950/95 border-2 border-amber-500 text-amber-100 shadow-2xl backdrop-blur-md animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="text-xs">
            <span className="font-bold block text-white uppercase tracking-wider">
              Scene Cut / Camera Motion Detected
            </span>
            <span>{sceneCutMessage || 'Trackers reset. Ground plane calibration marked unverified.'}</span>
          </div>
          {onRecalibrateRequested && (
            <button
              onClick={onRecalibrateRequested}
              className="ml-2 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] shadow transition-colors"
            >
              Recalibrate
            </button>
          )}
        </div>
      )}

      {/* Playback Rate Correction Advisory Badge */}
      {playbackRateWarning && (
        <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-950/90 border border-indigo-700/80 text-indigo-200 text-xs font-mono shadow-lg backdrop-blur-md">
          <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          <span>{playbackRateWarning}</span>
        </div>
      )}

      {/* Top Left Live Stream Indicators */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 shadow-lg pointer-events-auto">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isStreaming ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isStreaming ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          </span>
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
            {isStreaming ? 'Live Stream' : 'Connecting'}
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-xs text-slate-400 truncate max-w-[140px]">
            {cameraSource.name}
          </span>
        </div>

        <button
          onClick={onRefreshCamera}
          className="p-1.5 rounded-lg bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700/60 shadow-lg pointer-events-auto transition-colors"
          title="Reconnect / Refresh Stream"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Top Right Zone Controls Button */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        {!isDrawingZone ? (
          <button
            onClick={() => setIsDrawingZone(true)}
            className="px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-colors"
          >
            <Crosshair className="w-3.5 h-3.5" />
            Draw Alert Zone
          </button>
        ) : (
          <div className="flex items-center gap-1.5 bg-slate-900/95 border border-indigo-500 p-1.5 rounded-lg shadow-2xl backdrop-blur-md">
            <input
              type="text"
              value={zoneNameInput}
              onChange={(e) => setZoneNameInput(e.target.value)}
              className="bg-slate-800 text-white text-xs px-2 py-1 rounded border border-slate-700 w-28 focus:outline-none"
              placeholder="Zone Name"
            />
            <select
              value={zoneCategoryFilter}
              onChange={(e) => setZoneCategoryFilter(e.target.value as DetectionCategory)}
              className="bg-slate-800 text-white text-xs px-2 py-1 rounded border border-slate-700 focus:outline-none"
            >
              <option value="person">People</option>
              <option value="animal">Animals</option>
              <option value="object">Objects</option>
              <option value="weapon">Weapons</option>
            </select>
            <button
              onClick={handleFinishZone}
              disabled={currentZonePoints.length < 3}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors"
            >
              Save ({currentZonePoints.length} pts)
            </button>
            <button
              onClick={handleCancelZone}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Active Zones List Drawer (Bottom Left) */}
      {zones.length > 0 && !isDrawingZone && (
        <div className="absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-1.5 max-w-md pointer-events-auto">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-slate-900/90 border border-slate-700/60 text-slate-300 backdrop-blur-md shadow"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: zone.color }}
              />
              <span>{zone.name}</span>
              <button
                onClick={() => onDeleteZone(zone.id)}
                className="text-slate-500 hover:text-red-400 ml-1"
                title="Delete Zone"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stream Offline / Placeholder Notice */}
      {!isStreaming && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6 text-center">
          <Camera className="w-12 h-12 text-slate-500 mb-3 animate-pulse" />
          <h3 className="text-base font-semibold text-slate-200">
            Awaiting CCTV / Camera Feed
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            Allow camera permissions or switch to the simulated CCTV test feed in the top bar to inspect live multi-class detection.
          </p>
        </div>
      )}
    </div>
  );
};
