/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Phase E: Escalation-Risk HUD & Human-in-the-Loop Panel
 * 
 * Complies with:
 *   - WCAG AA contrast standards
 *   - Plain-language assistive labeling
 *   - Touch targets >= 44px
 *   - Strict demographic exclusion notice
 *   - Operator action buttons: Confirm, Dismiss (False Positive log), Snooze (60s)
 */

import React, { useState } from 'react';
import { RiskAssessmentResult, RiskLevel } from '../core/risk/riskModel';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Lock,
  FileText,
  VolumeX,
  Volume2,
  Flame,
  Activity,
  Info
} from 'lucide-react';

interface RiskEscalationPanelProps {
  assessment: RiskAssessmentResult | null;
  onConfirmAlert: () => void;
  onDismissAlert: () => void;
  onSnoozeAlert: (durationSeconds: number) => void;
  onExportReport: () => void;
  isSnoozed: boolean;
  snoozeSecondsRemaining: number;
  latestLedgerHash?: string;
  ledgerBlockCount?: number;
}

export const RiskEscalationPanel: React.FC<RiskEscalationPanelProps> = ({
  assessment,
  onConfirmAlert,
  onDismissAlert,
  onSnoozeAlert,
  onExportReport,
  isSnoozed,
  snoozeSecondsRemaining,
  latestLedgerHash,
  ledgerBlockCount = 1
}) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Default fallback if assessment is null
  const level: RiskLevel = assessment?.alertLevel || 'Low';
  const score = assessment ? Math.round(assessment.emaScore * 100) : 12;
  const calP = assessment ? Math.round(assessment.calibratedProbability * 100) : 10;
  const cusum = assessment ? assessment.cusumStatistic.toFixed(2) : '0.00';

  // Level visual styles
  const getLevelBadge = (lvl: RiskLevel) => {
    switch (lvl) {
      case 'Urgent':
        return {
          bg: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
          indicator: 'bg-rose-500 animate-pulse',
          headerBg: 'from-rose-950/40 to-slate-900',
          title: 'URGENT ESCALATION',
          subtext: 'High-probability physical conflict or persistent weapon detected'
        };
      case 'Alert':
        return {
          bg: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
          indicator: 'bg-amber-500',
          headerBg: 'from-amber-950/40 to-slate-900',
          title: 'ELEVATED ALERT',
          subtext: 'Rapid approach trajectory or restricted zone breach'
        };
      case 'Watch':
        return {
          bg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
          indicator: 'bg-yellow-400',
          headerBg: 'from-yellow-950/30 to-slate-900',
          title: 'WATCH LEVEL',
          subtext: 'Approaching interaction threshold or motion energy rise'
        };
      case 'Low':
      default:
        return {
          bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
          indicator: 'bg-emerald-400',
          headerBg: 'from-emerald-950/30 to-slate-900',
          title: 'NORMAL ACTIVITY',
          subtext: 'Baseline scene kinetics within expected non-threatening limits'
        };
    }
  };

  const badge = getLevelBadge(level);

  return (
    <div className="bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-800 shadow-xl overflow-hidden flex flex-col text-slate-200">
      {/* Top Banner / Risk Meter Header */}
      <div className={`p-4 bg-gradient-to-r ${badge.headerBg} border-b border-slate-800/80`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={`w-3.5 h-3.5 rounded-full ${badge.indicator}`} />
            <div>
              <span className="text-[10px] uppercase tracking-wider font-mono text-slate-400 font-bold block">
                Escalation-Risk Engine
              </span>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                {badge.title}
                <span className={`text-xs px-2 py-0.5 rounded-full border font-mono font-bold ${badge.bg}`}>
                  {level} ({score}%)
                </span>
              </h3>
            </div>
          </div>

          {/* Quick Snooze Status Indicator */}
          {isSnoozed && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-950/70 border border-yellow-700/60 text-yellow-300 text-xs font-mono">
              <VolumeX className="w-3.5 h-3.5 text-yellow-400 animate-pulse" />
              <span>Snoozed ({snoozeSecondsRemaining}s)</span>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 mt-1">{badge.subtext}</p>

        {/* Segmented Risk Gauge Meter */}
        <div className="mt-3">
          <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
            <span>Low (0-29%)</span>
            <span>Watch (30-59%)</span>
            <span>Alert (60-84%)</span>
            <span>Urgent (&ge;85%)</span>
          </div>
          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden flex p-0.5 border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                level === 'Urgent'
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-sm shadow-rose-500/50'
                  : level === 'Alert'
                  ? 'bg-gradient-to-r from-yellow-400 to-amber-500'
                  : level === 'Watch'
                  ? 'bg-gradient-to-r from-emerald-400 to-yellow-400'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.max(8, Math.min(100, score))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Human Verification Notice Bar (Anti-Biometrics & Strict Advisory Notice) */}
      <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-2 text-xs text-slate-400">
        <Info className="w-4 h-4 text-sky-400 shrink-0" />
        <span className="text-[11px] leading-tight">
          <strong className="text-slate-300">Human-in-the-Loop Protocol:</strong> System outputs are probabilistic advisories. All weapons are flagged as "possible weapon: needs human verification". Demographics strictly excluded.
        </span>
      </div>

      {/* Body Content */}
      <div className="p-4 space-y-3.5">
        {/* Top 3 "Why" Plain-Language Explanations */}
        <div>
          <span className="text-[11px] uppercase tracking-wider font-mono text-slate-400 font-bold block mb-1.5 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-indigo-400" />
            Top Contributing Factors (Explainability)
          </span>

          {assessment?.topExplanations && assessment.topExplanations.length > 0 ? (
            <div className="space-y-1.5">
              {assessment.topExplanations.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px] flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <span className="text-slate-200 font-medium">{item.humanDescription}</span>
                  </div>
                  <span className="font-mono text-[10px] text-indigo-300 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/50">
                    +{item.contribution.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60 text-xs text-slate-500 italic text-center">
              No significant escalation features detected in current scene.
            </div>
          )}
        </div>

        {/* Collapsible Mathematical & Calibration Telemetry */}
        <div className="border-t border-slate-800/80 pt-2.5">
          <button
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="w-full flex items-center justify-between text-[11px] font-mono text-slate-400 hover:text-slate-200 py-1 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-cyan-400" />
              {showTechnicalDetails ? 'Hide Filter & Calibration Math' : 'Show Filter & Calibration Math'}
            </span>
            <span>{showTechnicalDetails ? '▲' : '▼'}</span>
          </button>

          {showTechnicalDetails && (
            <div className="grid grid-cols-2 gap-2 mt-2 p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 font-mono text-[11px]">
              <div>
                <span className="text-slate-500 block">Platt Calibrated p:</span>
                <span className="text-cyan-300 font-bold">{calP}%</span>
              </div>
              <div>
                <span className="text-slate-500 block">EMA Filter (s_t):</span>
                <span className="text-emerald-300 font-bold">{score}%</span>
              </div>
              <div>
                <span className="text-slate-500 block">CUSUM Score (S_t):</span>
                <span className="text-amber-300 font-bold">{cusum} (h=2.0)</span>
              </div>
              <div>
                <span className="text-slate-500 block">Hysteresis (0.65/0.45):</span>
                <span className={assessment?.isHysteresisActive ? 'text-rose-300 font-bold' : 'text-slate-400'}>
                  {assessment?.isHysteresisActive ? 'ENGAGED' : 'IDLE'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Tamper-Evident SHA-256 Ledger Tip Status */}
        <div className="p-2 rounded-lg bg-slate-950/90 border border-slate-800 flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-slate-400 truncate">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">
              Ledger Block #{ledgerBlockCount}: {latestLedgerHash ? `${latestLedgerHash.substring(0, 14)}...` : 'genesis-block'}
            </span>
          </div>
          <button
            onClick={onExportReport}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center gap-1 text-[10px] shrink-0 transition-colors"
            title="Download Formal Evaluation Benchmark Audit Report"
          >
            <FileText className="w-3 h-3 text-cyan-400" />
            <span>Audit</span>
          </button>
        </div>

        {/* Action Controls for Security Officer / Operator (>= 44px min touch target) */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {/* Confirm Button */}
          <button
            onClick={onConfirmAlert}
            className="min-h-[44px] px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-rose-950/40 transition-colors active:scale-95"
            title="Confirm escalation and log verified incident with snapshot"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Confirm</span>
          </button>

          {/* Dismiss / False-Positive Button */}
          <button
            onClick={onDismissAlert}
            className="min-h-[44px] px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 border border-slate-700 transition-colors active:scale-95"
            title="Dismiss event and record in false-alarm calibration dataset"
          >
            <span>Dismiss</span>
          </button>

          {/* Snooze (60s) Button */}
          <button
            onClick={() => onSnoozeAlert(60)}
            className="min-h-[44px] px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs flex items-center justify-center gap-1.5 border border-slate-700 transition-colors active:scale-95"
            title="Snooze audio/visual urgent warnings for 60 seconds"
          >
            <Clock className="w-3.5 h-3.5 text-yellow-400" />
            <span>Snooze</span>
          </button>
        </div>
      </div>
    </div>
  );
};
