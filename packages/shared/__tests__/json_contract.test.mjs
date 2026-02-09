import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIdeaStatus } from '../json_contract.mjs';

describe('normalizeIdeaStatus – targeted idea state machine', () => {
  // ----- valid transitions -----
  it('new → queued', () => {
    const r = normalizeIdeaStatus('new', 'queued');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'queued');
  });

  it('new → skipped', () => {
    const r = normalizeIdeaStatus('new', 'skipped');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'skipped');
  });

  it('queued → running', () => {
    const r = normalizeIdeaStatus('queued', 'running');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'running');
  });

  it('running → built', () => {
    const r = normalizeIdeaStatus('running', 'built');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'built');
  });

  it('running → failed', () => {
    const r = normalizeIdeaStatus('running', 'failed');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'failed');
  });

  it('failed → queued (retry)', () => {
    const r = normalizeIdeaStatus('failed', 'queued');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'queued');
  });

  // ----- same-state (no-op) -----
  it('same state transition is ok (idempotent)', () => {
    for (const s of ['new', 'queued', 'running', 'built', 'failed', 'skipped']) {
      const r = normalizeIdeaStatus(s, s);
      assert.equal(r.ok, true, `${s} → ${s} should be ok`);
      assert.equal(r.status, s);
    }
  });

  // ----- illegal transitions -----
  it('queued → built (skip running) is illegal', () => {
    const r = normalizeIdeaStatus('queued', 'built');
    assert.equal(r.ok, false);
    assert.equal(r.status, 'queued'); // stays
    assert.ok(r.error.includes('illegal'));
  });

  it('built → queued (terminal state) is illegal', () => {
    const r = normalizeIdeaStatus('built', 'queued');
    assert.equal(r.ok, false);
    assert.equal(r.status, 'built');
  });

  it('skipped → queued is illegal', () => {
    const r = normalizeIdeaStatus('skipped', 'queued');
    assert.equal(r.ok, false);
  });

  it('new → running (skip queued) is illegal', () => {
    const r = normalizeIdeaStatus('new', 'running');
    assert.equal(r.ok, false);
  });

  it('new → built is illegal', () => {
    const r = normalizeIdeaStatus('new', 'built');
    assert.equal(r.ok, false);
  });

  it('running → queued (wrong direction) is illegal', () => {
    const r = normalizeIdeaStatus('running', 'queued');
    assert.equal(r.ok, false);
  });

  // ----- edge cases -----
  it('unknown current status defaults to new', () => {
    const r = normalizeIdeaStatus('garbage', 'queued');
    assert.equal(r.ok, true);
    assert.equal(r.status, 'queued');
  });

  it('unknown target status returns error', () => {
    const r = normalizeIdeaStatus('new', 'garbage');
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('unknown'));
  });

  it('null/undefined target returns error', () => {
    const r = normalizeIdeaStatus('new', null);
    assert.equal(r.ok, false);
  });
});
