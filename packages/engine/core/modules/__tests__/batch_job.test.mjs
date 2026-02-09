import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJobId,
  validateJobTransition,
  validateItemTransition,
  createBatchJob,
  nextQueuedItem,
  updateItemStatus,
  updateJobStatus,
  computeJobStats,
  isJobComplete,
  normalizeBatchJobList,
  upsertJob,
  findJob,
  findActiveJobsByCampaign,
} from '../batch_job.mjs';

const fixedClock = { now: () => '2026-02-09T10:00:00.000Z' };

// =========================================================================
// buildJobId
// =========================================================================
describe('buildJobId', () => {
  it('should produce job_{timestamp}_{hash} format', () => {
    const id = buildJobId('camp_20260209T0338_1f07', fixedClock);
    assert.match(id, /^job_\d{8}T\d{4}_[0-9a-f]{4}$/);
  });

  it('should include compact timestamp from clock', () => {
    const id = buildJobId('camp_test', fixedClock);
    assert.ok(id.includes('20260209T1000'));
  });

  it('should produce different hashes for different campaigns', () => {
    const a = buildJobId('camp_a', fixedClock);
    const b = buildJobId('camp_b', fixedClock);
    assert.notEqual(a, b);
  });
});

// =========================================================================
// validateJobTransition
// =========================================================================
describe('validateJobTransition', () => {
  it('pending → running: ok', () => {
    const r = validateJobTransition('pending', 'running');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'running');
  });

  it('running → done: ok', () => {
    const r = validateJobTransition('running', 'done');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'done');
  });

  it('running → paused: ok', () => {
    const r = validateJobTransition('running', 'paused');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'paused');
  });

  it('paused → running: ok (resume)', () => {
    const r = validateJobTransition('paused', 'running');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'running');
  });

  it('running → cancelled: ok', () => {
    const r = validateJobTransition('running', 'cancelled');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'cancelled');
  });

  it('pending → cancelled: ok', () => {
    const r = validateJobTransition('pending', 'cancelled');
    assert.equal(r.ok, true);
  });

  it('paused → cancelled: ok', () => {
    const r = validateJobTransition('paused', 'cancelled');
    assert.equal(r.ok, true);
  });

  it('done → running: illegal', () => {
    const r = validateJobTransition('done', 'running');
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('illegal'));
  });

  it('cancelled → running: illegal', () => {
    const r = validateJobTransition('cancelled', 'running');
    assert.equal(r.ok, false);
  });

  it('same status is a no-op', () => {
    const r = validateJobTransition('running', 'running');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'running');
  });

  it('unknown target is rejected', () => {
    const r = validateJobTransition('pending', 'bogus');
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('unknown'));
  });

  it('unknown current defaults to pending', () => {
    const r = validateJobTransition('bogus', 'running');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'running');
  });
});

// =========================================================================
// validateItemTransition
// =========================================================================
describe('validateItemTransition', () => {
  it('queued → running: ok', () => {
    const r = validateItemTransition('queued', 'running');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'running');
  });

  it('running → built: ok', () => {
    const r = validateItemTransition('running', 'built');
    assert.equal(r.ok, true);
  });

  it('running → failed: ok', () => {
    const r = validateItemTransition('running', 'failed');
    assert.equal(r.ok, true);
  });

  it('failed → queued: ok (retry)', () => {
    const r = validateItemTransition('failed', 'queued');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'queued');
  });

  it('queued → skipped: ok', () => {
    const r = validateItemTransition('queued', 'skipped');
    assert.equal(r.ok, true);
  });

  it('built → queued: illegal (terminal)', () => {
    const r = validateItemTransition('built', 'queued');
    assert.equal(r.ok, false);
  });

  it('skipped → running: illegal (terminal)', () => {
    const r = validateItemTransition('skipped', 'running');
    assert.equal(r.ok, false);
  });

  it('queued → built: illegal (must go through running)', () => {
    const r = validateItemTransition('queued', 'built');
    assert.equal(r.ok, false);
  });
});

// =========================================================================
// createBatchJob
// =========================================================================
describe('createBatchJob', () => {
  it('should create a well-formed job', () => {
    const job = createBatchJob({
      campaignId: 'camp_20260209T0338_1f07',
      ideaIds: ['idea_1', 'idea_2', 'idea_3'],
      clock: fixedClock,
    });

    assert.match(job.jobId, /^job_/);
    assert.equal(job.campaignId, 'camp_20260209T0338_1f07');
    assert.equal(job.status, 'pending');
    assert.equal(job.concurrency, 1);
    assert.equal(job.items.length, 3);
    assert.equal(job.createdAt, '2026-02-09T10:00:00.000Z');
  });

  it('items should all be queued with null projectId/error', () => {
    const job = createBatchJob({
      campaignId: 'camp_test',
      ideaIds: ['a', 'b'],
      clock: fixedClock,
    });

    for (const item of job.items) {
      assert.equal(item.status, 'queued');
      assert.equal(item.projectId, null);
      assert.equal(item.error, null);
      assert.equal(item.startedAt, null);
      assert.equal(item.finishedAt, null);
    }
    assert.equal(job.items[0].ideaId, 'a');
    assert.equal(job.items[1].ideaId, 'b');
  });

  it('should clamp concurrency to [1, 4]', () => {
    const j1 = createBatchJob({ campaignId: 'c', ideaIds: ['a'], concurrency: 0, clock: fixedClock });
    assert.equal(j1.concurrency, 1);

    const j2 = createBatchJob({ campaignId: 'c', ideaIds: ['a'], concurrency: 10, clock: fixedClock });
    assert.equal(j2.concurrency, 4);
  });

  it('should throw if campaignId is missing', () => {
    assert.throws(() => createBatchJob({ ideaIds: ['a'], clock: fixedClock }), /campaignId/);
  });

  it('should throw if ideaIds is empty', () => {
    assert.throws(() => createBatchJob({ campaignId: 'c', ideaIds: [], clock: fixedClock }), /non-empty/);
  });

  it('should throw if ideaIds is not an array', () => {
    assert.throws(() => createBatchJob({ campaignId: 'c', ideaIds: 'bad', clock: fixedClock }), /non-empty/);
  });
});

// =========================================================================
// nextQueuedItem
// =========================================================================
describe('nextQueuedItem', () => {
  it('should return the first queued item', () => {
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a', 'b', 'c'], clock: fixedClock });
    const next = nextQueuedItem(job);
    assert.equal(next.ideaId, 'a');
  });

  it('should skip non-queued items', () => {
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a', 'b', 'c'], clock: fixedClock });
    job.items[0].status = 'built';
    job.items[1].status = 'failed';
    const next = nextQueuedItem(job);
    assert.equal(next.ideaId, 'c');
  });

  it('should return null when no queued items remain', () => {
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a'], clock: fixedClock });
    job.items[0].status = 'built';
    assert.equal(nextQueuedItem(job), null);
  });

  it('should handle null/undefined job gracefully', () => {
    assert.equal(nextQueuedItem(null), null);
    assert.equal(nextQueuedItem(undefined), null);
    assert.equal(nextQueuedItem({}), null);
  });
});

// =========================================================================
// updateItemStatus
// =========================================================================
describe('updateItemStatus', () => {
  it('should transition item and return new job', () => {
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a', 'b'], clock: fixedClock });
    const result = updateItemStatus(job, 'a', 'running', { startedAt: '2026-02-09T10:01:00Z' });

    assert.equal(result.ok, true);
    assert.equal(result.job.items[0].status, 'running');
    assert.equal(result.job.items[0].startedAt, '2026-02-09T10:01:00Z');
    // original job not mutated
    assert.equal(job.items[0].status, 'queued');
  });

  it('should reject illegal transition', () => {
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a'], clock: fixedClock });
    const result = updateItemStatus(job, 'a', 'built');
    assert.equal(result.ok, false);
    assert.ok(result.error.includes('illegal'));
  });

  it('should reject unknown ideaId', () => {
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a'], clock: fixedClock });
    const result = updateItemStatus(job, 'nonexistent', 'running');
    assert.equal(result.ok, false);
    assert.ok(result.error.includes('not found'));
  });

  it('should allow failed → queued retry with extra fields', () => {
    let job = createBatchJob({ campaignId: 'c', ideaIds: ['a'], clock: fixedClock });
    // queued → running → failed → queued
    let r = updateItemStatus(job, 'a', 'running');
    r = updateItemStatus(r.job, 'a', 'failed', { error: 'build timeout' });
    assert.equal(r.ok, true);
    assert.equal(r.job.items[0].error, 'build timeout');

    r = updateItemStatus(r.job, 'a', 'queued');
    assert.equal(r.ok, true);
    assert.equal(r.job.items[0].status, 'queued');
  });
});

// =========================================================================
// updateJobStatus
// =========================================================================
describe('updateJobStatus', () => {
  it('should transition job status', () => {
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a'], clock: fixedClock });
    const r = updateJobStatus(job, 'running');
    assert.equal(r.ok, true);
    assert.equal(r.job.status, 'running');
    // original not mutated
    assert.equal(job.status, 'pending');
  });

  it('should reject illegal transition', () => {
    const job = { ...createBatchJob({ campaignId: 'c', ideaIds: ['a'], clock: fixedClock }), status: 'done' };
    const r = updateJobStatus(job, 'running');
    assert.equal(r.ok, false);
  });
});

// =========================================================================
// computeJobStats
// =========================================================================
describe('computeJobStats', () => {
  it('should aggregate item statuses', () => {
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a', 'b', 'c', 'd', 'e'], clock: fixedClock });
    job.items[0].status = 'built';
    job.items[1].status = 'running';
    job.items[2].status = 'failed';
    job.items[3].status = 'skipped';
    // items[4] stays queued

    const stats = computeJobStats(job);
    assert.equal(stats.total, 5);
    assert.equal(stats.built, 1);
    assert.equal(stats.running, 1);
    assert.equal(stats.failed, 1);
    assert.equal(stats.skipped, 1);
    assert.equal(stats.queued, 1);
  });

  it('should handle null/empty job', () => {
    const stats = computeJobStats(null);
    assert.equal(stats.total, 0);
  });
});

// =========================================================================
// isJobComplete
// =========================================================================
describe('isJobComplete', () => {
  it('should return true when all items are terminal', () => {
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a', 'b', 'c'], clock: fixedClock });
    job.items[0].status = 'built';
    job.items[1].status = 'failed';
    job.items[2].status = 'skipped';
    assert.equal(isJobComplete(job), true);
  });

  it('should return false when some items are still queued', () => {
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a', 'b'], clock: fixedClock });
    job.items[0].status = 'built';
    // items[1] is still queued
    assert.equal(isJobComplete(job), false);
  });

  it('should return false when some items are running', () => {
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a'], clock: fixedClock });
    job.items[0].status = 'running';
    assert.equal(isJobComplete(job), false);
  });

  it('should return false for empty job', () => {
    assert.equal(isJobComplete(null), false);
    assert.equal(isJobComplete({ items: [] }), false);
  });
});

// =========================================================================
// normalizeBatchJobList
// =========================================================================
describe('normalizeBatchJobList', () => {
  it('should normalize valid data', () => {
    const raw = {
      updatedAt: '2026-02-09T10:00:00Z',
      jobs: [{ jobId: 'job_1' }, { jobId: 'job_2' }],
    };
    const result = normalizeBatchJobList(raw);
    assert.equal(result.jobs.length, 2);
    assert.equal(result.updatedAt, '2026-02-09T10:00:00Z');
  });

  it('should filter out invalid entries', () => {
    const raw = { jobs: [{ jobId: 'ok' }, null, {}, { jobId: '' }] };
    const result = normalizeBatchJobList(raw);
    assert.equal(result.jobs.length, 1);
  });

  it('should handle null/undefined gracefully', () => {
    const result = normalizeBatchJobList(null);
    assert.deepEqual(result.jobs, []);
    assert.ok(result.updatedAt);
  });
});

// =========================================================================
// upsertJob
// =========================================================================
describe('upsertJob', () => {
  it('should insert new job', () => {
    const container = normalizeBatchJobList(null);
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a'], clock: fixedClock });
    const result = upsertJob(container, job, fixedClock);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].jobId, job.jobId);
  });

  it('should update existing job', () => {
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a'], clock: fixedClock });
    const container = { updatedAt: 'old', jobs: [job] };
    const updatedJob = { ...job, status: 'running' };
    const result = upsertJob(container, updatedJob, fixedClock);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].status, 'running');
  });

  it('should not mutate original container', () => {
    const container = { updatedAt: 'old', jobs: [] };
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a'], clock: fixedClock });
    upsertJob(container, job, fixedClock);
    assert.equal(container.jobs.length, 0);
  });
});

// =========================================================================
// findJob
// =========================================================================
describe('findJob', () => {
  it('should find job by ID', () => {
    const job = createBatchJob({ campaignId: 'c', ideaIds: ['a'], clock: fixedClock });
    const container = { jobs: [job] };
    assert.equal(findJob(container, job.jobId)?.jobId, job.jobId);
  });

  it('should return null for missing ID', () => {
    assert.equal(findJob({ jobs: [] }, 'nope'), null);
    assert.equal(findJob(null, 'nope'), null);
  });
});

// =========================================================================
// findActiveJobsByCampaign
// =========================================================================
describe('findActiveJobsByCampaign', () => {
  it('should find pending/running/paused jobs for campaign', () => {
    const jobs = [
      { jobId: 'j1', campaignId: 'camp_a', status: 'running' },
      { jobId: 'j2', campaignId: 'camp_a', status: 'done' },
      { jobId: 'j3', campaignId: 'camp_a', status: 'paused' },
      { jobId: 'j4', campaignId: 'camp_b', status: 'running' },
    ];
    const container = { jobs };
    const active = findActiveJobsByCampaign(container, 'camp_a');
    assert.equal(active.length, 2);
    assert.deepEqual(active.map(j => j.jobId).sort(), ['j1', 'j3']);
  });

  it('should return empty for no matches', () => {
    assert.deepEqual(findActiveJobsByCampaign({ jobs: [] }, 'camp_x'), []);
    assert.deepEqual(findActiveJobsByCampaign(null, 'camp_x'), []);
  });
});
