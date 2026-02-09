/**
 * API: POST /api/idea/research/targeted
 *
 * Accepts { topic, creative?, count?, searchLangs? } and spawns
 * the targeted research runner as a child process.
 *
 * Returns SSE stream with progress events, then closes with final result.
 * Fallback: if Accept header is not text/event-stream, returns JSON after completion.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

// In-flight job tracking (only one targeted research at a time)
let activeJob = null;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

/**
 * POST /api/idea/research/targeted
 * Body: { topic: string, creative?: number, count?: number }
 */
export async function handleTargetedResearch(req, res, { labRoot }) {
  const body = await readBody(req);
  const { topic, creative, count } = body;

  if (!topic || typeof topic !== 'string' || topic.trim().length < 2) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'topic is required (min 2 chars)' }));
    return;
  }

  if (activeJob) {
    res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'A targeted research is already running' }));
    return;
  }

  const wantSSE = (req.headers.accept || '').includes('text/event-stream');

  if (wantSSE) {
    await handleSSE(res, { labRoot, topic, creative, count });
  } else {
    await handleJSON(res, { labRoot, topic, creative, count });
  }
}

/**
 * GET /api/idea/research/targeted/status
 * Returns current targeted research status
 */
export function handleTargetedResearchStatus(_req, res) {
  if (!activeJob) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'idle' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    status: 'running',
    topic: activeJob.topic,
    startedAt: activeJob.startedAt,
    lastEvent: activeJob.lastEvent,
  }));
}

/**
 * GET /api/campaigns
 * Returns campaign list
 */
export async function handleCampaigns(_req, res, { labRuntime }) {
  try {
    const p = path.join(labRuntime, 'data', 'campaigns.json');
    const raw = await fs.readFile(p, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(raw);
  } catch (_e) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ updatedAt: null, campaigns: [] }));
  }
}

// ── SSE mode ──────────────────────────────────────────────────

async function handleSSE(res, { labRoot, topic, creative, count }) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const args = buildArgs({ labRoot, topic, creative, count });
  const child = spawnRunner(labRoot, args);

  activeJob = { topic, startedAt: new Date().toISOString(), lastEvent: 'started', child };
  send('started', { topic });

  child.stdout.on('data', (buf) => {
    const lines = buf.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      const evt = parseLine(line);
      if (evt) {
        activeJob.lastEvent = evt.event;
        send(evt.event, evt.data);
      }
    }
  });

  child.stderr.on('data', (buf) => {
    const text = buf.toString().trim();
    if (text) send('log', { text });
  });

  child.on('close', async (code) => {
    activeJob = null;
    if (code === 0) {
      // Read the generated results for the client
      const result = await readLatestCampaignResult(labRoot);
      send('complete', { ok: true, ...result });
    } else {
      send('error', { ok: false, code, message: 'Targeted research failed' });
    }
    res.end();
  });

  child.on('error', (err) => {
    activeJob = null;
    send('error', { ok: false, message: err.message });
    res.end();
  });

  // Client disconnected
  req_onClose(res, () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      activeJob = null;
    }
  });
}

function req_onClose(res, cb) {
  // Node http.ServerResponse emits 'close' when the underlying connection is destroyed
  res.on('close', () => {
    cb();
  });
}

// ── JSON mode (non-SSE fallback) ──────────────────────────────

async function handleJSON(res, { labRoot, topic, creative, count }) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });

  const args = buildArgs({ labRoot, topic, creative, count });
  const child = spawnRunner(labRoot, args);

  activeJob = { topic, startedAt: new Date().toISOString(), lastEvent: 'started', child };

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', d => (stdout += d.toString()));
  child.stderr.on('data', d => (stderr += d.toString()));

  const timeout = setTimeout(() => {
    child.kill('SIGKILL');
    activeJob = null;
    res.end(JSON.stringify({ ok: false, error: 'Targeted research timed out (10min)' }));
  }, 600_000);

  child.on('close', async (code) => {
    clearTimeout(timeout);
    activeJob = null;
    if (code === 0) {
      const result = await readLatestCampaignResult(labRoot);
      res.end(JSON.stringify({ ok: true, ...result, stdout }));
    } else {
      res.end(JSON.stringify({ ok: false, code, stderr, stdout }));
    }
  });

  child.on('error', (err) => {
    clearTimeout(timeout);
    activeJob = null;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  });
}

// ── Helpers ───────────────────────────────────────────────────

function buildArgs({ labRoot, topic, creative, count }) {
  const script = path.join(labRoot, 'core', 'modules', 'targeted_research', 'runner.mjs');
  const args = [script, '--topic', topic];
  if (creative != null) args.push('--creative', String(creative));
  if (count != null) args.push('--count', String(count));
  return args;
}

function spawnRunner(labRoot, args) {
  return spawn('node', args, {
    cwd: labRoot,
    env: { ...process.env, DAILY_APP_LAB_ROOT: labRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Parse console output lines into structured events.
 * Runner prints lines like: [Targeted:Plan] Campaign: camp_xxx, 6 queries
 */
function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // [Targeted:Plan] ...
  if (trimmed.startsWith('[Targeted:Plan]')) {
    return { event: 'plan', data: { message: trimmed } };
  }
  // [Research] ...
  if (trimmed.startsWith('[Research]')) {
    return { event: 'research', data: { message: trimmed } };
  }
  // [Search] ...
  if (trimmed.startsWith('[Search]')) {
    return { event: 'search', data: { message: trimmed } };
  }
  // [Fetcher] ...
  if (trimmed.startsWith('[Fetcher]')) {
    return { event: 'fetch', data: { message: trimmed } };
  }
  // [Targeted:Ideate] ...
  if (trimmed.startsWith('[Targeted:Ideate]')) {
    return { event: 'ideate', data: { message: trimmed } };
  }
  // [Critique] ...
  if (trimmed.startsWith('[Critique]')) {
    return { event: 'critique', data: { message: trimmed } };
  }
  // [Select] ...
  if (trimmed.startsWith('[Select]')) {
    return { event: 'select', data: { message: trimmed } };
  }
  // [Targeted:Persist] ...
  if (trimmed.startsWith('[Targeted:Persist]')) {
    return { event: 'persist', data: { message: trimmed } };
  }
  // [Pipeline] ...
  if (trimmed.startsWith('[Pipeline]')) {
    return { event: 'pipeline', data: { message: trimmed } };
  }
  // [Config] ...
  if (trimmed.startsWith('[Config]')) {
    return { event: 'config', data: { message: trimmed } };
  }
  // ✓ final
  if (trimmed.startsWith('✓')) {
    return { event: 'done', data: { message: trimmed } };
  }

  return { event: 'log', data: { message: trimmed } };
}

/**
 * After successful run, read the latest campaign + its ideas.
 */
async function readLatestCampaignResult(labRoot) {
  try {
    const dataDir = path.join(labRoot, 'runtime', 'data');
    const campRaw = await fs.readFile(path.join(dataDir, 'campaigns.json'), 'utf8');
    const campaigns = JSON.parse(campRaw);
    const latest = campaigns.campaigns?.[campaigns.campaigns.length - 1];

    if (!latest) return { campaign: null, ideas: [] };

    const backlogRaw = await fs.readFile(path.join(dataDir, 'idea_backlog.json'), 'utf8');
    const backlog = JSON.parse(backlogRaw);
    const ideas = (backlog.ideas || []).filter(i => i.campaignId === latest.campaignId);

    return { campaign: latest, ideas };
  } catch (_e) {
    return { campaign: null, ideas: [] };
  }
}
