import { spawn } from 'node:child_process';
import path from 'node:path';

export async function handleIdeaResearch(req, res, { labRoot }) {
  const scriptPath = path.join(labRoot, 'core', 'modules', 'planner_research.mjs');
  
  console.log(`[API] Starting Research: node ${scriptPath}`);
  
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  
  const child = spawn('node', [scriptPath], {
    cwd: labRoot,
    env: { ...process.env, DAILY_APP_LAB_ROOT: labRoot }
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    stdout += data.toString();
    console.log(`[Research Stdout]: ${data}`);
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
    console.error(`[Research Stderr]: ${data}`);
  });

  child.on('close', (code) => {
    console.log(`[Research] Child process exited with code ${code}`);
    if (code === 0) {
      res.end(JSON.stringify({ ok: true, message: 'Research completed successfully', stdout }));
    } else {
      res.end(JSON.stringify({ ok: false, message: 'Research failed', code, stderr }));
    }
  });

  child.on('error', (err) => {
    console.error(`[Research] Failed to start child process:`, err);
    res.end(JSON.stringify({ ok: false, message: 'Process error', error: err.message }));
  });
}
