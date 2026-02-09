import type { Feedback } from '../types/feedback';
import type { Manifest } from '../types/manifest';
import type { Idea, Campaign, BatchJob } from '../types/idea';

export async function fetchManifest(): Promise<Manifest> {
  const r = await fetch('/api/manifest');
  if (!r.ok) throw new Error(`manifest http ${r.status}`);
  return (await r.json()) as Manifest;
}

export interface BuildStatus {
  status: 'idle' | 'running' | 'error';
  stage?: string;
  progress?: number;
  title?: string;
  error?: string;
}

export async function fetchBuildStatus(): Promise<BuildStatus> {
  const r = await fetch('/api/build-status');
  if (!r.ok) return { status: 'idle' };
  return (await r.json()) as BuildStatus;
}

export async function fetchFeedback(date: string): Promise<Feedback | null> {
  const r = await fetch('/api/feedback?date=' + encodeURIComponent(date));
  if (!r.ok) throw new Error(`feedback http ${r.status}`);
  const j = (await r.json()) as { ok: boolean; data?: Feedback };
  return j?.ok ? (j.data as Feedback | null) : null;
}

export async function saveFeedback(input: {
  date: string;
  rating: number;
  tags: Record<string, string[]>;
  notes: string;
}): Promise<Feedback> {
  const r = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`feedback http ${r.status}`);
  const j = (await r.json()) as { ok: boolean; data?: Feedback; error?: string };
  if (!j?.ok) throw new Error(j?.error || 'save failed');
  return j.data as Feedback;
}

export async function restoreIdea(id: string): Promise<void> {
  const r = await fetch(`/api/idea-restore?id=${encodeURIComponent(id)}`, {
    method: 'POST',
  });
  if (!r.ok) throw new Error(`restore http ${r.status}`);
  const j = (await r.json()) as { ok: boolean; error?: string };
  if (!j?.ok) throw new Error(j?.error || 'restore failed');
}

export async function restoreIdeaFromFiltered(id: string): Promise<void> {
  const r = await fetch(`/api/idea-filtered-restore?id=${encodeURIComponent(id)}`, {
    method: 'POST',
  });
  if (!r.ok) throw new Error(`filtered restore http ${r.status}`);
  const text = await r.text();
  try {
    const j = JSON.parse(text);
    if (!j?.ok) throw new Error(j?.error || 'filtered restore failed');
  } catch (_e) {
    console.error('Failed to parse response as JSON:', text);
    throw new Error('Server returned invalid JSON. See console for details.');
  }
}

export async function restoreIdeaStatus(id: string): Promise<void> {
  const r = await fetch(`/api/idea-status-restore?id=${encodeURIComponent(id)}`, {
    method: 'POST',
  });
  if (!r.ok) throw new Error(`status restore http ${r.status}`);
  const text = await r.text();
  try {
    const j = JSON.parse(text);
    if (!j?.ok) throw new Error(j?.error || 'status restore failed');
  } catch (_e) {
    console.error('Failed to parse response as JSON:', text);
    throw new Error('Server returned invalid JSON. See console for details.');
  }
}

export async function fetchBacklog(): Promise<Idea[]> {
  const r = await fetch('/api/idea-backlog');
  if (!r.ok) throw new Error(`backlog http ${r.status}`);
  const j = await r.json();
  return j.ideas || [];
}

export async function fetchTrendsReport(): Promise<string> {
  const r = await fetch('/api/trends-report');
  if (!r.ok) throw new Error(`trends report http ${r.status}`);
  return await r.text();
}

export async function fetchResearchIndex(): Promise<string> {
  const r = await fetch('/api/research-index');
  if (!r.ok) throw new Error(`research index http ${r.status}`);
  return await r.text();
}

export async function fetchResearchLog(name: string): Promise<string> {
  const r = await fetch(`/api/research-log?name=${encodeURIComponent(name)}`);
  if (!r.ok) throw new Error(`research log http ${r.status}`);
  return await r.text();
}

export async function fetchFiltered(): Promise<Idea[]> {
  const r = await fetch('/api/idea-filtered');
  if (!r.ok) throw new Error(`filtered http ${r.status}`);
  const j = await r.json();
  return j.ideas || [];
}

export async function generateIdeas(prefs: { refreshResearch?: boolean; tags?: string[] }): Promise<Idea[]> {
  const r = await fetch('/api/idea-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (!r.ok) throw new Error(`generate http ${r.status}`);
  const j = await r.json();
  if (j.ok === false) throw new Error(j.error || 'generate failed');
  return j.ideas || [];
}

export async function runResearch(): Promise<{ ok: boolean; message: string; stdout?: string }> {
  const r = await fetch('/api/idea-research', {
    method: 'POST',
  });
  if (!r.ok) throw new Error(`research http ${r.status}`);
  return await r.json();
}

export async function deleteIdea(id: string, view: 'backlog' | 'filtered'): Promise<void> {
  const endpoint = view === 'backlog' ? '/api/idea-backlog' : '/api/idea-filtered';
  const r = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`delete idea http ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'delete failed');
}

export async function saveToQueue(idea: Idea): Promise<void> {
  const r = await fetch('/api/idea-queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea }),
  });
  if (!r.ok) throw new Error(`queue http ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'save to queue failed');
}

export async function prioritizeAndExecute(id: string): Promise<void> {
  const r = await fetch('/api/idea-prioritize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!r.ok) throw new Error(`prioritize http ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'prioritization failed');
}

export async function abortIdeaGeneration(): Promise<void> {
  const r = await fetch('/api/idea-abort', {
    method: 'POST',
  });
  if (!r.ok) throw new Error(`abort http ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'abort failed');
}

// ── Targeted Research ─────────────────────────────────────────

export interface TargetedResearchOpts {
  topic: string;
  creative?: number;
  count?: number;
}

export interface TargetedResearchSSEEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Run targeted research with SSE streaming progress.
 * Returns an EventSource-like controller.
 */
export function runTargetedResearchSSE(
  opts: TargetedResearchOpts,
  handlers: {
    onEvent?: (evt: TargetedResearchSSEEvent) => void;
    onComplete?: (data: { campaign: Campaign | null; ideas: Idea[] }) => void;
    onError?: (err: string) => void;
  }
): { abort: () => void } {
  const ctrl = new AbortController();

  (async () => {
    try {
      const r = await fetch('/api/idea/research/targeted', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(opts),
        signal: ctrl.signal,
      });

      if (!r.ok) {
        const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        handlers.onError?.(j.error || `HTTP ${r.status}`);
        return;
      }

      const reader = r.body?.getReader();
      if (!reader) { handlers.onError?.('No response body'); return; }
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          let event = 'message';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7);
            else if (line.startsWith('data: ')) data = line.slice(6);
          }
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            handlers.onEvent?.({ event, data: parsed });

            if (event === 'complete') {
              handlers.onComplete?.({
                campaign: parsed.campaign || null,
                ideas: parsed.ideas || [],
              });
            }
            if (event === 'error') {
              handlers.onError?.(parsed.message || 'Research failed');
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        handlers.onError?.((err as Error).message || 'Connection failed');
      }
    }
  })();

  return {
    abort: () => ctrl.abort(),
  };
}

/**
 * Run targeted research (non-SSE JSON mode, simpler fallback).
 */
export async function runTargetedResearch(opts: TargetedResearchOpts): Promise<{
  ok: boolean;
  campaign?: Campaign;
  ideas?: Idea[];
  error?: string;
}> {
  const r = await fetch('/api/idea/research/targeted', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!r.ok) throw new Error(`targeted research http ${r.status}`);
  return await r.json();
}

/**
 * Fetch targeted research job status.
 */
export async function fetchTargetedResearchStatus(): Promise<{
  status: 'idle' | 'running';
  topic?: string;
  startedAt?: string;
}> {
  const r = await fetch('/api/idea/research/targeted/status');
  if (!r.ok) return { status: 'idle' };
  return await r.json();
}

/**
 * Fetch all campaigns.
 */
export async function fetchCampaigns(): Promise<Campaign[]> {
  const r = await fetch('/api/campaigns');
  if (!r.ok) throw new Error(`campaigns http ${r.status}`);
  const j = await r.json();
  return j.campaigns || [];
}

/**
 * Delete a campaign and all its associated ideas + batch jobs.
 */
export async function deleteCampaign(campaignId: string): Promise<{ removed: boolean; removedIdeas: number; removedJobs: number }> {
  const r = await fetch(`/api/campaigns?campaignId=${encodeURIComponent(campaignId)}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`delete campaign http ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'delete campaign failed');
  return { removed: j.removed, removedIdeas: j.removedIdeas, removedJobs: j.removedJobs };
}

// ── Batch Build API ──────────────────────────────────────────

export async function createBatchJob(campaignId: string, ideaIds: string[]): Promise<{ jobId: string }> {
  const r = await fetch('/api/batch/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId, ideaIds }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    throw new Error(j.error || `batch create http ${r.status}`);
  }
  return await r.json();
}

export async function startBatchJob(jobId: string): Promise<void> {
  const r = await fetch('/api/batch/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    throw new Error(j.error || `batch start http ${r.status}`);
  }
}

export async function fetchBatchStatus(jobId: string): Promise<BatchJob> {
  const r = await fetch(`/api/batch/status?jobId=${encodeURIComponent(jobId)}`);
  if (!r.ok) throw new Error(`batch status http ${r.status}`);
  const j = await r.json();
  return j.job;
}

export async function pauseBatchJob(jobId: string): Promise<void> {
  const r = await fetch('/api/batch/pause', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });
  if (!r.ok) throw new Error(`batch pause http ${r.status}`);
}

export async function resumeBatchJob(jobId: string): Promise<void> {
  const r = await fetch('/api/batch/resume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });
  if (!r.ok) throw new Error(`batch resume http ${r.status}`);
}

export async function cancelBatchJob(jobId: string): Promise<void> {
  const r = await fetch('/api/batch/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });
  if (!r.ok) throw new Error(`batch cancel http ${r.status}`);
}

export async function retryBatchItem(jobId: string, ideaId: string): Promise<void> {
  const r = await fetch('/api/batch/retry-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, ideaId }),
  });
  if (!r.ok) throw new Error(`batch retry http ${r.status}`);
}

export async function skipBatchItem(jobId: string, ideaId: string): Promise<void> {
  const r = await fetch('/api/batch/skip-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, ideaId }),
  });
  if (!r.ok) throw new Error(`batch skip http ${r.status}`);
}

export async function fetchBatchJobs(campaignId?: string): Promise<BatchJob[]> {
  const params = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : '';
  const r = await fetch(`/api/batch/jobs${params}`);
  if (!r.ok) throw new Error(`batch jobs http ${r.status}`);
  const j = await r.json();
  return j.jobs || [];
}

export interface BatchSSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export function subscribeBatchEvents(
  jobId: string,
  handlers: {
    onEvent?: (evt: BatchSSEEvent) => void;
    onDone?: () => void;
    onError?: (err: string) => void;
  },
): { close: () => void } {
  const es = new EventSource(`/api/batch/events?jobId=${encodeURIComponent(jobId)}`);

  const handleMsg = (type: string) => (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      handlers.onEvent?.({ event: type, data });
      if (type === 'job:done' || type === 'job:cancelled') handlers.onDone?.();
    } catch { /* ignore */ }
  };

  const events = [
    'connected', 'job:started', 'job:done', 'job:paused', 'job:cancelled', 'job:error',
    'item:running', 'item:progress', 'item:built', 'item:failed', 'item:error',
  ];
  for (const evt of events) es.addEventListener(evt, handleMsg(evt));
  es.onerror = () => handlers.onError?.('SSE connection lost');

  return { close: () => es.close() };
}
