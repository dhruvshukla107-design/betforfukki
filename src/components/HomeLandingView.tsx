/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Home Landing View (Layer 1)
 * Clean, Aesthetic, & Welcoming Retro-Warm Cinematic Portal
 */

import React from 'react';
import {
  Box,
  Video,
  Compass,
  FlaskConical,
  ArrowRight,
  Camera,
  ShieldCheck,
  Sparkles,
  Film
} from 'lucide-react';

interface HomeLandingViewProps {
  onLaunchWorkspace: () => void;
  onOpenCalibration: () => void;
  onOpenTestLab: () => void;
  onOpenModelManager: () => void;
  onOpenSourcePicker?: () => void;
}

export function HomeLandingView({
  onLaunchWorkspace,
  onOpenCalibration,
  onOpenTestLab,
  onOpenModelManager,
  onOpenSourcePicker
}: HomeLandingViewProps) {
  return (
    <div className="relative flex-1 overflow-y-auto retro-floral-bg text-[#FDFBF7] px-6 sm:px-16 py-20 flex flex-col items-center justify-between select-none">
      {/* Cinematic Golden Hour Ambient Glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 opacity-40">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-[#D97706]/30 via-[#B45309]/15 to-transparent blur-[160px]" />
      </div>

      {/* Hero Header */}
      <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8 my-auto">
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full retro-glass text-[#F59E0B] text-xs font-mono tracking-wider shadow-lg">
          <Camera className="w-3.5 h-3.5 text-[#10B981]" />
          <span>Cinematic Optics &amp; 3D Spatial Intelligence</span>
        </div>

        <h1 className="text-4xl sm:text-7xl font-extrabold tracking-tight text-[#FEF3C7] leading-[1.1] font-display">
          Spatial Mapping in <br />
          <span className="bg-gradient-to-r from-[#F59E0B] via-[#D97706] to-[#10B981] bg-clip-text text-transparent">
            Golden-Hour Clarity.
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-base sm:text-lg text-[#D1C7BD] leading-relaxed font-light">
          Welcome to SpatialMapper 3D. Transform any video source into an immersive metric workspace with zero server latency and complete client-side privacy.
        </p>

        {/* Primary Action Buttons (Uncluttered & Welcoming) */}
        <div className="flex flex-wrap items-center justify-center gap-5 pt-4">
          <button
            onClick={onLaunchWorkspace}
            className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#D97706] via-[#B45309] to-[#065F46] hover:opacity-95 text-white font-bold text-sm flex items-center gap-3 shadow-2xl shadow-[#D97706]/30 transition-all transform hover:-translate-y-0.5 border border-amber-500/20 font-display"
          >
            <Video className="w-4 h-4" />
            <span>Launch Canvas Workspace</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>

          <button
            onClick={onOpenCalibration}
            className="px-7 py-4 rounded-2xl retro-glass text-[#FEF3C7] font-semibold text-sm flex items-center gap-2.5 transition-all font-display"
          >
            <Compass className="w-4 h-4 text-[#F59E0B]" />
            <span>Calibrate Floor Geometry</span>
          </button>

          <button
            onClick={onOpenTestLab}
            className="px-7 py-4 rounded-2xl retro-glass text-[#FEF3C7] font-semibold text-sm flex items-center gap-2.5 transition-all font-display"
          >
            <FlaskConical className="w-4 h-4 text-[#10B981]" />
            <span>Test Lab &amp; Datasets</span>
          </button>

          {onOpenSourcePicker && (
            <button
              onClick={onOpenSourcePicker}
              className="px-7 py-4 rounded-2xl retro-glass text-[#FEF3C7] font-semibold text-sm flex items-center gap-2.5 transition-all font-display"
            >
              <Film className="w-4 h-4 text-amber-400" />
              <span>Online Player &amp; Sources</span>
            </button>
          )}
        </div>

        {/* Calm Feature Cards (3 Simplified Options) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto pt-12">
          <div className="p-6 rounded-3xl retro-glass text-left space-y-3 transition-all">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-[#F59E0B]">
              <Box className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white font-display">3D Point Clouds</h3>
            <p className="text-xs text-[#D1C7BD] leading-relaxed">
              Real-time monocular depth estimation and Three.js 3D reconstruction instantly rendered in your browser.
            </p>
          </div>

          <div className="p-6 rounded-3xl retro-glass text-left space-y-3 transition-all">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[#10B981]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white font-display">Escalation &amp; Risk</h3>
            <p className="text-xs text-[#D1C7BD] leading-relaxed">
              Mahalanobis proximity tracking, TTC countdowns, and tamper-evident SHA-256 audit logs.
            </p>
          </div>

          <div className="p-6 rounded-3xl retro-glass text-left space-y-3 transition-all" onClick={onOpenModelManager} role="button">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-[#38BDF8]">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white font-display">Edge AI Models</h3>
            <p className="text-xs text-[#D1C7BD] leading-relaxed">
              Seamlessly switch between WebGPU, WebGL, and WASM accelerated detection runtimes.
            </p>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="relative z-10 text-center text-xs text-[#A89F91] pt-12 font-mono">
        SpatialMapper 3D · 100% Client-Side Private Edge AI · Zero Cloud Telemetry Required
      </div>
    </div>
  );
}
