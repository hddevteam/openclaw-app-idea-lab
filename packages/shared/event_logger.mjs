/**
 * Structured event logger for the idea-generate → research → build pipeline.
 *
 * Events are JSON-lines appended to a daily log file (one file per day).
 * Each event carries a `runId` for end-to-end correlation.
 *
 * Usage:
 *   const log = createEventLogger({ logDir: '/path/to/logs' });
 *   log.emit('idea_generate.accepted', { runId, count: 5 });
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// generateRunId
// ---------------------------------------------------------------------------
export function generateRunId() {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHmmss
  const rand = randomUUID().slice(0, 6);
  return `run-${ts}-${rand}`;
}

// ---------------------------------------------------------------------------
// createEventLogger
// ---------------------------------------------------------------------------
export function createEventLogger({ logDir }) {
  function todayFile() {
    const d = new Date();
    const tag = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return path.join(logDir, `events-${tag}.jsonl`);
  }

  async function emit(event, data = {}) {
    const entry = {
      ts: new Date().toISOString(),
      event,
      ...data,
    };
    const line = JSON.stringify(entry) + '\n';
    try {
      await fs.mkdir(logDir, { recursive: true });
      await fs.appendFile(todayFile(), line, 'utf8');
    } catch (err) {
      console.error(`[EventLog] Failed to write event "${event}":`, err.message);
    }
  }

  return { emit, generateRunId };
}
