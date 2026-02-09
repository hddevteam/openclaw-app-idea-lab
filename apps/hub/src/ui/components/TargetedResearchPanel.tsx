import React, { useState, useRef } from 'react';
import { Crosshair, Loader2, X, ChevronDown, ChevronUp, Zap, Search as SearchIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { runTargetedResearchSSE, type TargetedResearchSSEEvent } from '../../lib/api';
import type { Idea, Campaign } from '../../types/idea';

interface TargetedResearchPanelProps {
  onComplete: (campaign: Campaign | null, ideas: Idea[]) => void;
  onClose: () => void;
}

interface ProgressStep {
  key: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
  message?: string;
}

const STEPS: { key: string; label: string; events: string[] }[] = [
  { key: 'plan', label: '规划查询', events: ['plan', 'config'] },
  { key: 'search', label: '搜索证据', events: ['search', 'fetch', 'research'] },
  { key: 'ideate', label: '生成创意', events: ['ideate'] },
  { key: 'critique', label: '评估打分', events: ['critique'] },
  { key: 'select', label: '筛选优化', events: ['select'] },
  { key: 'persist', label: '保存结果', events: ['persist'] },
];

export const TargetedResearchPanel: React.FC<TargetedResearchPanelProps> = ({ onComplete, onClose }) => {
  const [topic, setTopic] = useState('');
  const [creative, setCreative] = useState(0.6);
  const [count, setCount] = useState(6);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const handleStart = () => {
    if (!topic.trim() || isRunning) return;
    setIsRunning(true);
    setError(null);
    setLogs([]);
    setSteps(STEPS.map(s => ({ key: s.key, label: s.label, status: 'pending' })));

    let currentStepIdx = -1;

    const ctrl = runTargetedResearchSSE(
      { topic: topic.trim(), creative, count },
      {
        onEvent: (evt: TargetedResearchSSEEvent) => {
          // Update logs
          const msg = (evt.data as { message?: string }).message;
          if (msg) {
            setLogs(prev => [...prev, msg]);
          }

          // Update progress steps
          const stepIdx = STEPS.findIndex(s => s.events.includes(evt.event));
          if (stepIdx >= 0 && stepIdx >= currentStepIdx) {
            if (stepIdx > currentStepIdx) {
              currentStepIdx = stepIdx;
              setSteps(prev => prev.map((s, i) => ({
                ...s,
                status: i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'pending',
                message: i === stepIdx ? msg : s.message,
              })));
            } else {
              // Same step, update message
              setSteps(prev => prev.map((s, i) => 
                i === stepIdx ? { ...s, message: msg } : s
              ));
            }
          }
        },
        onComplete: (data) => {
          setIsRunning(false);
          setSteps(prev => prev.map(s => ({ ...s, status: 'done' })));
          abortRef.current = null;
          onComplete(data.campaign, data.ideas);
        },
        onError: (errMsg) => {
          setIsRunning(false);
          setError(errMsg);
          setSteps(prev => prev.map(s => 
            s.status === 'active' ? { ...s, status: 'error' } : s
          ));
          abortRef.current = null;
        },
      }
    );
    abortRef.current = ctrl;
  };

  const handleAbort = () => {
    abortRef.current?.abort();
    setIsRunning(false);
    setError('已取消');
    abortRef.current = null;
  };

  return (
    <div className="rounded-[24px] sm:rounded-[32px] bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/10 dark:to-blue-900/10 border border-indigo-100 dark:border-indigo-800/30 overflow-hidden animate-in slide-in-from-top duration-500">
      {/* Header */}
      <div className="px-4 sm:px-8 pt-4 sm:pt-6 pb-3 sm:pb-4 flex items-center gap-3">
        <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-indigo-600 text-white shrink-0">
          <Crosshair size={18} className="sm:size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm sm:text-lg font-bold truncate">深度调研 (Targeted Research)</h2>
          <p className="text-[9px] sm:text-xs text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-widest">
            围绕锚点主题多维度调研
          </p>
        </div>
        <button
          onClick={isRunning ? handleAbort : onClose}
          className="p-1.5 sm:p-2 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 rounded-full transition-colors shrink-0"
          title={isRunning ? 'Cancel' : 'Close'}
          aria-label={isRunning ? 'Cancel' : 'Close'}
        >
          <X size={18} className="sm:size-5 text-indigo-600" />
        </button>
      </div>

      {/* Input Area */}
      <div className="px-4 sm:px-8 pb-4 space-y-3">
        <div className="relative">
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="输入你的需求锚点... 例如：针对独立摄影师的后期资产维护工具"
            disabled={isRunning}
            rows={2}
            className="w-full px-4 py-3 rounded-2xl border border-indigo-200 dark:border-indigo-800/40 bg-white dark:bg-[#1c1c1e] text-sm font-medium focus:ring-2 focus:ring-indigo-500 transition-all outline-none resize-none disabled:opacity-50 placeholder:text-gray-400"
          />
        </div>

        {/* Advanced Options */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors uppercase tracking-widest"
        >
          {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          高级选项
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-white/50 dark:bg-[#1c1c1e]/50 border border-indigo-100 dark:border-indigo-900/20 animate-in fade-in duration-200">
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                创新程度 (Creative Level)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min="0" max="1" step="0.1"
                  value={creative}
                  onChange={e => setCreative(parseFloat(e.target.value))}
                  disabled={isRunning}
                  className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  title="Creative level"
                  aria-label="Creative level"
                />
                <span className="text-xs font-mono font-bold text-indigo-600 w-8">{creative.toFixed(1)}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                生成数量 (Count)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min="3" max="12" step="1"
                  value={count}
                  onChange={e => setCount(parseInt(e.target.value))}
                  disabled={isRunning}
                  className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  title="Idea count"
                  aria-label="Idea count"
                />
                <span className="text-xs font-mono font-bold text-indigo-600 w-6">{count}</span>
              </div>
            </div>
          </div>
        )}

        {/* Action */}
        <div className="flex gap-3">
          <button
            onClick={handleStart}
            disabled={isRunning || !topic.trim()}
            className={clsx(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]",
              isRunning
                ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isRunning ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Zap size={16} />
            )}
            {isRunning ? '调研中...' : '开始深度调研'}
          </button>
        </div>
      </div>

      {/* Progress */}
      {steps.length > 0 && (
        <div className="px-4 sm:px-8 pb-4 sm:pb-6 space-y-3">
          {/* Step indicators */}
          <div className="flex gap-1">
            {steps.map((s) => (
              <div
                key={s.key}
                className={clsx(
                  "flex-1 h-1.5 rounded-full transition-all duration-500",
                  s.status === 'done' && "bg-green-500",
                  s.status === 'active' && "bg-indigo-500 animate-pulse",
                  s.status === 'pending' && "bg-gray-200 dark:bg-gray-700",
                  s.status === 'error' && "bg-red-500",
                )}
              />
            ))}
          </div>

          {/* Current step label */}
          <div className="flex items-center gap-2">
            {steps.map((s) => (
              <div
                key={s.key}
                className={clsx(
                  "text-[8px] font-bold uppercase tracking-widest transition-colors",
                  s.status === 'done' && "text-green-600 dark:text-green-400",
                  s.status === 'active' && "text-indigo-600 dark:text-indigo-400",
                  s.status === 'pending' && "text-gray-300 dark:text-gray-600",
                  s.status === 'error' && "text-red-500",
                )}
              >
                {s.label}
              </div>
            ))}
          </div>

          {/* Log lines */}
          {logs.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-xl bg-[#1c1c1e] p-3 font-mono text-[10px] text-green-400 space-y-0.5 scrollbar-thin">
              {logs.map((log, i) => (
                <div key={i} className="opacity-80 leading-relaxed">{log}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 text-red-600 text-xs font-bold">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
