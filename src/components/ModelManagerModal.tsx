/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Model Manager & Licensing Modal
 * Manages active models, compute backends (WebGPU, WebGL, WASM),
 * local weight cache footprint, benchmarks, and legal/ethical licensing.
 */

import React, { useState, useEffect } from 'react';
import {
  Cpu,
  X,
  HardDrive,
  Trash2,
  Zap,
  Shield,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  Lock,
  FileText,
  Activity,
  Award
} from 'lucide-react';
import {
  ModelManager,
  ModelMetadata,
  ExecutionBackend,
  BUILTIN_MODELS
} from '../core/models/modelManager';

interface ModelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelManager: ModelManager;
  onActiveModelChanged?: (modelId: string) => void;
}

export function ModelManagerModal({
  isOpen,
  onClose,
  modelManager,
  onActiveModelChanged
}: ModelManagerModalProps) {
  const [activeTab, setActiveTab] = useState<'models' | 'backends' | 'licensing'>('models');
  const [models, setModels] = useState<ModelMetadata[]>(BUILTIN_MODELS);
  const [activeModelId, setActiveModelId] = useState<string>(modelManager.getActiveModelId());
  const [activeBackend, setActiveBackend] = useState<ExecutionBackend>(modelManager.getActiveBackend());
  const [storageBytes, setStorageBytes] = useState<number>(0);
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [benchmarkResult, setBenchmarkResult] = useState<{
    averageLatencyMs: number;
    throughputFps: number;
  } | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);

  // Load storage footprint
  useEffect(() => {
    if (isOpen) {
      modelManager.calculateStorageFootprint().then(setStorageBytes);
      setActiveModelId(modelManager.getActiveModelId());
      setActiveBackend(modelManager.getActiveBackend());
      setModels(modelManager.getAllModels());
    }
  }, [isOpen, modelManager]);

  const handleSelectModel = (id: string) => {
    modelManager.setActiveModelId(id);
    setActiveModelId(id);
    if (onActiveModelChanged) {
      onActiveModelChanged(id);
    }
  };

  const handleSelectBackend = (backend: ExecutionBackend) => {
    modelManager.setActiveBackend(backend);
    setActiveBackend(backend);
  };

  const handlePurgeCache = async () => {
    setIsPurging(true);
    await modelManager.purgeModelCache();
    setStorageBytes(0);
    setIsPurging(false);
  };

  const handleRunBenchmark = async () => {
    setIsBenchmarking(true);
    const res = await modelManager.runSyntheticBenchmark(activeBackend);
    setBenchmarkResult(res);
    setIsBenchmarking(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 overflow-hidden">
      <div className="w-full max-w-4xl h-[88vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-950/70 px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Model Manager &amp; Licensing
                </h2>
                <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800/80 px-2 py-0.5 rounded-full font-mono">
                  Phase J
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Local weight cache, WebGPU/WebGL acceleration, and open-source compliance.
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('models')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors ${
                activeTab === 'models'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Models &amp; Cache
            </button>
            <button
              onClick={() => setActiveTab('backends')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors ${
                activeTab === 'backends'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Compute Backends
            </button>
            <button
              onClick={() => setActiveTab('licensing')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors ${
                activeTab === 'licensing'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              Licences &amp; Ethics
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* =========================================================================
              TAB 1: MODELS & LOCAL CACHE
          ========================================================================= */}
          {activeTab === 'models' && (
            <div className="space-y-6">
              {/* Storage Footprint Ribbon */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-950/80 border border-indigo-800 flex items-center justify-center text-indigo-400">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">IndexedDB Local Weight Cache</div>
                    <div className="text-[11px] text-slate-400">
                      {(storageBytes / (1024 * 1024)).toFixed(1)} MB cached locally. Models load instantly offline without network requests.
                    </div>
                  </div>
                </div>

                <button
                  onClick={handlePurgeCache}
                  disabled={isPurging || storageBytes === 0}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  {isPurging ? 'Purging...' : 'Clear Local Cache'}
                </button>
              </div>

              {/* Models List */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Available Model Registry
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {models.map((m) => {
                    const isSelected = m.id === activeModelId;
                    return (
                      <div
                        key={m.id}
                        onClick={() => handleSelectModel(m.id)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-950/30'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-3 h-3 rounded-full ${isSelected ? 'bg-indigo-400 animate-pulse' : 'bg-slate-600'}`} />
                            <h4 className="text-sm font-bold text-white">{m.name}</h4>
                            <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                              v{m.version}
                            </span>
                            {m.isBuiltIn ? (
                              <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-mono">
                                Built-In
                              </span>
                            ) : (
                              <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded-full font-mono">
                                Custom User Model
                              </span>
                            )}
                          </div>

                          <div className="text-xs font-mono text-slate-400">
                            {(m.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                          {m.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono">
                          <div>Arch: <span className="text-indigo-300">{m.architecture}</span></div>
                          <div>Classes: <span className="text-slate-200">{m.classesCount}</span></div>
                          <div>Input: <span className="text-slate-200">{m.inputShape[2]}x{m.inputShape[3]}</span></div>
                          <div className="truncate max-w-[200px]" title={m.sha256}>
                            SHA-256: <span className="text-cyan-400">{m.sha256.substring(0, 10)}...</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 2: COMPUTE BACKENDS & BENCHMARK
          ========================================================================= */}
          {activeTab === 'backends' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    id: 'webgpu' as ExecutionBackend,
                    title: 'WebGPU (Hardware)',
                    badge: 'Fastest (Chromium 113+)',
                    desc: 'Direct GPU compute shader execution via standard WGSL pipelines. Up to 3.5x faster throughput on compatible GPUs.',
                    accent: 'border-emerald-500/80 bg-emerald-950/20 text-emerald-300'
                  },
                  {
                    id: 'webgl' as ExecutionBackend,
                    title: 'WebGL 2.0 (Shader)',
                    badge: 'Universal GPU',
                    desc: 'Texture fragment shader compute. Broad compatibility across Safari, Firefox, Android Chrome, and iOS WebKit.',
                    accent: 'border-indigo-500/80 bg-indigo-950/20 text-indigo-300'
                  },
                  {
                    id: 'wasm' as ExecutionBackend,
                    title: 'WebAssembly SIMD',
                    badge: 'CPU Fallback',
                    desc: 'Multi-threaded 128-bit SIMD vector instructions running on client CPU. Fully deterministic, zero WebGL context loss risk.',
                    accent: 'border-amber-500/80 bg-amber-950/20 text-amber-300'
                  }
                ].map((b) => {
                  const isSelected = activeBackend === b.id;
                  return (
                    <div
                      key={b.id}
                      onClick={() => handleSelectBackend(b.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? `border-2 ${b.accent} shadow-lg shadow-indigo-950/40`
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-bold text-white">{b.title}</h4>
                          <span className="text-[10px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full font-mono text-slate-300">
                            {b.badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{b.desc}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">
                          {isSelected ? 'Active Backend' : 'Select'}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Synthetic Benchmark Card */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-cyan-400" />
                      Client-Side Compute Benchmark
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Runs 5 iterations of simulated tensor convolutions to test device throughput on the selected {activeBackend.toUpperCase()} backend.
                    </p>
                  </div>

                  <button
                    onClick={handleRunBenchmark}
                    disabled={isBenchmarking}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {isBenchmarking ? 'Benchmarking...' : 'Run Benchmark'}
                  </button>
                </div>

                {benchmarkResult && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-900 border border-slate-800 rounded-xl font-mono text-center">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Simulated Inference Latency</div>
                      <div className="text-2xl font-bold text-cyan-400">
                        {benchmarkResult.averageLatencyMs} ms
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Max Projected Throughput</div>
                      <div className="text-2xl font-bold text-emerald-400">
                        {benchmarkResult.throughputFps} FPS
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 3: LICENCES & ETHICS
          ========================================================================= */}
          {activeTab === 'licensing' && (
            <div className="space-y-6">
              {/* Critical Legal Disclaimer */}
              <div className="p-4 bg-amber-950/30 border border-amber-900/60 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider font-mono">
                  <Shield className="w-4 h-4 text-amber-400" />
                  Mandatory Legal Disclaimer: Weapon Detection &amp; Demographics
                </div>
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  <strong>Zero Automated Lethal / Force Action:</strong> Candidate weapon detections (knife, firearm) are strictly flagged as <em>"possible weapon: needs human verification"</em> and must never be treated as confirmed fact by automated systems. Demographics (age group) are coarse geometrical height priors used exclusively for optical distance calibration and are <strong>strictly excluded</strong> from security risk scoring, behavior classification, and automated alerts.
                </p>
              </div>

              {/* Open Source Licenses Matrix */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Open Source Attribution &amp; Permissions
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-white text-xs">SpatialMapper 3D Core</div>
                      <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                        Apache-2.0
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Licensed under the Apache License, Version 2.0. Permitted for commercial use, modification, and distribution with preserved notices.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-white text-xs">Three.js &amp; WebGL Math</div>
                      <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                        MIT License
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Copyright © 2010-2026 Three.js authors. Used for WebGL 2.0 point cloud rendering, camera raycasting, and geometric ground homography.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-white text-xs">Ultralytics YOLOv8 Weights</div>
                      <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                        AGPL-3.0 / Export
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Pre-trained base weights provided under Ultralytics open research license. ONNX client runtime executes strictly in local browser sandbox.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-white text-xs">Lucide Icons &amp; Tailwind</div>
                      <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                        ISC / MIT
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      User interface typography and vector iconography licensed under permissive open source terms.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
