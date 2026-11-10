/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Offline Connectivity Indicator
 */

import React, { useEffect, useState } from 'react';
import { WifiOff, Cpu } from 'lucide-react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl bg-amber-950/90 border border-amber-800/80 px-3.5 py-2 text-xs font-medium text-amber-200 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom">
      <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
      <div>
        <div className="font-bold flex items-center gap-1.5">
          <span>Offline Operation Active</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <div className="text-[10px] text-amber-300/80 flex items-center gap-1">
          <Cpu className="w-3 h-3 text-emerald-400" />
          Local edge inference (WebGL/WASM) continues at full speed.
        </div>
      </div>
    </div>
  );
};
