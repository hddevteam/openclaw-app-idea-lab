import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play, Pause, XCircle, RotateCcw, SkipForward,
  CheckCircle2, Loader2, AlertCircle, Clock, Package,
} from 'lucide-react';
import type { Idea, BatchJob, BatchItem } from '../../types/idea';
import {
  createBatchJob, startBatchJob, fetchBatchStatus,
  pauseBatchJob, resumeBatchJob, cancelBatchJob,
  retryBatchItem, skipBatchItem, subscribeBatchEvents,
} from '../../lib/api';

interface BatchBuildPanelProps {
  campaignId: string;
  ideas: Idea[];
  onClose: () => void;
  onRefresh: () => void;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  queued:  <Clock className="w-4 h-4 text-slate-400" />,
  running: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
  built:   <CheckCircle2 className="w-4 h-4 text-green-500" />,
  failed:  <AlertCircle className="w-4 h-4 text-red-500" />,
  skipped: <SkipForward className="w-4 h-4 text-slate-400" />,
};

const STATUS_LABEL: Record<string, string> = {
  queued: '队列中', running: '生成中', built: '已完成', failed: '失败', skipped: '已跳过',
};

export default function BatchBuildPanel({ campaignId, ideas, onClose, onRefresh }: BatchBuildPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(ideas.map(i => i.id)));
  const [job, setJob] = useState<BatchJob | null>(null);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const sseRef = useRef<{ close: () => void } | null>(null);

  // Cleanup SSE on unmount
  useEffect(() => () => { sseRef.current?.close(); }, []);

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === ideas.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(ideas.map(i => i.id)));
  };

  // Subscribe to SSE for live updates
  const subscribeTo = useCallback((jobId: string) => {
    sseRef.current?.close();
    sseRef.current = subscribeBatchEvents(jobId, {
      onEvent: (evt) => {
        const d = evt.data as Record<string, unknown>;
        if (d.stats) {
          setJob(prev => prev ? { ...prev, stats: d.stats as BatchJob['stats'] } : prev);
        }
        // Refresh full job status on key events
        if (['item:built', 'item:failed', 'job:done', 'job:paused', 'job:cancelled'].includes(evt.event)) {
          fetchBatchStatus(jobId).then(setJob).catch(() => {});
        }
      },
      onDone: () => {
        fetchBatchStatus(jobId).then(setJob).catch(() => {});
        onRefresh();
      },
      onError: () => setError('SSE 连接断开，请刷新'),
    });
  }, [onRefresh]);

  // Create + start
  const handleStart = async () => {
    if (selectedIds.size === 0) return;
    setIsCreating(true);
    setError('');
    try {
      const result = await createBatchJob(campaignId, [...selectedIds]);
      const jobId = result.jobId;
      await startBatchJob(jobId);
      const fresh = await fetchBatchStatus(jobId);
      setJob(fresh);
      subscribeTo(jobId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  const handlePause = async () => {
    if (!job) return;
    try { await pauseBatchJob(job.jobId); setJob({ ...job, status: 'paused' }); } catch (e) { setError((e as Error).message); }
  };

  const handleResume = async () => {
    if (!job) return;
    try {
      await resumeBatchJob(job.jobId);
      setJob({ ...job, status: 'running' });
      subscribeTo(job.jobId);
    } catch (e) { setError((e as Error).message); }
  };

  const handleCancel = async () => {
    if (!job) return;
    try {
      await cancelBatchJob(job.jobId);
      const fresh = await fetchBatchStatus(job.jobId);
      setJob(fresh);
      sseRef.current?.close();
    } catch (e) { setError((e as Error).message); }
  };

  const handleRetry = async (ideaId: string) => {
    if (!job) return;
    try {
      await retryBatchItem(job.jobId, ideaId);
      const fresh = await fetchBatchStatus(job.jobId);
      setJob(fresh);
    } catch (e) { setError((e as Error).message); }
  };

  const handleSkip = async (ideaId: string) => {
    if (!job) return;
    try {
      await skipBatchItem(job.jobId, ideaId);
      const fresh = await fetchBatchStatus(job.jobId);
      setJob(fresh);
    } catch (e) { setError((e as Error).message); }
  };

  const stats = job?.stats;
  const isActive = job && (job.status === 'running' || job.status === 'pending');
  const isPaused = job?.status === 'paused';
  const isDone = job && (job.status === 'done' || job.status === 'cancelled');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-800">批量生成</h2>
            {stats && (
              <span className="text-sm text-slate-500">
                {stats.built}/{stats.total} 完成
                {stats.failed > 0 && <span className="text-red-500 ml-1">{stats.failed} 失败</span>}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        {stats && stats.total > 0 && (
          <div className="h-1.5 bg-slate-100">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-green-500 transition-all duration-500"
              style={{ width: `${((stats.built + stats.failed + stats.skipped) / stats.total) * 100}%` }}
            />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {!job && (
            <>
              {/* Selection header */}
              <div className="flex items-center justify-between text-sm text-slate-500">
                <button onClick={toggleAll} className="underline">
                  {selectedIds.size === ideas.length ? '取消全选' : '全选'}
                </button>
                <span>{selectedIds.size}/{ideas.length} 已选</span>
              </div>
              {/* Idea selection list */}
              {ideas.map(idea => (
                <label
                  key={idea.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-indigo-300 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(idea.id)}
                    onChange={() => toggleId(idea.id)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{idea.title}</div>
                    {idea.perspectiveTags && idea.perspectiveTags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {idea.perspectiveTags.map(t => (
                          <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 text-slate-500">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </>
          )}

          {job && (
            /* Job item list */
            <div className="space-y-2">
              {job.items.map((item: BatchItem) => {
                const idea = ideas.find(i => i.id === item.ideaId);
                return (
                  <div
                    key={item.ideaId}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      item.status === 'running' ? 'border-blue-300 bg-blue-50/50' :
                      item.status === 'built' ? 'border-green-200 bg-green-50/30' :
                      item.status === 'failed' ? 'border-red-200 bg-red-50/30' :
                      'border-slate-200'
                    }`}
                  >
                    {STATUS_ICON[item.status] || <Clock className="w-4 h-4 text-slate-400" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">
                        {idea?.title || item.ideaId}
                      </div>
                      <div className="text-xs text-slate-500">
                        {STATUS_LABEL[item.status] || item.status}
                        {item.error && <span className="text-red-500 ml-2">{item.error}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {item.status === 'failed' && !isDone && (
                        <button onClick={() => handleRetry(item.ideaId)} className="p-1 rounded hover:bg-slate-100" title="重试">
                          <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                        </button>
                      )}
                      {item.status === 'queued' && !isDone && (
                        <button onClick={() => handleSkip(item.ideaId)} className="p-1 rounded hover:bg-slate-100" title="跳过">
                          <SkipForward className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          {!job && (
            <button
              onClick={handleStart}
              disabled={selectedIds.size === 0 || isCreating}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              开始生成 ({selectedIds.size})
            </button>
          )}
          {isActive && (
            <>
              <button onClick={handlePause} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-100 text-amber-700 text-sm font-medium hover:bg-amber-200">
                <Pause className="w-4 h-4" /> 暂停
              </button>
              <button onClick={handleCancel} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200">
                <XCircle className="w-4 h-4" /> 取消
              </button>
            </>
          )}
          {isPaused && (
            <>
              <button onClick={handleResume} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-100 text-green-700 text-sm font-medium hover:bg-green-200">
                <Play className="w-4 h-4" /> 继续
              </button>
              <button onClick={handleCancel} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200">
                <XCircle className="w-4 h-4" /> 取消
              </button>
            </>
          )}
          {isDone && (
            <button onClick={onClose} className="px-5 py-2 rounded-lg bg-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-300">
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
