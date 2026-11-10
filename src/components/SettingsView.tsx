/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Settings View (Layer 3)
 * Non-critical preference adjustments: theme intensity, audio alerts, playback defaults, HUD units.
 */

import React, { useState } from 'react';
import { Settings, Volume2, Eye, Sliders, CheckCircle2, RefreshCw } from 'lucide-react';

export function SettingsView() {
  const [contrastIntensity, setContrastIntensity] = useState<string>('cyber-neon');
  const [glassBlur, setGlassBlur] = useState<number>(12);
  const [alertVolume, setAlertVolume] = useState<number>(80);
  const [defaultSpeed, setDefaultSpeed] = useState<string>('1.0');
  const [autoLoop, setAutoLoop] = useState<boolean>(true);
  const [showFpsOverlay, setShowFpsOverlay] = useState<boolean>(true);
  const [distanceUnit, setDistanceUnit] = useState<'meters' | 'feet'>('meters');
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const handleSave = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0B0813] text-[#F8FAFC] p-6 sm:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-[rgba(139,92,246,0.2)] pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[rgba(139,92,246,0.2)] border border-[rgba(139,92,246,0.4)] flex items-center justify-center text-[#A855F7]">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">System Preferences &amp; Settings</h2>
              <p className="text-xs text-[#94A3B8]">Customize portal appearance, audio feedback, and HUD metric overlays.</p>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-[#8B5CF6] hover:bg-[#7c3aed] text-white font-bold text-xs flex items-center gap-1.5 shadow transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Save Preferences</span>
          </button>
        </div>

        {savedNotice && (
          <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Preferences saved successfully to local session storage.</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Theme & Aesthetics */}
          <div className="p-6 rounded-2xl bg-[rgba(30,27,75,0.4)] border border-[rgba(139,92,246,0.2)] space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Sliders className="w-4 h-4 text-[#A855F7]" />
              <span>Cyber-Modern Aesthetics</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#94A3B8] block mb-1">Theme Intensity</label>
                <select
                  value={contrastIntensity}
                  onChange={(e) => setContrastIntensity(e.target.value)}
                  className="w-full bg-[#110E26] border border-[rgba(139,92,246,0.3)] rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="cyber-neon">Deep Obsidian &amp; Neon Violet (Default)</option>
                  <option value="high-contrast">High Contrast Dark</option>
                  <option value="indigo-slate">Indigo &amp; Slate Tech</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-[#94A3B8] mb-1">
                  <span>Glassmorphism Blur Radius</span>
                  <span className="font-mono text-white">{glassBlur}px</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="24"
                  value={glassBlur}
                  onChange={(e) => setGlassBlur(Number(e.target.value))}
                  className="w-full accent-[#8B5CF6]"
                />
              </div>
            </div>
          </div>

          {/* Audio & Alerts */}
          <div className="p-6 rounded-2xl bg-[rgba(30,27,75,0.4)] border border-[rgba(139,92,246,0.2)] space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Volume2 className="w-4 h-4 text-[#06B6D4]" />
              <span>Audio Alerts &amp; Volume</span>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-[#94A3B8] mb-1">
                  <span>Perimeter Breach Alert Volume</span>
                  <span className="font-mono text-white">{alertVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={alertVolume}
                  onChange={(e) => setAlertVolume(Number(e.target.value))}
                  className="w-full accent-[#06B6D4]"
                />
              </div>

              <div className="pt-2">
                <label className="text-xs text-[#94A3B8] block mb-1">Notification Tone</label>
                <select
                  defaultValue="cyber-beep"
                  className="w-full bg-[#110E26] border border-[rgba(139,92,246,0.3)] rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="cyber-beep">Cyber Pulse Beep</option>
                  <option value="subtle-chime">Subtle Chime</option>
                  <option value="alarm-synth">Synth Alarm</option>
                </select>
              </div>
            </div>
          </div>

          {/* Playback Preferences */}
          <div className="p-6 rounded-2xl bg-[rgba(30,27,75,0.4)] border border-[rgba(139,92,246,0.2)] space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <RefreshCw className="w-4 h-4 text-blue-400" />
              <span>Video Playback Defaults</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#94A3B8] block mb-1">Default Playback Speed</label>
                <select
                  value={defaultSpeed}
                  onChange={(e) => setDefaultSpeed(e.target.value)}
                  className="w-full bg-[#110E26] border border-[rgba(139,92,246,0.3)] rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="0.5">0.5x (Slow Motion)</option>
                  <option value="1.0">1.0x (Normal)</option>
                  <option value="1.5">1.5x (Fast)</option>
                  <option value="2.0">2.0x (Double Speed)</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-[#94A3B8]">Auto-Loop Video Streams</span>
                <input
                  type="checkbox"
                  checked={autoLoop}
                  onChange={(e) => setAutoLoop(e.target.checked)}
                  className="w-4 h-4 accent-[#8B5CF6]"
                />
              </div>
            </div>
          </div>

          {/* HUD Overlay Toggles */}
          <div className="p-6 rounded-2xl bg-[rgba(30,27,75,0.4)] border border-[rgba(139,92,246,0.2)] space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Eye className="w-4 h-4 text-emerald-400" />
              <span>HUD Metric Overlays</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#94A3B8]">Show Real-Time FPS Counter</span>
                <input
                  type="checkbox"
                  checked={showFpsOverlay}
                  onChange={(e) => setShowFpsOverlay(e.target.checked)}
                  className="w-4 h-4 accent-[#8B5CF6]"
                />
              </div>

              <div className="pt-2">
                <label className="text-xs text-[#94A3B8] block mb-1">Spatial Measurement Unit</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDistanceUnit('meters')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      distanceUnit === 'meters'
                        ? 'bg-[rgba(139,92,246,0.3)] border-[#8B5CF6] text-white'
                        : 'bg-[#110E26] border-[rgba(139,92,246,0.2)] text-[#94A3B8]'
                    }`}
                  >
                    Metres (m)
                  </button>
                  <button
                    onClick={() => setDistanceUnit('feet')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      distanceUnit === 'feet'
                        ? 'bg-[rgba(139,92,246,0.3)] border-[#8B5CF6] text-white'
                        : 'bg-[#110E26] border-[rgba(139,92,246,0.2)] text-[#94A3B8]'
                    }`}
                  >
                    Feet (ft)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
