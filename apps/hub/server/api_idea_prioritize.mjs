import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

// Global state to track the running generation process
let activeGenerationProcess = null;

export function getActiveGenerationProcess() {
  return activeGenerationProcess;
}

async function readJson(p, fallback){
  try{
    return JSON.parse(await fs.readFile(p,'utf8'));
  }catch{
    return fallback;
  }
}

export async function handleIdeaPrioritizeAndExecute(req, res, { labRuntime, labRoot }){
  let body='';
  req.on('data', c => body += c);
  await new Promise(r => req.on('end', r));
  const input = JSON.parse(body || '{}');
  const ideaId = input.id;
  if(!ideaId) throw new Error('ideaId required');

  // 1. Mark as implement-now in backlog.json
  const backlogPath = path.join(labRuntime, 'data', 'idea_backlog.json');
  const backlog = await readJson(backlogPath, { ideas: [] });
  let found = false;
  const nextIdeas = backlog.ideas.map(idea => {
    if (String(idea.id) === String(ideaId)) {
      found = true;
      return { ...idea, status: 'implement-now', prioritizedAt: new Date().toISOString() };
    }
    // Optional: reset other implement-now items to avoid confusion
    if (idea.status === 'implement-now') return { ...idea, status: 'new' };
    return idea;
  });

  if (!found) throw new Error(`Idea ${ideaId} not found in backlog`);
  await fs.writeFile(backlogPath, JSON.stringify({ ...backlog, ideas: nextIdeas, updatedAt: new Date().toISOString() }, null, 2));

  // 2. Spawn run_idle_job.sh --force in background
  const scriptPath = path.join(labRoot, 'core', 'scripts', 'run_idle_job.sh');
  console.log(`[Prioritize] Spawning forced execution: ${scriptPath} --force`);
  
  // Abort previous if exists
  if (activeGenerationProcess) {
    try { process.kill(-activeGenerationProcess.pid, 'SIGTERM'); } catch (e) {}
  }

  // Detach and ignore output to not block HTTP response
  const child = spawn(scriptPath, ['--force'], {
    cwd: labRoot,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH}` }
  });

  activeGenerationProcess = child;
  child.on('exit', () => {
    if (activeGenerationProcess === child) activeGenerationProcess = null;
  });

  child.unref();

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, message: 'Prioritized and execution started' }));
}
