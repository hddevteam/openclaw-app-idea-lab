/**
 * Batch Job – pure functions for batch build job management.
 *
 * Data structures & state machines follow §5.1 Q2 of the design doc.
 * All functions are pure (clock injectable), no side effects.
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Job-level status machine
// ---------------------------------------------------------------------------
//   pending → running → done
//                     → paused → running (resume)
//   running → cancelled
// ---------------------------------------------------------------------------
const JOB_STATUSES = new Set(['pending', 'running', 'done', 'paused', 'cancelled']);

const JOB_TRANSITIONS = {
  pending:   new Set(['running', 'cancelled']),
  running:   new Set(['done', 'paused', 'cancelled']),
  paused:    new Set(['running', 'cancelled']),
  // terminal
  done:       new Set(),
  cancelled:  new Set(),
};

// ---------------------------------------------------------------------------
// Item-level status machine
// ---------------------------------------------------------------------------
//   queued → running → built
//                    → failed → queued (retry)
//   queued → skipped
// ---------------------------------------------------------------------------
const ITEM_STATUSES = new Set(['queued', 'running', 'built', 'failed', 'skipped']);

const ITEM_TRANSITIONS = {
  queued:  new Set(['running', 'skipped']),
  running: new Set(['built', 'failed']),
  failed:  new Set(['queued']),
  // terminal
  built:   new Set(),
  skipped: new Set(),
};

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * Build a deterministic job ID.
 * Format: job_{compactTimestamp}_{shortHash}
 *
 * @param {string} campaignId
 * @param {{ now: () => string }} clock
 * @returns {string}
 */
export function buildJobId(campaignId, clock = { now: () => new Date().toISOString() }) {
  const iso = clock.now();
  const ts = iso.replace(/[-:]/g, '').slice(0, 13);
  const hash = createHash('sha256').update(`${campaignId}_${iso}`).digest('hex').slice(0, 4);
  return `job_${ts}_${hash}`;
}

// ---------------------------------------------------------------------------
// State machine validators
// ---------------------------------------------------------------------------

/**
 * Validate a job-level status transition.
 * @param {string} current
 * @param {string} target
 * @returns {{ ok: boolean, status: string, error?: string }}
 */
export function validateJobTransition(current, target) {
  const cur = JOB_STATUSES.has(current) ? current : 'pending';
  const tgt = String(target || '').toLowerCase().trim();

  if (!JOB_STATUSES.has(tgt)) {
    return { ok: false, status: cur, error: `unknown job status: "${target}"` };
  }
  if (cur === tgt) return { ok: true, status: cur };

  const allowed = JOB_TRANSITIONS[cur];
  if (!allowed || !allowed.has(tgt)) {
    return { ok: false, status: cur, error: `illegal job transition: ${cur} → ${tgt}` };
  }
  return { ok: true, status: tgt };
}

/**
 * Validate an item-level status transition.
 * @param {string} current
 * @param {string} target
 * @returns {{ ok: boolean, status: string, error?: string }}
 */
export function validateItemTransition(current, target) {
  const cur = ITEM_STATUSES.has(current) ? current : 'queued';
  const tgt = String(target || '').toLowerCase().trim();

  if (!ITEM_STATUSES.has(tgt)) {
    return { ok: false, status: cur, error: `unknown item status: "${target}"` };
  }
  if (cur === tgt) return { ok: true, status: cur };

  const allowed = ITEM_TRANSITIONS[cur];
  if (!allowed || !allowed.has(tgt)) {
    return { ok: false, status: cur, error: `illegal item transition: ${cur} → ${tgt}` };
  }
  return { ok: true, status: tgt };
}

// ---------------------------------------------------------------------------
// Job CRUD helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Create a new batch job object.
 *
 * @param {object} opts
 * @param {string} opts.campaignId
 * @param {string[]} opts.ideaIds – ordered list of idea IDs to build
 * @param {number}  [opts.concurrency=1]
 * @param {{ now: () => string }} [opts.clock]
 * @returns {object} job
 */
export function createBatchJob({ campaignId, ideaIds, concurrency = 1, clock }) {
  if (!campaignId) throw new Error('campaignId is required');
  if (!Array.isArray(ideaIds) || ideaIds.length === 0) {
    throw new Error('ideaIds must be a non-empty array');
  }

  const clk = clock || { now: () => new Date().toISOString() };
  const jobId = buildJobId(campaignId, clk);

  return {
    jobId,
    campaignId,
    createdAt: clk.now(),
    concurrency: Math.max(1, Math.min(4, Number(concurrency) || 1)),
    status: 'pending',
    items: ideaIds.map(ideaId => ({
      ideaId: String(ideaId),
      status: 'queued',
      projectId: null,
      error: null,
      startedAt: null,
      finishedAt: null,
    })),
  };
}

/**
 * Get the next queued item in a job (status-driven, not cursor-based).
 * @param {object} job
 * @returns {object|null} item or null if no queued items remain
 */
export function nextQueuedItem(job) {
  if (!job || !Array.isArray(job.items)) return null;
  return job.items.find(it => it.status === 'queued') || null;
}

/**
 * Update a specific item's status within a job (immutable – returns new job).
 *
 * @param {object} job
 * @param {string} ideaId
 * @param {string} newStatus
 * @param {object} [extra] – additional fields (projectId, error, startedAt, finishedAt)
 * @returns {{ job: object, ok: boolean, error?: string }}
 */
export function updateItemStatus(job, ideaId, newStatus, extra = {}) {
  const idx = job.items.findIndex(it => it.ideaId === ideaId);
  if (idx === -1) {
    return { job, ok: false, error: `item not found: ${ideaId}` };
  }

  const item = job.items[idx];
  const transition = validateItemTransition(item.status, newStatus);
  if (!transition.ok) {
    return { job, ok: false, error: transition.error };
  }

  const newItems = [...job.items];
  newItems[idx] = {
    ...item,
    status: transition.status,
    ...extra,
  };

  return {
    job: { ...job, items: newItems },
    ok: true,
  };
}

/**
 * Update a job's top-level status (immutable – returns new job).
 *
 * @param {object} job
 * @param {string} newStatus
 * @returns {{ job: object, ok: boolean, error?: string }}
 */
export function updateJobStatus(job, newStatus) {
  const transition = validateJobTransition(job.status, newStatus);
  if (!transition.ok) {
    return { job, ok: false, error: transition.error };
  }
  return {
    job: { ...job, status: transition.status },
    ok: true,
  };
}

/**
 * Compute aggregate stats for a job.
 * @param {object} job
 * @returns {{ total: number, queued: number, running: number, built: number, failed: number, skipped: number }}
 */
export function computeJobStats(job) {
  const stats = { total: 0, queued: 0, running: 0, built: 0, failed: 0, skipped: 0 };
  if (!job || !Array.isArray(job.items)) return stats;

  for (const item of job.items) {
    stats.total++;
    if (item.status in stats) stats[item.status]++;
  }
  return stats;
}

/**
 * Check if a job should be marked as done (all items in terminal state).
 * @param {object} job
 * @returns {boolean}
 */
export function isJobComplete(job) {
  if (!job || !Array.isArray(job.items) || job.items.length === 0) return false;
  return job.items.every(it => it.status === 'built' || it.status === 'failed' || it.status === 'skipped');
}

// ---------------------------------------------------------------------------
// batch_jobs.json container helpers
// ---------------------------------------------------------------------------

/**
 * Normalize the batch_jobs.json container.
 * @param {*} raw
 * @returns {{ updatedAt: string, jobs: object[] }}
 */
export function normalizeBatchJobList(raw) {
  if (!raw || typeof raw !== 'object') raw = {};
  const jobs = Array.isArray(raw.jobs) ? raw.jobs : [];
  return {
    updatedAt: raw.updatedAt || new Date().toISOString(),
    jobs: jobs.filter(j => j && j.jobId),
  };
}

/**
 * Upsert a job into the jobs list (immutable – returns new container).
 * @param {object} container – { updatedAt, jobs }
 * @param {object} job – the job to upsert
 * @param {{ now: () => string }} [clock]
 * @returns {object} new container
 */
export function upsertJob(container, job, clock) {
  const now = clock ? clock.now() : new Date().toISOString();
  const existing = container.jobs.findIndex(j => j.jobId === job.jobId);
  const newJobs = [...container.jobs];
  if (existing >= 0) {
    newJobs[existing] = job;
  } else {
    newJobs.push(job);
  }
  return { updatedAt: now, jobs: newJobs };
}

/**
 * Find a job by ID.
 * @param {object} container
 * @param {string} jobId
 * @returns {object|null}
 */
export function findJob(container, jobId) {
  if (!container || !Array.isArray(container.jobs)) return null;
  return container.jobs.find(j => j.jobId === jobId) || null;
}

/**
 * Find active (non-terminal) jobs for a campaign.
 * @param {object} container
 * @param {string} campaignId
 * @returns {object[]}
 */
export function findActiveJobsByCampaign(container, campaignId) {
  if (!container || !Array.isArray(container.jobs)) return [];
  return container.jobs.filter(
    j => j.campaignId === campaignId && (j.status === 'pending' || j.status === 'running' || j.status === 'paused'),
  );
}
