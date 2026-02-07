import React, { useEffect, useState } from 'react';
import { fetchBuildStatus, abortIdeaGeneration, type BuildStatus } from '../../lib/api';
import { Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { clsx } from 'clsx';

export function BuildProgress() {
  const [status, setStatus] = useState<BuildStatus | null>(null);
  const [isAborting, setIsAborting] = useState(false);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const s = await fetchBuildStatus();
        setStatus(s);
      } catch (_e) {
        // ignore
      }
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const handleAbort = async () => {
    if (status?.status === 'error') {
      // If it's an error, just send abort to reset the status to idle
      try {
        await abortIdeaGeneration();
      } catch (_e) {
        // ignore
      }
      return;
    }

    if (!confirm('Are you sure you want to abort the current generation?')) return;
    setIsAborting(true);
    try {
      await abortIdeaGeneration();
    } catch (e) {
      alert('Abort failed: ' + String(e));
    } finally {
      setIsAborting(false);
    }
  };

  if (!status || status.status === 'idle') return null;

  return (
    <div className="fixed bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 z-[3000] animate-in fade-in slide-in-from-bottom-4 duration-300 w-[92%] sm:w-[400px]">
      <div className={clsx(
        "bg-white dark:bg-[#1c1c1e] border shadow-2xl rounded-2xl p-3 sm:p-4 flex gap-3 sm:gap-4 items-center",
        status.status === 'error' ? "border-red-500/50 dark:border-red-900/50 bg-red-50/10" : "border-gray-200 dark:border-[#2c2c2e]"
      )}>
        <div className="relative flex-shrink-0">
           {status.status === 'running' ? (
             <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-[var(--primary)] animate-spin" />
           ) : (
             <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-red-500" />
           )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-0.5 sm:mb-1">
            <span className={clsx(
              "text-[9px] sm:text-xs font-bold uppercase tracking-wider truncate",
              status.status === 'error' ? "text-red-500" : "text-gray-400"
            )}>
              {status.status === 'error' ? 'Build Error' : (status.stage || 'Generator Active')}
            </span>
            {status.status === 'running' && status.progress !== undefined && (
              <span className="text-[9px] sm:text-[10px] font-mono text-gray-500">{status.progress}%</span>
            )}
          </div>
          <div className="text-xs sm:text-sm font-semibold truncate mb-1.5 sm:mb-2">
            {status.status === 'error' ? (status.error || 'Check server logs') : (status.title || 'Building creative project...')}
          </div>
          {status.status === 'running' && (
            <progress
              className="oc-progress w-full"
              value={status.progress || 0}
              max={100}
              aria-label="Build progress"
            />
          )}
        </div>

        <button 
          onClick={handleAbort}
          disabled={isAborting}
          className={clsx(
            "p-1.5 sm:p-2 rounded-xl transition-colors disabled:opacity-50",
            status.status === 'error' ? "hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600" : "hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
          )}
          title={status.status === 'error' ? "Dismiss error" : "Abort generation"}
        >
          {isAborting ? <Loader2 size={16} className="animate-spin" /> : 
            status.status === 'error' ? <CheckCircle2 size={16} className="sm:size-[18px]" /> : <XCircle size={16} className="sm:size-[18px]" />}
        </button>
      </div>
    </div>
  );
}
