import type { Feedback } from '../types/feedback';
import type { Manifest } from '../types/manifest';
import type { Idea } from '../types/idea';

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
