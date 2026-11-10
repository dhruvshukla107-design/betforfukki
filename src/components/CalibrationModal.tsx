/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Camera Calibration & Phase A Test Verification Modal
 * 
 * Features:
 *   1. Floor Homography Calibration: Click >= 4 floor points, assign real metric distances,
 *      computes DLT + Hartley normalization + SVD + RANSAC with live reprojection RMSE.
 *   2. Camera Intrinsics K & Distortion parameters (fx from HFOV, k1, k2).
 *   3. Camera-height & Pitch fallback (hc, theta).
 *   4. Integrated Phase A Automated Unit Test Harness (displays pass/fail and numeric proofs).
 */

import React, { useState } from 'react';
import { CameraModel } from '../core/calibration/cameraModel';
import { CalibrationCorrespondence, GroundPlaneHomography, HomographyResult } from '../core/calibration/homography';
import { PhaseATestRunner, TestResultItem } from '../core/calibration/phaseATests';
import { PhaseBTestRunner } from '../core/kinematics/phaseBTests';
import { PhaseCTestRunner } from '../core/pose/phaseCTests';
import { PhaseDTestRunner } from '../core/risk/phaseDTests';
import { PhaseFTestRunner } from '../core/eval/phaseFTests';
import {
  X,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Target,
  Sliders,
  ShieldCheck,
  Calculator,
  Terminal
} from 'lucide-react';

interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameraModel: CameraModel;
  onUpdateCameraModel: (model: CameraModel) => void;
  currentHomography: HomographyResult | null;
  onApplyHomography: (homography: HomographyResult) => void;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  isOpen,
  onClose,
  cameraModel,
  onUpdateCameraModel,
  currentHomography,
  onApplyHomography
}) => {
  const [activeTab, setActiveTab] = useState<'homography' | 'intrinsics' | 'tests'>('homography');

  // Interactive 4-point floor correspondence state (default to a 4m x 4m floor tile)
  const [correspondences, setCorrespondences] = useState<CalibrationCorrespondence[]>([
    { pixel: { x: 380, y: 640 }, world: { x: -2.0, y: 2.0 } },
    { pixel: { x: 900, y: 640 }, world: { x: 2.0, y: 2.0 } },
    { pixel: { x: 800, y: 440 }, world: { x: 2.0, y: 6.0 } },
    { pixel: { x: 480, y: 440 }, world: { x: -2.0, y: 6.0 } }
  ]);

  const [calibResult, setCalibResult] = useState<HomographyResult | null>(currentHomography);
  const [calibError, setCalibError] = useState<string | null>(null);
  const [debugLogging, setDebugLogging] = useState<boolean>(false);

  // Intrinsics inputs
  const [hfovInput, setHfovInput] = useState<number>(75);
  const [k1Input, setK1Input] = useState<number>(cameraModel.K.k1);
  const [k2Input, setK2Input] = useState<number>(cameraModel.K.k2);
  const [cameraHeightInput, setCameraHeightInput] = useState<number>(2.7);
  const [pitchDegInput, setPitchDegInput] = useState<number>(25);

  // Unit test suite state
  const [testResults, setTestResults] = useState<TestResultItem[]>([]);
  const [testsRan, setTestsRan] = useState<boolean>(false);
  const [testPhaseFilter, setTestPhaseFilter] = useState<'all' | 'phaseA' | 'phaseB' | 'phaseC' | 'phaseD' | 'phaseF'>('all');

  const handleComputeHomography = () => {
    setCalibError(null);
    try {
      const res = GroundPlaneHomography.fitRANSAC(correspondences);
      setCalibResult(res);
      onApplyHomography(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCalibError(msg);
      console.error('Homography calculation failed:', err);
    }
  };

  const handleUpdateIntrinsics = () => {
    const newModel = CameraModel.fromHFOV(
      cameraModel.K.width,
      cameraModel.K.height,
      hfovInput,
      k1Input,
      k2Input
    );
    onUpdateCameraModel(newModel);
  };

  if (!isOpen) return null;

  const handleRunTests = async () => {
    const resultsA = PhaseATestRunner.runAllTests();
    const resultsB = PhaseBTestRunner.runAllTests();
    const resultsC = PhaseCTestRunner.runAllTests();
    const resultsD = PhaseDTestRunner.runAllTests();
    const resultsF = await PhaseFTestRunner.runAllTests();
    setTestResults([...resultsA, ...resultsB, ...resultsC, ...resultsD, ...resultsF]);
    setTestsRan(true);
  };

  const filteredTests = testResults.filter((t) => {
    const isPhaseF = t.id.includes('mape') || t.id.includes('ci95') || t.id.includes('mota') || t.id.includes('pr-auc') || t.id.includes('aes') || t.id.includes('hash') || t.id.includes('hmac');
    const isPhaseD = t.id.includes('feature-vector') || t.id.includes('sigmoid') || t.id.includes('platt') || t.id.includes('isotonic') || t.id.includes('brier') || t.id.includes('ece') || t.id.includes('ema') || t.id.includes('cusum') || t.id.includes('weapon-persistence') || t.id.includes('cost-matrix') || t.id.includes('explainability');
    const isPhaseC = t.id.includes('torso') || t.id.includes('joint') || t.id.includes('wrist') || t.id.includes('arm') || t.id.includes('raised') || t.id.includes('fall') || t.id.includes('weapon-in-hand') || t.id.includes('crowd');
    const isPhaseB = t.id.includes('kalman') || t.id.includes('joseph') || t.id.includes('chisquare') || t.id.includes('closing') || t.id.includes('ttc') || t.id.includes('cpa') || t.id.includes('clamping') || t.id.includes('monte-carlo');
    const isPhaseA = !isPhaseB && !isPhaseC && !isPhaseD && !isPhaseF;

    if (testPhaseFilter === 'phaseA') return isPhaseA;
    if (testPhaseFilter === 'phaseB') return isPhaseB;
    if (testPhaseFilter === 'phaseC') return isPhaseC;
    if (testPhaseFilter === 'phaseD') return isPhaseD;
    if (testPhaseFilter === 'phaseF') return isPhaseF;
    return true;
  });

  const allTestsPassed = testResults.length > 0 && testResults.every((t) => t.passed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[88vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Camera Geometry, Homography & Calibration Engine (Phase A)
              </h2>
              <p className="text-[11px] text-slate-400">
                Ground homography H, radial undistortion, error propagation & unit test proofs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-800 bg-slate-950/40 shrink-0 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('homography')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'homography'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            Ground Homography (DLT + SVD)
          </button>
          <button
            onClick={() => setActiveTab('intrinsics')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'intrinsics'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Intrinsics & Distortion
          </button>
          <button
            onClick={() => {
              setActiveTab('tests');
              if (!testsRan) handleRunTests();
            }}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'tests'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Phase A Unit Tests ({testResults.filter((t) => t.passed).length}/{testResults.length || 10})
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto flex-1 text-xs text-slate-300 space-y-4">
          {/* TAB 1: Ground Homography DLT */}
          {activeTab === 'homography' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-950/30 border border-emerald-800/60 rounded-xl text-emerald-200 text-xs leading-relaxed flex items-start gap-2.5">
                <Target className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Direct Linear Transformation (DLT) with Hartley Normalization:</strong>
                  <br />
                  Map user-selected floor anchor points $(u, v)$ to real-world ground coordinates $(X, Y)$ in metres.
                  The 2N×9 equation system $Ah = 0$ is solved via SVD on normalized coordinates and refined with RANSAC.
                </div>
              </div>

              {/* Correspondences Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Floor Anchor Correspondences (&ge; 4 required):
                  </span>
                  <button
                    onClick={() =>
                      setCorrespondences((prev) => [
                        ...prev,
                        { pixel: { x: 640, y: 540 }, world: { x: 0.0, y: 4.0 } }
                      ])
                    }
                    className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors"
                  >
                    + Add 5th Point (Triggers RANSAC)
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border border-slate-800 text-[11px] font-mono">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                        <th className="p-2">Point</th>
                        <th className="p-2">Pixel (u, v) [px]</th>
                        <th className="p-2">World Floor (X, Y) [m]</th>
                        <th className="p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {correspondences.map((c, idx) => (
                        <tr key={idx} className="hover:bg-slate-950/30">
                          <td className="p-2 font-bold text-emerald-400">P{idx + 1}</td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <span>u:</span>
                              <input
                                type="number"
                                value={c.pixel.x}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setCorrespondences((prev) =>
                                    prev.map((p, i) =>
                                      i === idx ? { ...p, pixel: { ...p.pixel, x: val } } : p
                                    )
                                  );
                                }}
                                className="w-16 bg-slate-800 px-1 py-0.5 rounded text-white text-center"
                              />
                              <span>v:</span>
                              <input
                                type="number"
                                value={c.pixel.y}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setCorrespondences((prev) =>
                                    prev.map((p, i) =>
                                      i === idx ? { ...p, pixel: { ...p.pixel, y: val } } : p
                                    )
                                  );
                                }}
                                className="w-16 bg-slate-800 px-1 py-0.5 rounded text-white text-center"
                              />
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <span>X:</span>
                              <input
                                type="number"
                                step="0.1"
                                value={c.world.x}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setCorrespondences((prev) =>
                                    prev.map((p, i) =>
                                      i === idx ? { ...p, world: { ...p.world, x: val } } : p
                                    )
                                  );
                                }}
                                className="w-14 bg-slate-800 px-1 py-0.5 rounded text-white text-center"
                              />
                              <span>Y:</span>
                              <input
                                type="number"
                                step="0.1"
                                value={c.world.y}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setCorrespondences((prev) =>
                                    prev.map((p, i) =>
                                      i === idx ? { ...p, world: { ...p.world, y: val } } : p
                                    )
                                  );
                                }}
                                className="w-14 bg-slate-800 px-1 py-0.5 rounded text-white text-center"
                              />
                            </div>
                          </td>
                          <td className="p-2">
                            {correspondences.length > 4 && (
                              <button
                                onClick={() =>
                                  setCorrespondences((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="text-red-400 hover:text-red-300 underline"
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Validation / Collinearity Error Banner */}
                {calibError && (
                  <div className="p-3 bg-rose-950/70 border border-rose-500 rounded-xl text-rose-200 text-xs flex items-start gap-2.5 shadow-lg animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="font-bold text-white">Calibration Error:</span>
                      <p className="leading-relaxed">{calibError}</p>
                    </div>
                  </div>
                )}

                {/* Reprojection Warnings */}
                {calibResult?.warnings && calibResult.warnings.length > 0 && (
                  <div className="p-3 bg-amber-950/50 border border-amber-600/80 rounded-xl text-amber-200 text-xs flex items-start gap-2.5 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-white">Accuracy Advisory:</span>
                      <p className="leading-relaxed">{calibResult.warnings.join(' ')}</p>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleComputeHomography}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-md shadow-emerald-950 transition-colors"
                    >
                      <Calculator className="w-4 h-4" />
                      Estimate Homography H & Compute Reprojection RMSE
                    </button>

                    <label className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={debugLogging}
                        onChange={(e) => {
                          setDebugLogging(e.target.checked);
                          GroundPlaneHomography.setDebugLogging(e.target.checked);
                        }}
                        className="accent-emerald-500 rounded"
                      />
                      <span>Debug Logging (Console)</span>
                    </label>
                  </div>

                  {calibResult && (
                    <div className="flex items-center gap-3 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono">
                      <span className="text-slate-400">Reprojection RMSE:</span>
                      <span
                        className={`font-bold ${
                          calibResult.reprojectionRMSE < 0.05
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {(calibResult.reprojectionRMSE * 100).toFixed(2)} cm (
                        {calibResult.reprojectionRMSE.toFixed(4)} m)
                      </span>
                    </div>
                  )}
                </div>

                {calibResult && (
                  <div className="mt-3 p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-[11px]">
                    <div className="text-slate-400 text-xs font-sans font-semibold mb-1">
                      Computed Ground-Plane Homography Matrix H (3x3):
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-cyan-300">
                      {calibResult.H.map((row, r) =>
                        row.map((val, c) => (
                          <div key={`${r}-${c}`} className="p-1 bg-slate-900 rounded text-center">
                            {val.toExponential(4)}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Intrinsics & Fallbacks */}
          {activeTab === 'intrinsics' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* HFOV & Focal Length */}
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    Horizontal FOV & Focal Length (fx, fy)
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Horizontal Field of View (HFOV in degrees):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="40"
                        max="120"
                        value={hfovInput}
                        onChange={(e) => setHfovInput(parseFloat(e.target.value))}
                        className="flex-1 accent-emerald-500"
                      />
                      <span className="font-mono text-xs text-white w-12 text-right">
                        {hfovInput}°
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1">
                    <div>
                      Formula: fx = (W/2) / tan(HFOV/2)
                    </div>
                    <div>
                      fx = ({cameraModel.K.width}/2) / tan({(hfovInput/2).toFixed(1)}°) ={' '}
                      <strong className="text-emerald-400">
                        {CameraModel.fxFromHFOV(
                          cameraModel.K.width,
                          (hfovInput * Math.PI) / 180.0
                        ).toFixed(1)}{' '}
                        px
                      </strong>
                    </div>
                    <div>Principal Point: ({cameraModel.K.cx}, {cameraModel.K.cy}) px</div>
                  </div>
                </div>

                {/* Lens Distortion (k1, k2) */}
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-cyan-400" />
                    Radial Lens Distortion Coefficients (k1, k2)
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      k1 (Barrel / Pincushion primary):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={k1Input}
                      onChange={(e) => setK1Input(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-800 px-2.5 py-1.5 rounded text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      k2 (Higher-order radial term):
                    </label>
                    <input
                      type="number"
                      step="0.005"
                      value={k2Input}
                      onChange={(e) => setK2Input(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-800 px-2.5 py-1.5 rounded text-xs text-white font-mono"
                    />
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Undistorts detection foot-points via Newton-Raphson: x_d = x(1 + k1*r^2 + k2*r^4).
                  </div>
                </div>
              </div>

              {/* Camera Height Fallback */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-white">
                  Camera-Height Ground Range Fallback (h_c, theta)
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Camera Height h_c (metres above floor):
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={cameraHeightInput}
                      onChange={(e) => setCameraHeightInput(parseFloat(e.target.value) || 2.5)}
                      className="w-full bg-slate-800 px-2.5 py-1.5 rounded text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">
                      Camera Pitch theta (degrees downwards):
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={pitchDegInput}
                      onChange={(e) => setPitchDegInput(parseFloat(e.target.value) || 20)}
                      className="w-full bg-slate-800 px-2.5 py-1.5 rounded text-xs text-white font-mono"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-slate-500">
                  Formula: alpha = theta + atan((v - cy)/fy), D = h_c / tan(alpha).
                </div>
              </div>

              <button
                onClick={handleUpdateIntrinsics}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors"
              >
                Apply Updated Intrinsics
              </button>
            </div>
          )}

          {/* TAB 3: Phase A Automated Unit Test Suite */}
          {activeTab === 'tests' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      allTestsPassed ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold text-white">
                      Mathematical & Kinematic Verification Harness
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Evaluates 18 exact formulas with deterministic synthetic ground-truth and known numeric values.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-wrap items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px] gap-0.5">
                    <button
                      onClick={() => setTestPhaseFilter('all')}
                      className={`px-2 py-1 rounded ${testPhaseFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                    >
                      All ({testResults.length})
                    </button>
                    <button
                      onClick={() => setTestPhaseFilter('phaseA')}
                      className={`px-2 py-1 rounded ${testPhaseFilter === 'phaseA' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                    >
                      Phase A: Geometry (10)
                    </button>
                    <button
                      onClick={() => setTestPhaseFilter('phaseB')}
                      className={`px-2 py-1 rounded ${testPhaseFilter === 'phaseB' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                    >
                      Phase B: Kinematics (8)
                    </button>
                    <button
                      onClick={() => setTestPhaseFilter('phaseC')}
                      className={`px-2 py-1 rounded ${testPhaseFilter === 'phaseC' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                    >
                      Phase C: Pose (8)
                    </button>
                    <button
                      onClick={() => setTestPhaseFilter('phaseD')}
                      className={`px-2 py-1 rounded ${testPhaseFilter === 'phaseD' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                    >
                      Phase D: Risk (11)
                    </button>
                    <button
                      onClick={() => setTestPhaseFilter('phaseF')}
                      className={`px-2 py-1 rounded ${testPhaseFilter === 'phaseF' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                    >
                      Phase F: Security (7)
                    </button>
                  </div>
                  <button
                    onClick={handleRunTests}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Re-Run Tests
                  </button>
                </div>
              </div>

              {/* Test Results List */}
              <div className="space-y-2">
                {filteredTests.map((t) => (
                  <div
                    key={t.id}
                    className={`p-3 rounded-xl border text-xs font-sans transition-all ${
                      t.passed
                        ? 'bg-slate-950/70 border-emerald-900/60 text-slate-200'
                        : 'bg-red-950/40 border-red-800 text-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold">
                        {t.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                        )}
                        <span className="text-white">{t.name}</span>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          t.passed
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                            : 'bg-red-900 text-red-100'
                        }`}
                      >
                        {t.passed ? 'PASSED' : 'FAILED'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2 font-mono text-[10px] bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                      <div>
                        <span className="text-slate-500">Expected: </span>
                        <span className="text-slate-300">{t.expected}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Actual: </span>
                        <span className={t.passed ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                          {t.actual}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed font-sans">
                      {t.details}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span>SpatialMapper 3D Architect • Geometry, Kinematics & Escalation Engine</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
