/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - About & Testing View (Layer 4)
 * Styled with retro-floral-bg and retro-glass cinematic aesthetics.
 */

import React from 'react';
import {
  HelpCircle,
  FileText,
  Shield,
  Layers,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Code
} from 'lucide-react';

export function AboutTestingView() {
  return (
    <div className="flex-1 overflow-y-auto retro-floral-bg text-[#FDFBF7] p-6 sm:p-12 space-y-10 select-none">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="border-b border-amber-500/20 pb-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-[#F59E0B]">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#FEF3C7] tracking-tight font-display">About, Testing &amp; Architecture Roadmap</h2>
            <p className="text-xs text-[#D1C7BD]">Review open-source licenses, test lab guidelines, and feature implementation status.</p>
          </div>
        </div>

        {/* Feature Status Cards: Built vs Local-Only */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#FEF3C7] uppercase tracking-wider font-mono">
            Feature Implementation Status
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 rounded-3xl retro-glass space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span>Fully Built &amp; Verified Web Functions</span>
              </div>
              <ul className="text-xs text-[#D1C7BD] space-y-2 list-disc pl-4 leading-relaxed">
                <li>Hartley-normalized DLT Homography &amp; RANSAC floor calibration</li>
                <li>Three.js WebGL 2.0 3D Point Cloud &amp; interactive raycast ruler</li>
                <li>Multi-object Kalman tracking (ByteTrack / SORT) &amp; Kinematics</li>
                <li>Escalation risk engine, TTC calculations &amp; loitering zone polygons</li>
                <li>Web Crypto AES-GCM-256 &amp; SHA-256 tamper-evident security ledger</li>
                <li>Test Lab dHash deduplication, YOLO/COCO dataset exporter &amp; JSZip bundling</li>
                <li>IndexedDB local model weight cache &amp; WebGPU/WebGL/WASM backends</li>
                <li>Bilingual English &amp; Hindi (हिन्दी) localization &amp; error taxonomy</li>
              </ul>
            </div>

            <div className="p-6 rounded-3xl retro-glass space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                <AlertCircle className="w-4 h-4" />
                <span>Local AI &amp; Hardware Gateway Extensions</span>
              </div>
              <ul className="text-xs text-[#D1C7BD] space-y-2 list-disc pl-4 leading-relaxed">
                <li>Direct RTSP / ONVIF IP camera hardware gateway bridging (requires local proxy)</li>
                <li>Full transformer-based local YOLOv8 ONNX worker execution (mocked via heuristic bounding box detector in preview sandbox)</li>
                <li>Autonomous physical device actuation / door locking relays (strictly prohibited for threat safety)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Test Lab Guidelines */}
        <div className="p-6 rounded-3xl retro-glass space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#FEF3C7] font-display">
            <Layers className="w-4 h-4 text-[#F59E0B]" />
            <span>Test Lab &amp; Dataset Builder Guidelines</span>
          </div>
          <p className="text-xs text-[#D1C7BD] leading-relaxed">
            The Test Lab module allows researchers and operators to capture freeze-frame CCTV data, automatically assign bounding boxes, apply privacy face-blur filters, and export standardized YOLO/COCO dataset archives. All scenes are isolated by scene ID to prevent temporal data leakage across training, validation, and test splits.
          </p>
        </div>

        {/* Licensing & Dependencies */}
        <div className="p-6 rounded-3xl retro-glass space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#FEF3C7] font-display">
            <Shield className="w-4 h-4 text-[#10B981]" />
            <span>Open Source Licences &amp; Attribution</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <div className="p-3.5 bg-[rgba(20,12,8,0.7)] rounded-2xl border border-amber-500/20">
              <div className="font-bold text-white">Three.js</div>
              <div className="text-[#D1C7BD] mt-1">MIT License</div>
            </div>
            <div className="p-3.5 bg-[rgba(20,12,8,0.7)] rounded-2xl border border-amber-500/20">
              <div className="font-bold text-white">Tailwind CSS</div>
              <div className="text-[#D1C7BD] mt-1">MIT License</div>
            </div>
            <div className="p-3.5 bg-[rgba(20,12,8,0.7)] rounded-2xl border border-amber-500/20">
              <div className="font-bold text-white">SpatialMapper 3D Core</div>
              <div className="text-[#D1C7BD] mt-1">Apache-2.0</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
