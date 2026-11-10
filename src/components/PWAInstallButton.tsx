/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - PWA Install Button Component
 */

import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { DownloadCloud, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
        title="Install SpatialMapper 3D as desktop/mobile PWA"
      >
        <DownloadCloud className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
        >
          <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">Install iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-indigo-400" />
                  Install on iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> button in your Safari toolbar.<br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.<br />
                3. Enjoy native full-screen CCTV vision offline.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
