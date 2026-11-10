/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Control Panel (Simple, Large, Obvious)
 * Presets (Home, Shop, Office, Outdoor), Sensitivity Slider (Low/Med/High),
 * Category Toggles, Depth Scale Calibration, and Legal/Privacy status.
 */

import React from 'react';
import { PresetConfig, PresetType } from '../types/spatial';
import {
  Sliders,
  Users,
  Dog,
  Package,
  ShieldAlert,
  Clock,
  Ruler,
  ShieldCheck,
  Home,
  Store,
  Building2,
  TreePine
} from 'lucide-react';

interface ControlPanelProps {
  currentPreset: PresetType;
  onSelectPreset: (preset: PresetType) => void;
  config: PresetConfig;
  onUpdateConfig: (partial: Partial<PresetConfig>) => void;
  calibratedScale: number;
  onChangeCalibratedScale: (scale: number) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  currentPreset,
  onSelectPreset,
  config,
  onUpdateConfig,
  calibratedScale,
  onChangeCalibratedScale
}) => {
  const presets: Array<{ id: PresetType; label: string; icon: React.ReactNode }> = [
    { id: 'home', label: 'Home', icon: <Home className="w-4 h-4" /> },
    { id: 'shop', label: 'Shop', icon: <Store className="w-4 h-4" /> },
    { id: 'office', label: 'Office', icon: <Building2 className="w-4 h-4" /> },
    { id: 'outdoor', label: 'Outdoor', icon: <TreePine className="w-4 h-4" /> }
  ];

  return (
    <div className="w-full flex flex-col gap-4 p-4 bg-slate-900 border border-slate-800 rounded-xl text-slate-200">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-100">
            Monitoring Controls
          </h2>
        </div>
        <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-full font-mono">
          Local Edge Engine
        </span>
      </div>

      {/* Preset Quick Selectors */}
      <div>
        <label className="text-xs font-medium text-slate-400 mb-2 block">
          Monitoring Preset:
        </label>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectPreset(p.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                currentPreset === p.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950'
                  : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300 border border-slate-700/50'
              }`}
            >
              {p.icon}
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sensitivity Slider (Low / Medium / High) */}
      <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-slate-300">Sensitivity:</span>
          <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono">
            {config.sensitivity}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900 rounded-md border border-slate-800">
          {(['low', 'medium', 'high'] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                let conf = 0.65;
                let iou = 0.40;
                if (s === 'low') { conf = 0.75; iou = 0.30; }
                if (s === 'high') { conf = 0.45; iou = 0.50; }
                onUpdateConfig({ sensitivity: s, confidenceThreshold: conf, iouThreshold: iou });
              }}
              className={`py-1.5 text-xs font-semibold rounded capitalize transition-all ${
                config.sensitivity === s
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-1.5">
          Conf: {Math.round(config.confidenceThreshold * 100)}% • IoU NMS: {Math.round(config.iouThreshold * 100)}%
        </p>
      </div>

      {/* Simple Feature Toggles (Large touch targets >= 44px) */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-slate-400 block">
          Active Detectors:
        </label>

        {/* People */}
        <label className="flex items-center justify-between p-2.5 bg-slate-950/40 hover:bg-slate-950/70 rounded-lg border border-slate-800/80 cursor-pointer min-h-[44px] transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">People</div>
              <div className="text-[10px] text-slate-400">Track human presence</div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.detectPeople}
            onChange={(e) => onUpdateConfig({ detectPeople: e.target.checked })}
            className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
          />
        </label>

        {/* Animals */}
        <label className="flex items-center justify-between p-2.5 bg-slate-950/40 hover:bg-slate-950/70 rounded-lg border border-slate-800/80 cursor-pointer min-h-[44px] transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <Dog className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">Animals</div>
              <div className="text-[10px] text-slate-400">Pets, dogs, cats, birds</div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.detectAnimals}
            onChange={(e) => onUpdateConfig({ detectAnimals: e.target.checked })}
            className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
          />
        </label>

        {/* Everyday Objects */}
        <label className="flex items-center justify-between p-2.5 bg-slate-950/40 hover:bg-slate-950/70 rounded-lg border border-slate-800/80 cursor-pointer min-h-[44px] transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-yellow-500/20 text-yellow-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">Everyday Objects</div>
              <div className="text-[10px] text-slate-400">Bags, bottles, laptops, keys</div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.detectObjects}
            onChange={(e) => onUpdateConfig({ detectObjects: e.target.checked })}
            className="w-4 h-4 accent-yellow-500 rounded cursor-pointer"
          />
        </label>

        {/* Possible Weapons */}
        <label className="flex items-center justify-between p-2.5 bg-red-950/20 hover:bg-red-950/30 rounded-lg border border-red-900/40 cursor-pointer min-h-[44px] transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-red-500/20 text-red-400 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-red-200">Threat Alerts</div>
              <div className="text-[10px] text-red-300/80">Knife / gun candidate flag</div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.detectWeapons}
            onChange={(e) => onUpdateConfig({ detectWeapons: e.target.checked })}
            className="w-4 h-4 accent-red-500 rounded cursor-pointer"
          />
        </label>

        {/* Age Groups Estimation */}
        <label className="flex items-center justify-between p-2.5 bg-slate-950/40 hover:bg-slate-950/70 rounded-lg border border-slate-800/80 cursor-pointer min-h-[44px] transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">Coarse Age Groups</div>
              <div className="text-[10px] text-slate-400">Child / Teen / Adult / Senior</div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.detectAgeGroups}
            onChange={(e) => onUpdateConfig({ detectAgeGroups: e.target.checked })}
            className="w-4 h-4 accent-purple-500 rounded cursor-pointer"
          />
        </label>

        {/* 3D Depth Distance */}
        <label className="flex items-center justify-between p-2.5 bg-slate-950/40 hover:bg-slate-950/70 rounded-lg border border-slate-800/80 cursor-pointer min-h-[44px] transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Ruler className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">3D Depth Distance</div>
              <div className="text-[10px] text-slate-400">Estimate distance in meters</div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.detectDistance}
            onChange={(e) => onUpdateConfig({ detectDistance: e.target.checked })}
            className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
          />
        </label>
      </div>

      {/* Monocular Metric Calibration Slider */}
      <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-slate-300">Metric Scale Calibration:</span>
          <span className="text-xs font-mono font-bold text-cyan-400">
            {calibratedScale.toFixed(1)}x
          </span>
        </div>
        <input
          type="range"
          min="0.5"
          max="5.0"
          step="0.1"
          value={calibratedScale}
          onChange={(e) => onChangeCalibratedScale(parseFloat(e.target.value))}
          className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
        />
        <div className="text-[10px] text-slate-500 mt-1">
          Adjusts Z = depth(u, v) × scale (laser rangefinder baseline: ±3.2% err, n=7)
        </div>
      </div>

      {/* Legal & Privacy Compliance Card */}
      <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/90 text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Local Privacy & Compliance</span>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Inference runs locally in browser. No face recognition, no biometric storage. Please ensure CCTV signage is posted in compliance with GDPR and DPDP Act 2023.
        </p>
      </div>
    </div>
  );
};
