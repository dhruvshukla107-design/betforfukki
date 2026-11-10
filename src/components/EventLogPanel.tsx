/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Event Log Panel
 * Live event timeline, thumbnails, verify/dismiss buttons, category counters,
 * and CSV / JSON export.
 */

import React from 'react';
import { SecurityEvent } from '../types/spatial';
import {
  Bell,
  CheckCircle2,
  XCircle,
  Download,
  Trash2,
  Users,
  Dog,
  Package,
  ShieldAlert,
  Clock,
  Sparkles
} from 'lucide-react';

interface EventLogPanelProps {
  events: SecurityEvent[];
  onVerifyEvent: (id: string) => void;
  onDismissEvent: (id: string) => void;
  onClearAllEvents: () => void;
  onTriggerVLMVerify: (event: SecurityEvent) => void;
  peopleCount: number;
  animalCount: number;
  objectCount: number;
  threatCount: number;
}

export const EventLogPanel: React.FC<EventLogPanelProps> = ({
  events,
  onVerifyEvent,
  onDismissEvent,
  onClearAllEvents,
  onTriggerVLMVerify,
  peopleCount,
  animalCount,
  objectCount,
  threatCount
}) => {
  const handleExportCSV = () => {
    if (events.length === 0) return;
    const headers = ['ID', 'Timestamp', 'Class', 'Category', 'Confidence', 'AgeBand', 'DistanceM', 'Status', 'Zone'];
    const rows = events.map(e => [
      e.id,
      new Date(e.timestamp).toISOString(),
      e.cls,
      e.category,
      (e.confidence * 100).toFixed(0) + '%',
      e.ageBand || 'N/A',
      e.distanceM !== undefined ? e.distanceM.toFixed(1) : 'N/A',
      e.status,
      e.zoneName || 'Global'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spatialmapper_events_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    if (events.length === 0) return;
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spatialmapper_events_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl text-slate-200 overflow-hidden">
      {/* Top Header with Counters */}
      <div className="p-3.5 border-b border-slate-800 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-100">
              Live Event Log
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportCSV}
              disabled={events.length === 0}
              className="px-2 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-slate-300 flex items-center gap-1 transition-colors"
              title="Export CSV"
            >
              <Download className="w-3 h-3" /> CSV
            </button>
            <button
              onClick={handleExportJSON}
              disabled={events.length === 0}
              className="px-2 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded text-slate-300 flex items-center gap-1 transition-colors"
              title="Export JSON"
            >
              <Download className="w-3 h-3" /> JSON
            </button>
            <button
              onClick={onClearAllEvents}
              disabled={events.length === 0}
              className="p-1 text-slate-400 hover:text-red-400 disabled:opacity-30 transition-colors"
              title="Clear all events"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Real-time Category Counters Grid */}
        <div className="grid grid-cols-4 gap-1.5 text-center">
          <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-900/50">
            <div className="text-[10px] text-emerald-400 flex items-center justify-center gap-1">
              <Users className="w-3 h-3" /> People
            </div>
            <div className="text-base font-bold text-emerald-300 font-mono mt-0.5">
              {peopleCount}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-blue-950/40 border border-blue-900/50">
            <div className="text-[10px] text-blue-400 flex items-center justify-center gap-1">
              <Dog className="w-3 h-3" /> Animals
            </div>
            <div className="text-base font-bold text-blue-300 font-mono mt-0.5">
              {animalCount}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-yellow-950/40 border border-yellow-900/50">
            <div className="text-[10px] text-yellow-400 flex items-center justify-center gap-1">
              <Package className="w-3 h-3" /> Objects
            </div>
            <div className="text-base font-bold text-yellow-300 font-mono mt-0.5">
              {objectCount}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-red-950/40 border border-red-900/50">
            <div className="text-[10px] text-red-400 flex items-center justify-center gap-1">
              <ShieldAlert className="w-3 h-3" /> Alerts
            </div>
            <div className="text-base font-bold text-red-300 font-mono mt-0.5">
              {threatCount}
            </div>
          </div>
        </div>
      </div>

      {/* Events Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 divide-y divide-slate-800/40">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500">
            <Clock className="w-8 h-8 mb-2 stroke-1 opacity-60" />
            <p className="text-xs">No events logged yet.</p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              Detections matching alert criteria or zones will appear here.
            </p>
          </div>
        ) : (
          events.map((evt) => {
            const isWeapon = evt.isPossibleWeapon || evt.category === 'weapon';
            return (
              <div
                key={evt.id}
                className={`pt-2.5 pb-2 px-2.5 rounded-lg transition-all ${
                  isWeapon
                    ? 'bg-red-950/30 border border-red-900/60'
                    : evt.status === 'verified'
                    ? 'bg-slate-950/40 border border-slate-800'
                    : 'bg-slate-950/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isWeapon
                          ? 'bg-red-500 animate-ping'
                          : evt.category === 'person'
                          ? 'bg-emerald-500'
                          : evt.category === 'animal'
                          ? 'bg-blue-500'
                          : 'bg-yellow-500'
                      }`}
                    />
                    <span className="text-xs font-semibold text-slate-200 capitalize">
                      {evt.cls}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      #{evt.trackId}
                    </span>
                    {evt.zoneName && (
                      <span className="text-[9px] bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800/60 font-mono">
                        {evt.zoneName}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                {/* Sub details: Age group & Distance */}
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 mt-1">
                  <span>Confidence: {Math.round(evt.confidence * 100)}%</span>
                  {evt.ageBand && evt.ageBand !== 'Unknown' && (
                    <span>• Age: {evt.ageBand} approx.</span>
                  )}
                  {evt.distanceM !== undefined && (
                    <span>• Dist: {evt.distanceM.toFixed(1)}m</span>
                  )}
                </div>

                {/* Warning note if possible weapon */}
                {isWeapon && (
                  <div className="mt-1.5 p-1.5 bg-red-900/30 border border-red-800/50 rounded text-[10px] text-red-300 font-medium flex items-center justify-between">
                    <span>⚠️ Possible weapon: requires human visual confirmation</span>
                    <button
                      onClick={() => onTriggerVLMVerify(evt)}
                      className="px-1.5 py-0.5 bg-red-800 hover:bg-red-700 text-white rounded text-[9px] flex items-center gap-1 transition-colors"
                      title="Run Multimodal AI Crop Double-check"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      VLM Check
                    </button>
                  </div>
                )}

                {/* Action buttons: Verify / Dismiss */}
                <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/60">
                  <div className="text-[10px] font-mono text-slate-500">
                    Status: <span className={evt.status === 'verified' ? 'text-emerald-400' : 'text-slate-400'}>{evt.status}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onVerifyEvent(evt.id)}
                      className="px-2 py-0.5 text-[10px] rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 flex items-center gap-1 transition-colors"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Verify
                    </button>
                    <button
                      onClick={() => onDismissEvent(evt.id)}
                      className="px-2 py-0.5 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition-colors"
                    >
                      <XCircle className="w-3 h-3" /> Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Retention Note */}
      <div className="p-2.5 bg-slate-950/80 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
        <span>Storage: Local IndexedDB (7-day retention)</span>
        <button
          onClick={onClearAllEvents}
          className="text-slate-400 hover:text-red-400 underline"
        >
          Purge storage
        </button>
      </div>
    </div>
  );
};
