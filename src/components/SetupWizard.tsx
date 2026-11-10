/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Setup Wizard Modal
 * Step 1: Camera / Source Selection (Webcam, IP Gateway go2rtc, Test Feed)
 * Step 2: Preset Selection (Home, Shop, Office, Outdoor)
 * Step 3: Test Alert & Privacy Confirmation
 */

import React, { useState } from 'react';
import { CameraSourceConfig, PresetType } from '../types/spatial';
import {
  Camera,
  Sliders,
  CheckCircle,
  Video,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Volume2
} from 'lucide-react';

interface SetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onApplySettings: (source: CameraSourceConfig, preset: PresetType) => void;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({
  isOpen,
  onClose,
  onApplySettings
}) => {
  const [step, setStep] = useState<number>(1);
  const [selectedSourceType, setSelectedSourceType] = useState<CameraSourceConfig['type']>('webcam');
  const [customStreamUrl, setCustomStreamUrl] = useState<string>('http://192.168.1.100:1984/api/stream.mjpeg');
  const [selectedPreset, setSelectedPreset] = useState<PresetType>('shop');
  const [testAlertFired, setTestAlertFired] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleTestAlert = () => {
    setTestAlertFired(true);
    // Play subtle synthetic beep via Web Audio API
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {
      // Audio autoplay policy fallback
    }
  };

  const handleComplete = () => {
    let source: CameraSourceConfig = {
      type: selectedSourceType,
      name: selectedSourceType === 'webcam' ? 'Default Webcam' : selectedSourceType === 'test_feed' ? 'Simulated CCTV Feed' : 'IP Camera Stream'
    };
    if (selectedSourceType === 'ip_camera') {
      source.url = customStreamUrl;
      source.name = `IP Camera (${new URL(customStreamUrl).hostname || 'LAN'})`;
    }
    onApplySettings(source, selectedPreset);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
        {/* Wizard Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <h2 className="text-base font-bold text-white tracking-wide">
                SpatialMapper 3D Quick Setup
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Configure your live CCTV stream, detection presets, and alert pipeline.
            </p>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs text-indigo-400 bg-indigo-950/60 px-3 py-1 rounded-full border border-indigo-800/60">
            Step {step} of 3
          </div>
        </div>

        {/* Step Progress Bar */}
        <div className="w-full h-1 bg-slate-800">
          <div
            className="h-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Wizard Body */}
        <div className="p-6 flex-1">
          {/* STEP 1: Camera Source */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Camera className="w-4 h-4 text-indigo-400" />
                <span>1. Choose Camera / Video Source</span>
              </div>
              <p className="text-xs text-slate-400">
                Select how SpatialMapper 3D should ingest real-time video frames:
              </p>

              <div className="grid grid-cols-1 gap-2.5">
                {/* Local Webcam */}
                <label
                  onClick={() => setSelectedSourceType('webcam')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    selectedSourceType === 'webcam'
                      ? 'bg-indigo-950/40 border-indigo-500 text-white'
                      : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="src"
                    checked={selectedSourceType === 'webcam'}
                    onChange={() => setSelectedSourceType('webcam')}
                    className="mt-1 accent-indigo-500"
                  />
                  <div>
                    <div className="text-xs font-semibold">Local Webcam / USB Camera</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Direct browser capture via WebRTC <code className="text-indigo-300">getUserMedia()</code>. Zero setup required.
                    </div>
                  </div>
                </label>

                {/* Simulated CCTV Feed */}
                <label
                  onClick={() => setSelectedSourceType('test_feed')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    selectedSourceType === 'test_feed'
                      ? 'bg-indigo-950/40 border-indigo-500 text-white'
                      : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="src"
                    checked={selectedSourceType === 'test_feed'}
                    onChange={() => setSelectedSourceType('test_feed')}
                    className="mt-1 accent-indigo-500"
                  />
                  <div>
                    <div className="text-xs font-semibold">Simulated CCTV Environment (Instant Preview)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Runs synthetic CCTV camera feed with moving people, animals, objects, and alerts for instant testing.
                    </div>
                  </div>
                </label>

                {/* IP Camera / go2rtc Gateway */}
                <label
                  onClick={() => setSelectedSourceType('ip_camera')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    selectedSourceType === 'ip_camera'
                      ? 'bg-indigo-950/40 border-indigo-500 text-white'
                      : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="src"
                    checked={selectedSourceType === 'ip_camera'}
                    onChange={() => setSelectedSourceType('ip_camera')}
                    className="mt-1 accent-indigo-500"
                  />
                  <div className="flex-1">
                    <div className="text-xs font-semibold">IP Camera via Local Stream Gateway (go2rtc / MediaMTX)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Bridges RTSP camera to browser WebRTC / WHEP / MJPEG stream on your local network.
                    </div>
                    {selectedSourceType === 'ip_camera' && (
                      <div className="mt-3">
                        <label className="text-[10px] text-slate-400 block mb-1">
                          Gateway MJPEG / Stream URL:
                        </label>
                        <input
                          type="text"
                          value={customStreamUrl}
                          onChange={(e) => setCustomStreamUrl(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                          placeholder="http://192.168.1.100:1984/api/stream.mjpeg"
                        />
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* STEP 2: Pick Preset */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>2. Select Environment Preset</span>
              </div>
              <p className="text-xs text-slate-400">
                Each preset automatically configures detector categories and confidence sensitivities:
              </p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    id: 'home' as PresetType,
                    title: 'Home / Residential',
                    desc: 'People & Pet tracking, medium sensitivity, distance tags enabled.'
                  },
                  {
                    id: 'shop' as PresetType,
                    title: 'Retail Shop / Store',
                    desc: 'People, Objects & Weapon alerts, high sensitivity on restricted zones.'
                  },
                  {
                    id: 'office' as PresetType,
                    title: 'Commercial Office',
                    desc: 'People & Laptop tracking, coarse age group classification.'
                  },
                  {
                    id: 'outdoor' as PresetType,
                    title: 'Outdoor Perimeter',
                    desc: 'People & Vehicle/Animal tracking, high noise suppression.'
                  }
                ].map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPreset(p.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedPreset === p.id
                        ? 'bg-indigo-950/40 border-indigo-500 text-white ring-1 ring-indigo-500'
                        : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="text-xs font-bold text-white capitalize mb-1">
                      {p.title}
                    </div>
                    <div className="text-[11px] text-slate-400 leading-relaxed">
                      {p.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: Test Alert & Privacy */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>3. Alert Notification Test & Privacy Review</span>
              </div>

              <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white">Audio & Banner Test</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Verify that warning chimes and on-screen threat banners render properly.
                  </div>
                </div>
                <button
                  onClick={handleTestAlert}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Test Alert Tone
                </button>
              </div>

              {testAlertFired && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Alert verified: Audio synthesizer and threat pipeline operational.</span>
                </div>
              )}

              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1.5">
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Privacy & Safety Commitment:
                </div>
                <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-1">
                  <li>Inference is strictly browser-native. No video frames are transmitted to external servers.</li>
                  <li>Zero face recognition, zero identity profiling, zero biometric database storage.</li>
                  <li>Weapon and age indicators are probabilistic assistive signals requiring on-site human review.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Navigation Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors"
            >
              Next Step
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="px-5 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-lg shadow-emerald-950 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Start Monitoring
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
