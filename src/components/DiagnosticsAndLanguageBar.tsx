/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Diagnostics Toast & Language Switcher Component
 */

import React from 'react';
import { useI18n } from '../core/i18n/i18nEngine';
import { DiagnosticError } from '../core/errors/errorTaxonomy';
import { Languages, AlertCircle, AlertTriangle, Info, CheckCircle2, X, RefreshCw } from 'lucide-react';

interface DiagnosticsAndLanguageBarProps {
  errors: DiagnosticError[];
  onDismissError: (code: string) => void;
  onExecuteRemedy?: (action: string) => void;
}

export function LanguageToggle() {
  const { language, setLanguage } = useI18n();

  return (
    <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-medium">
      <button
        onClick={() => setLanguage('en')}
        className={`px-2 py-1 rounded transition-colors ${
          language === 'en'
            ? 'bg-indigo-600 text-white font-bold shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="Switch to English"
      >
        EN
      </button>
      <button
        onClick={() => setLanguage('hi')}
        className={`px-2 py-1 rounded transition-colors ${
          language === 'hi'
            ? 'bg-indigo-600 text-white font-bold shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="हिन्दी (Hindi) में बदलें"
      >
        हिन्दी
      </button>
    </div>
  );
}

export function ErrorDiagnosticToast({
  errors,
  onDismissError,
  onExecuteRemedy
}: DiagnosticsAndLanguageBarProps) {
  const { language } = useI18n();

  if (errors.length === 0) return null;

  const current = errors[0];
  const title = language === 'hi' ? current.titleHi : current.title;
  const message = language === 'hi' ? current.messageHi : current.message;
  const remediation = language === 'hi' ? current.remediationHi : current.remediation;

  const isCritical = current.severity === 'critical';
  const isError = current.severity === 'error';
  const isWarning = current.severity === 'warning';

  const borderColor = isCritical
    ? 'border-rose-600 bg-rose-950/90 text-rose-100'
    : isError
    ? 'border-red-500 bg-red-950/90 text-red-100'
    : isWarning
    ? 'border-amber-500 bg-amber-950/90 text-amber-100'
    : 'border-cyan-500 bg-slate-950/90 text-cyan-100';

  return (
    <div className="fixed top-16 right-4 z-50 max-w-md w-full animate-in slide-in-from-top-4 fade-in">
      <div className={`p-4 rounded-xl border shadow-2xl backdrop-blur-md space-y-2.5 ${borderColor}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {isCritical || isError ? (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            ) : isWarning ? (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-cyan-400 shrink-0" />
            )}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider">{title}</h4>
              <span className="text-[10px] opacity-75 font-mono">[{current.code}]</span>
            </div>
          </div>

          <button
            onClick={() => onDismissError(current.code)}
            className="p-1 rounded-lg hover:bg-black/30 opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs leading-relaxed opacity-90">{message}</p>

        <div className="text-[11px] bg-black/40 p-2.5 rounded-lg border border-white/10 space-y-1">
          <div className="font-semibold text-white/90">
            {language === 'hi' ? 'सुझाव:' : 'Recommended Action:'}
          </div>
          <div className="opacity-80">{remediation}</div>
        </div>

        {current.autoRemedyAction && onExecuteRemedy && (
          <div className="flex justify-end pt-1">
            <button
              onClick={() => {
                onExecuteRemedy(current.autoRemedyAction!);
                onDismissError(current.code);
              }}
              className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {language === 'hi' ? 'स्वतः समाधान लागू करें' : 'Apply Auto-Fix'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
