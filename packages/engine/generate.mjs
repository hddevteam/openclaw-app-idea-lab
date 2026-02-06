import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { appendManifest } from './core/modules/manifest_update.mjs';
import { markImplemented, unpickIdea } from './core/modules/idea_mark_implemented.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.DAILY_APP_LAB_ROOT || HERE);
const RUNTIME = path.join(ROOT, 'runtime');
const DATA = path.join(RUNTIME, 'data');
const OUTPUTS = path.join(ROOT, 'outputs');
const LOGS = path.join(RUNTIME, 'logs');

// --- Azure Config Logic ---
async function getAzureConfig() {
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) {
    return {
      baseUrl: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      version: process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview'
    };
  }

  try {
    const configPath = process.env.CLAWDBOT_CONFIG || path.join(os.homedir(), '.openclaw', 'clawdbot.json');
    const raw = await fs.readFile(configPath, 'utf8');
    const j = JSON.parse(raw);
    const az = j?.models?.providers?.['azure-openai'];
    if (!az) return null;
    return {
      baseUrl: az.baseUrl,
      apiKey: az.apiKey,
      version: '2024-08-01-preview' // default version
    };
  } catch (_e) {
    return null;
  }
}
// --------------------------

const MODEL = process.env.AZURE_OPENAI_MODEL || 'gpt-5.2';
const AIDER = process.env.DAILY_APP_LAB_AIDER_BIN || 'aider';
const LANG = process.env.DAILY_APP_LAB_LANG || 'zh-CN';

const nowTag = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-extra-${hh}${min}`;
};

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

function run(cmd, args, { cwd, logFile, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { 
      cwd, 
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env }
    });
    const append = (buf) => { if (logFile) fs.appendFile(logFile, buf).catch(()=>{}); };
    let out = '';
    let err = '';
    child.stdout.on('data', (b) => { out += b.toString('utf8'); append(b); });
    child.stderr.on('data', (b) => { err += b.toString('utf8'); append(b); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ out, err, code });
      else reject(Object.assign(new Error(`${cmd} ${args.join(' ')} exited ${code}`), { code, out, err }));
    });
  });
}

async function readJson(p, fallback) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; }
}

async function ensureViteProject(dir, logFile) {
  const pkg = path.join(dir, 'package.json');
  if (!(await exists(pkg))) {
    // Scaffold a minimal Vite project only when nothing exists.
    // (We intentionally do NOT use this as a fallback for Aider failures.)
    await run('npm', ['create', 'vite@latest', '.', '--', '--template', 'react'], { cwd: dir, logFile });
  }
  await run('npm', ['install'], { cwd: dir, logFile });
}

async function writeBuildStatus(status, details = {}) {
  try {
    const p = path.join(DATA, 'build_status.json');
    await fs.writeFile(p, JSON.stringify({
      status,
      ...details,
      updatedAt: new Date().toISOString()
    }, null, 2));
  } catch (_e) {
    // Silently ignore status update errors
  }
}

async function main() {
  await fs.mkdir(DATA, { recursive: true });
  await fs.mkdir(OUTPUTS, { recursive: true });
  await fs.mkdir(LOGS, { recursive: true });

  const outId = nowTag();
  const outDir = path.join(OUTPUTS, outId);
  await fs.mkdir(outDir, { recursive: true });

  const logFile = path.join(LOGS, `${outId}-generate.log`);

  const queuePath = path.join(DATA, 'idea_queue.json');
  const q = await readJson(queuePath, {});
  const idea = q?.idea || null;

  if (idea) {
    await fs.appendFile(logFile, `Auto-loaded idea from queue: ${idea.title || idea.id}\n`).catch(()=>{});
  }

  const title = idea?.title || idea?.name || 'Extra interactive app project';
  const scenario = idea?.scenario || idea?.hudScenario || idea?.desc || idea?.description || '';
  const ideaId = idea?.id;

  // Stability logic: Fixed tech stack to reduce build failures and ensure reliable output
  const chosenStyling = 'Tailwind CSS (standard v3 via PostCSS)';
  const chosenUI = 'React 18';

  try {
    await writeBuildStatus('running', { title, outId, progress: 10, stage: 'coding' });

    const specPath = path.join(ROOT, 'DAILY_SPEC.md');
    const msg = [
    `Act as an expert app developer. Your task is to build a high-quality, interactive React app for the following project:`,
    `- Project Name: ${title}`,
    `- Scenario: ${scenario}`,
    `\nMandatory Technical Standards:`,
    `- Read and strictly follow ALL standards in DAILY_SPEC.md.`,
    `- Tech stack: React 18 + Tailwind CSS (v3).`,
    `- CRITICAL STYLE: You MUST provide 'tailwind.config.js' and 'postcss.config.js'. Use professional, elegant styling (Glassmorphism, gradients, consistent spacing).`,
    `- CRITICAL INTERACTION: Follow "Drag & Drop Safety" in DAILY_SPEC.md. Use 'framer-motion' for physics and animations.`,
    `- Language: Use ${LANG} for ALL UI and content.`,
    `- No external APIs. Use a "SimulationEngine" for all data.`,
    `- Ensure 'npm run build -- --base ./' works.`,
    `\nOutput instructions:`,
    `- Just output the code. No explanations.`,
    `- Include all necessary files (~5-7 files maximum).`,
    `- Make sure the app is immediately usable with demo data.`,
    `CRITICAL: Do NOT include HUGE external assets, but 50-100 lines of mock JSON/Simulation logic is REQUIRED.`,
    `CRITICAL: If you need more space, prefer minimal working features over completeness.`,
  ].filter(Boolean).join('\n');

  // Load Azure config
  const az = await getAzureConfig();
  const aiderEnv = {};
  if (az) {
    let cleanEndpoint = az.baseUrl;
    if (cleanEndpoint.endsWith('/openai/v1/')) cleanEndpoint = cleanEndpoint.replace('/openai/v1/', '');
    if (cleanEndpoint.endsWith('/openai/v1')) cleanEndpoint = cleanEndpoint.replace('/openai/v1', '');

    aiderEnv.OPENAI_API_BASE = az.baseUrl; // Keep for openai-compatible calls
    aiderEnv.OPENAI_API_KEY = az.apiKey;
    aiderEnv.OPENAI_API_TYPE = 'azure'; // Explicitly set for aider/litellm
    
    aiderEnv.AZURE_API_BASE = cleanEndpoint;
    aiderEnv.AZURE_API_KEY = az.apiKey;
    aiderEnv.AZURE_API_VERSION = az.version;
    aiderEnv.AZURE_OPENAI_API_KEY = az.apiKey;
    aiderEnv.AZURE_OPENAI_ENDPOINT = cleanEndpoint;
    aiderEnv.AZURE_OPENAI_API_VERSION = az.version;
    
    await fs.appendFile(logFile, `Using Azure AI config for Aider. Endpoint: ${cleanEndpoint}\n`).catch(()=>{});
  }

  const modelArg = MODEL.includes('/') ? MODEL : `azure/${MODEL}`;

  // Run aider
  try {
    await run(AIDER, [
      '--model', modelArg,
      '--no-git',
      '--read', specPath, // Ensure SPEC is visible to Aider!
      '--yes-always',
      '--no-auto-commits',
      '--no-suggest-shell-commands',
      '--no-attribute-author',
      '--no-attribute-committer',
      '--message', msg,
    ], { cwd: outDir, logFile, env: aiderEnv });
  } catch (e) {
    // Detect common "bad output" causes (token limit, content filter, missing key)
    const msg = String(e?.message || e);
    await fs.appendFile(logFile, `\nAIDER_FAILED: ${msg}\n`).catch(()=>{});

    // If Aider failed, do NOT silently scaffold a template (would create "empty project")
    // Instead, fail this generation so backlog can move on.
    throw e;
  }

  await writeBuildStatus('running', { title, outId, progress: 40, stage: 'installing' });
  // Only scaffold if there is no package.json (rare). This avoids masking Aider failures.
  await ensureViteProject(outDir, logFile);

  // Build inside outDir
  await writeBuildStatus('running', { title, outId, progress: 70, stage: 'building' });
  await run('npm', ['run', 'build', '--', '--base', './'], { cwd: outDir, logFile });

  await writeBuildStatus('running', { title, outId, progress: 90, stage: 'finalizing' });
  const rel = `/${outId}/dist/index.html`;
  await appendManifest({ id: outId, title, relPath: rel });
  await markImplemented({ ideaId, title, relPath: rel });

  await writeBuildStatus('idle', { lastProject: title, lastId: outId });
  console.log(`Extra project done: ${outDir}`);
} catch (e) {
  await fs.appendFile(logFile, `\nGENERATION_FAILED: ${e?.message || e}\n`).catch(()=>{});
  if (ideaId) {
    await unpickIdea(ideaId);
    await fs.appendFile(logFile, `Reset backlog status for idea: ${ideaId}\n`).catch(()=>{});
  }
  // Delete the failed output directory
  try {
    if (await exists(outDir)) {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  } catch (_rmErr) {
    // Ignore cleanup errors
  }
  throw e;
}
}

main().catch(async (e) => {
  await writeBuildStatus('error', { error: e?.message || String(e) });
  console.error(e);
  process.exit(1);
});

