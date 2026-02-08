/**
 * Atomic JSON file operations with lightweight locking.
 * Prevents partial writes (write→rename) and concurrent overwrites (lock file).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// writeJsonAtomic – write to tmp then rename (atomic on POSIX)
// ---------------------------------------------------------------------------
export async function writeJsonAtomic(filePath, data, { indent = 2 } = {}) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${randomUUID()}.json`);
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, indent);
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, filePath);
}

// ---------------------------------------------------------------------------
// readJsonSafe – read & parse with fallback, never throws
// ---------------------------------------------------------------------------
export async function readJsonSafe(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return typeof fallback === 'function' ? fallback() : fallback;
  }
}

// ---------------------------------------------------------------------------
// withFileLock – simple advisory lock via lockfile (non-blocking, stale aware)
// ---------------------------------------------------------------------------
const LOCK_STALE_MS = 30_000; // consider lock stale after 30 s

async function acquireLock(lockPath, maxWaitMs = 10_000) {
  const start = Date.now();
  const id = randomUUID();
  while (true) {
    try {
      // O_EXCL guarantees atomicity on POSIX
      const fd = await fs.open(lockPath, 'wx');
      await fd.writeFile(JSON.stringify({ pid: process.pid, id, ts: Date.now() }));
      await fd.close();
      return id;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // Check staleness
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          await fs.unlink(lockPath).catch(() => {});
          continue; // retry immediately after removing stale lock
        }
      } catch { /* lock disappeared, retry */ continue; }
      if (Date.now() - start > maxWaitMs) {
        throw new Error(`Lock timeout: could not acquire ${lockPath} within ${maxWaitMs}ms`);
      }
      await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
    }
  }
}

async function releaseLock(lockPath, id) {
  try {
    const raw = await fs.readFile(lockPath, 'utf8');
    const meta = JSON.parse(raw);
    if (meta.id === id) await fs.unlink(lockPath);
  } catch {
    // already released or deleted, ignore
  }
}

/**
 * Execute `fn` while holding an advisory lock on `filePath`.
 * Example:
 *   await withFileLock(backlogPath, async () => {
 *     const data = await readJsonSafe(backlogPath, { ideas: [] });
 *     data.ideas.push(newIdea);
 *     await writeJsonAtomic(backlogPath, data);
 *   });
 */
export async function withFileLock(filePath, fn, { maxWaitMs = 10_000 } = {}) {
  const lockPath = filePath + '.lock';
  const id = await acquireLock(lockPath, maxWaitMs);
  try {
    return await fn();
  } finally {
    await releaseLock(lockPath, id);
  }
}
