/**
 * Hub API – Batch Build endpoints.
 *
 * POST /api/batch/create       – create a new batch job
 * GET  /api/batch/status       – get job status (?jobId=xxx)
 * POST /api/batch/pause        – pause a running job
 * POST /api/batch/resume       – resume a paused job
 * POST /api/batch/cancel       – cancel a job
 * POST /api/batch/retry-item   – retry a failed item
 * POST /api/batch/skip-item    – skip a queued item
 * GET  /api/batch/events       – SSE stream (?jobId=xxx)
 * GET  /api/batch/jobs         – list all jobs (optionally by campaign)
 */

import path from 'node:path';
import { readJsonSafe, writeJsonAtomic } from '../../../packages/shared/atomic_fs.mjs';
import {
  normalizeBatchJobList,
  createBatchJob,
  findJob,
  findActiveJobsByCampaign,
  upsertJob,
  updateJobStatus,
  updateItemStatus,
  computeJobStats,
} from '../../../packages/engine/core/modules/batch_job.mjs';
import { runBatchJob } from './batch_runner.mjs';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let activeRun = null; // { jobId, promise, sseClients: Set }
const sseClients = new Map(); // jobId → Set<res>

function batchPath(labRuntime) {
  return path.join(labRuntime, 'data', 'batch_jobs.json');
}
async function readBatch(labRuntime) {
  return normalizeBatchJobList(await readJsonSafe(batchPath(labRuntime), { jobs: [] }));
}
async function saveBatch(labRuntime, container) {
  await writeJsonAtomic(batchPath(labRuntime), container);
}

function broadcastSSE(jobId, event, data) {
  const clients = sseClients.get(jobId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch (_) { clients.delete(res); }
  }
}

// ---------------------------------------------------------------------------
// POST /api/batch/create
// ---------------------------------------------------------------------------
export async function handleBatchCreate(req, res, { labRuntime }) {
  let body = '';
  req.on('data', c => body += c);
  await new Promise(r => req.on('end', r));

  const input = JSON.parse(body || '{}');
  const { campaignId, ideaIds, concurrency } = input;

  if (!campaignId || !Array.isArray(ideaIds) || ideaIds.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'campaignId and non-empty ideaIds required' }));
  }

  // Check for existing active job on this campaign
  const container = await readBatch(labRuntime);
  const existing = findActiveJobsByCampaign(container, campaignId);
  if (existing.length > 0) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: false,
      error: 'An active batch job already exists for this campaign',
      activeJobId: existing[0].jobId,
    }));
  }

  const job = createBatchJob({ campaignId, ideaIds, concurrency });
  const updated = upsertJob(container, job);
  await saveBatch(labRuntime, updated);

  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, jobId: job.jobId, stats: computeJobStats(job) }));
}

// ---------------------------------------------------------------------------
// POST /api/batch/start
// ---------------------------------------------------------------------------
export async function handleBatchStart(req, res, { labRuntime, labRoot }) {
  let body = '';
  req.on('data', c => body += c);
  await new Promise(r => req.on('end', r));

  const { jobId } = JSON.parse(body || '{}');
  if (!jobId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'jobId required' }));
  }

  if (activeRun && activeRun.jobId) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: `Another job is running: ${activeRun.jobId}` }));
  }

  // Start the runner in background
  const emit = (event, data) => broadcastSSE(jobId, event, data);
  const promise = runBatchJob(jobId, { labRuntime, labRoot, emit })
    .catch(e => ({ ok: false, error: e.message }))
    .finally(() => { if (activeRun?.jobId === jobId) activeRun = null; });

  activeRun = { jobId, promise };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, message: `Batch job ${jobId} started` }));
}

// ---------------------------------------------------------------------------
// GET /api/batch/status?jobId=xxx
// ---------------------------------------------------------------------------
export async function handleBatchStatus(req, res, { labRuntime }) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const jobId = url.searchParams.get('jobId');

  if (!jobId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'jobId query param required' }));
  }

  const container = await readBatch(labRuntime);
  const job = findJob(container, jobId);
  if (!job) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Job not found' }));
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, job, stats: computeJobStats(job) }));
}

// ---------------------------------------------------------------------------
// POST /api/batch/pause
// ---------------------------------------------------------------------------
export async function handleBatchPause(req, res, { labRuntime }) {
  let body = '';
  req.on('data', c => body += c);
  await new Promise(r => req.on('end', r));
  const { jobId } = JSON.parse(body || '{}');

  const container = await readBatch(labRuntime);
  const job = findJob(container, jobId);
  if (!job) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Job not found' }));
  }

  const result = updateJobStatus(job, 'paused');
  if (!result.ok) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: result.error }));
  }

  const updated = upsertJob(container, result.job);
  await saveBatch(labRuntime, updated);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, status: result.job.status }));
}

// ---------------------------------------------------------------------------
// POST /api/batch/resume
// ---------------------------------------------------------------------------
export async function handleBatchResume(req, res, { labRuntime, labRoot }) {
  let body = '';
  req.on('data', c => body += c);
  await new Promise(r => req.on('end', r));
  const { jobId } = JSON.parse(body || '{}');

  const container = await readBatch(labRuntime);
  const job = findJob(container, jobId);
  if (!job) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Job not found' }));
  }

  const result = updateJobStatus(job, 'running');
  if (!result.ok) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: result.error }));
  }

  const updated = upsertJob(container, result.job);
  await saveBatch(labRuntime, updated);

  // Re-start the runner if no active run
  if (!activeRun || !activeRun.jobId) {
    const emit = (event, data) => broadcastSSE(jobId, event, data);
    const promise = runBatchJob(jobId, { labRuntime, labRoot, emit })
      .catch(e => ({ ok: false, error: e.message }))
      .finally(() => { if (activeRun?.jobId === jobId) activeRun = null; });
    activeRun = { jobId, promise };
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, status: 'running' }));
}

// ---------------------------------------------------------------------------
// POST /api/batch/cancel
// ---------------------------------------------------------------------------
export async function handleBatchCancel(req, res, { labRuntime }) {
  let body = '';
  req.on('data', c => body += c);
  await new Promise(r => req.on('end', r));
  const { jobId } = JSON.parse(body || '{}');

  const container = await readBatch(labRuntime);
  const job = findJob(container, jobId);
  if (!job) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Job not found' }));
  }

  const result = updateJobStatus(job, 'cancelled');
  if (!result.ok) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: result.error }));
  }

  const updated = upsertJob(container, result.job);
  await saveBatch(labRuntime, updated);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, status: 'cancelled' }));
}

// ---------------------------------------------------------------------------
// POST /api/batch/retry-item
// ---------------------------------------------------------------------------
export async function handleBatchRetryItem(req, res, { labRuntime }) {
  let body = '';
  req.on('data', c => body += c);
  await new Promise(r => req.on('end', r));
  const { jobId, ideaId } = JSON.parse(body || '{}');

  const container = await readBatch(labRuntime);
  const job = findJob(container, jobId);
  if (!job) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Job not found' }));
  }

  const result = updateItemStatus(job, ideaId, 'queued');
  if (!result.ok) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: result.error }));
  }

  const updated = upsertJob(container, result.job);
  await saveBatch(labRuntime, updated);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, stats: computeJobStats(result.job) }));
}

// ---------------------------------------------------------------------------
// POST /api/batch/skip-item
// ---------------------------------------------------------------------------
export async function handleBatchSkipItem(req, res, { labRuntime }) {
  let body = '';
  req.on('data', c => body += c);
  await new Promise(r => req.on('end', r));
  const { jobId, ideaId } = JSON.parse(body || '{}');

  const container = await readBatch(labRuntime);
  const job = findJob(container, jobId);
  if (!job) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Job not found' }));
  }

  const result = updateItemStatus(job, ideaId, 'skipped');
  if (!result.ok) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: result.error }));
  }

  const updated = upsertJob(container, result.job);
  await saveBatch(labRuntime, updated);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, stats: computeJobStats(result.job) }));
}

// ---------------------------------------------------------------------------
// GET /api/batch/events?jobId=xxx  (SSE)
// ---------------------------------------------------------------------------
export function handleBatchEvents(req, res, { labRuntime: _labRuntime }) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const jobId = url.searchParams.get('jobId');

  if (!jobId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'jobId required' }));
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ jobId })}\n\n`);

  if (!sseClients.has(jobId)) sseClients.set(jobId, new Set());
  sseClients.get(jobId).add(res);

  req.on('close', () => {
    const clients = sseClients.get(jobId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) sseClients.delete(jobId);
    }
  });
}

// ---------------------------------------------------------------------------
// GET /api/batch/jobs?campaignId=xxx  (list all/filtered)
// ---------------------------------------------------------------------------
export async function handleBatchJobs(req, res, { labRuntime }) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const campaignId = url.searchParams.get('campaignId');

  const container = await readBatch(labRuntime);
  let jobs = container.jobs;
  if (campaignId) {
    jobs = jobs.filter(j => j.campaignId === campaignId);
  }

  // Enrich with stats
  const enriched = jobs.map(j => ({ ...j, stats: computeJobStats(j) }));

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, jobs: enriched }));
}
