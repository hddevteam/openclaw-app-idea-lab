import { getActiveGenerationProcess } from './api_idea_prioritize.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function handleIdeaAbort(req, res, { labRuntime }) {
  const child = getActiveGenerationProcess();
  
  if (child) {
    try {
      console.log(`[Abort] Killing process ${child.pid}`);
      // Use negative PID to kill the process group if it was spawned with detached: true
      process.kill(-child.pid, 'SIGTERM');
    } catch (e) {
      console.error(`[Abort] Failed to kill process ${child.pid}:`, e.message);
      // Even if kill fails (process already dead), we proceed to reset the status
    }
  }

  try {
    // ALWAYS update build_status.json to idle
    const p = path.join(labRuntime, 'data', 'build_status.json');
    await fs.writeFile(p, JSON.stringify({
      status: 'idle',
      stage: 'aborted',
      updatedAt: new Date().toISOString()
    }, null, 2));

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, message: 'Aborted successfully' }));
  } catch (e) {
    console.error(`[Abort] Failed to update build_status.json:`, e.message);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}
