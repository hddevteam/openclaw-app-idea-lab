/**
 * Batch Runner – sequential build executor for batch jobs.
 *
 * Reads a job from batch_jobs.json, processes items one-by-one by
 * triggering the existing build pipeline (run_idle_job.sh --force)
 * and polling build_status.json for completion.
 *
 * Emits progress events via a callback for SSE forwarding.
 */

import path from 'node:path';
import { spawn } from 'node:child_process';
import { readJsonSafe, writeJsonAtomic, withFileLock } from '../../../packages/shared/atomic_fs.mjs';
import { normalizeIdeaList, normalizeBuildStatus } from '../../../packages/shared/json_contract.mjs';
import {
  normalizeBatchJobList,
  findJob,
  upsertJob,
  nextQueuedItem,
  updateItemStatus,
  updateJobStatus,
  isJobComplete,
  computeJobStats,
} from '../../../packages/engine/core/modules/batch_job.mjs';

const POLL_INTERVAL_MS = 3000;    // poll build_status every 3s
const BUILD_TIMEOUT_MS = 10 * 60 * 1000; // 10 min max per build

/**
 * @typedef {object} BatchRunnerDeps
 * @property {string} labRuntime – path to packages/engine/runtime
 * @property {string} labRoot   – path to packages/engine
 * @property {(event: string, data: object) => void} emit – SSE event emitter
 * @property {{ now: () => string }} [clock]
 */

/**
 * Run a batch job (sequential, one item at a time).
 *
 * @param {string} jobId
 * @param {BatchRunnerDeps} deps
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function runBatchJob(jobId, deps) {
  const { labRuntime, labRoot, emit, clock } = deps;
  const clk = clock || { now: () => new Date().toISOString() };
  const batchPath = path.join(labRuntime, 'data', 'batch_jobs.json');
  const backlogPath = path.join(labRuntime, 'data', 'idea_backlog.json');
  const buildStatusPath = path.join(labRuntime, 'data', 'build_status.json');

  // --- helpers ---
  const readBatch = () => readJsonSafe(batchPath, { jobs: [] }).then(normalizeBatchJobList);
  const saveBatch = (container) => writeJsonAtomic(batchPath, container);

  // Load and validate
  let container = await readBatch();
  let job = findJob(container, jobId);
  if (!job) return { ok: false, error: `Job not found: ${jobId}` };

  // Transition to running
  const startResult = updateJobStatus(job, 'running');
  if (!startResult.ok) return { ok: false, error: startResult.error };
  job = startResult.job;
  container = upsertJob(container, job, clk);
  await saveBatch(container);
  emit('job:started', { jobId, stats: computeJobStats(job) });

  // --- Main loop: process items one by one ---
  while (true) {
    // Re-read job to respect external pause/cancel
    container = await readBatch();
    job = findJob(container, jobId);
    if (!job) {
      emit('job:error', { jobId, error: 'Job disappeared from batch_jobs.json' });
      return { ok: false, error: 'Job disappeared' };
    }

    // Check job-level status (pause/cancel)
    if (job.status === 'paused') {
      emit('job:paused', { jobId });
      return { ok: true };
    }
    if (job.status === 'cancelled') {
      emit('job:cancelled', { jobId });
      return { ok: true };
    }

    const item = nextQueuedItem(job);
    if (!item) {
      // No more queued items → mark done
      if (isJobComplete(job)) {
        const doneResult = updateJobStatus(job, 'done');
        if (doneResult.ok) {
          container = upsertJob(container, doneResult.job, clk);
          await saveBatch(container);
        }
        emit('job:done', { jobId, stats: computeJobStats(job) });
      }
      return { ok: true };
    }

    // Mark item as running
    const runResult = updateItemStatus(job, item.ideaId, 'running', { startedAt: clk.now() });
    if (!runResult.ok) {
      emit('item:error', { jobId, ideaId: item.ideaId, error: runResult.error });
      continue;
    }
    job = runResult.job;
    container = upsertJob(container, job, clk);
    await saveBatch(container);
    emit('item:running', { jobId, ideaId: item.ideaId, stats: computeJobStats(job) });

    // 1. Mark idea as implement-now in backlog
    try {
      await markIdeaForBuild(backlogPath, item.ideaId);
    } catch (e) {
      // Skip this item if idea not found
      const failResult = updateItemStatus(job, item.ideaId, 'failed', {
        error: e.message, finishedAt: clk.now(),
      });
      if (failResult.ok) job = failResult.job;
      container = upsertJob(container, job, clk);
      await saveBatch(container);
      emit('item:failed', { jobId, ideaId: item.ideaId, error: e.message });
      continue;
    }

    // 2. Spawn build process and wait for completion
    let buildResult;
    try {
      buildResult = await spawnAndAwaitBuild({ labRoot, buildStatusPath, emit, jobId, ideaId: item.ideaId });
    } catch (e) {
      buildResult = { ok: false, error: e.message };
    }

    // 3. Update item status based on build result
    if (buildResult.ok) {
      const builtResult = updateItemStatus(job, item.ideaId, 'built', {
        projectId: buildResult.outId || null,
        finishedAt: clk.now(),
      });
      if (builtResult.ok) job = builtResult.job;
      container = upsertJob(container, job, clk);
      await saveBatch(container);
      emit('item:built', {
        jobId, ideaId: item.ideaId, projectId: buildResult.outId, stats: computeJobStats(job),
      });
    } else {
      const failResult = updateItemStatus(job, item.ideaId, 'failed', {
        error: buildResult.error, finishedAt: clk.now(),
      });
      if (failResult.ok) job = failResult.job;
      container = upsertJob(container, job, clk);
      await saveBatch(container);
      emit('item:failed', { jobId, ideaId: item.ideaId, error: buildResult.error, stats: computeJobStats(job) });
    }
  }
}

/**
 * Mark an idea as 'implement-now' in backlog.
 * Also resets any other 'implement-now' idea to 'new'.
 */
async function markIdeaForBuild(backlogPath, ideaId) {
  let found = false;
  await withFileLock(backlogPath, async () => {
    const backlog = normalizeIdeaList(await readJsonSafe(backlogPath, { ideas: [] }));
    const nextIdeas = backlog.ideas.map(idea => {
      if (String(idea.id) === String(ideaId)) {
        found = true;
        return { ...idea, status: 'implement-now', prioritizedAt: new Date().toISOString() };
      }
      if (idea.status === 'implement-now') return { ...idea, status: 'new' };
      return idea;
    });
    if (!found) throw new Error(`Idea ${ideaId} not found in backlog`);
    await writeJsonAtomic(backlogPath, { ...backlog, ideas: nextIdeas, updatedAt: new Date().toISOString() });
  });
}

/**
 * Spawn run_idle_job.sh --force and poll build_status.json until build finishes.
 *
 * @returns {Promise<{ ok: boolean, outId?: string, error?: string }>}
 */
function spawnAndAwaitBuild({ labRoot, buildStatusPath, emit, jobId, ideaId }) {
  return new Promise((resolve) => {
    const scriptPath = path.join(labRoot, 'core', 'scripts', 'run_idle_job.sh');

    const child = spawn(scriptPath, ['--force'], {
      cwd: labRoot,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH}`,
      },
    });

    child.unref();
    let settled = false;
    const startTime = Date.now();

    // Poll build_status.json for completion
    const timer = setInterval(async () => {
      if (settled) return;
      try {
        const raw = await readJsonSafe(buildStatusPath, {});
        const bs = normalizeBuildStatus(raw);

        // Emit progress
        emit('item:progress', {
          jobId, ideaId,
          stage: bs.stage,
          progress: bs.progress,
          title: bs.title,
        });

        // Check for completion
        if (bs.status === 'idle' && bs.stage !== '' && startTime < Date.now() - 5000) {
          // Build finished (status returned to idle after being active)
          settled = true;
          clearInterval(timer);
          // Check if it was successful by looking at stage
          if (bs.stage === 'aborted') {
            resolve({ ok: false, error: 'Build was aborted' });
          } else {
            resolve({ ok: true, outId: bs.outId || null });
          }
        } else if (bs.status === 'error') {
          settled = true;
          clearInterval(timer);
          resolve({ ok: false, error: bs.error || 'Build error' });
        } else if (bs.status === 'complete') {
          settled = true;
          clearInterval(timer);
          resolve({ ok: true, outId: bs.outId || null });
        }

        // Timeout check
        if (Date.now() - startTime > BUILD_TIMEOUT_MS) {
          settled = true;
          clearInterval(timer);
          try { process.kill(-child.pid, 'SIGTERM'); } catch (_) { /* */ }
          resolve({ ok: false, error: 'Build timeout (10 min)' });
        }
      } catch (_) { /* ignore read errors, retry next poll */ }
    }, POLL_INTERVAL_MS);

    // Also listen for process exit as a fallback
    child.on('exit', (code) => {
      if (settled) return;
      // Give a brief delay for build_status.json to be written
      setTimeout(async () => {
        if (settled) return;
        settled = true;
        clearInterval(timer);
        try {
          const raw = await readJsonSafe(buildStatusPath, {});
          const bs = normalizeBuildStatus(raw);
          if (bs.status === 'error') {
            resolve({ ok: false, error: bs.error || `Build exited with code ${code}` });
          } else {
            resolve({ ok: code === 0, outId: bs.outId || null, error: code !== 0 ? `exit code ${code}` : undefined });
          }
        } catch (_) {
          resolve({ ok: code === 0, error: code !== 0 ? `exit code ${code}` : undefined });
        }
      }, 1000);
    });
  });
}

// Exported for testing
export { markIdeaForBuild };
