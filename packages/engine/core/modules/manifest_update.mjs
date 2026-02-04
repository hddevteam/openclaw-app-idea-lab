import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.DAILY_APP_LAB_ROOT || path.resolve(HERE, '..', '..'));
const DATA = path.join(ROOT, 'runtime', 'data');
const MANIFEST = path.join(DATA, 'manifest.json');

async function readJson(p, fallback) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; }
}

export async function appendManifest({ id, title, relPath }) {
  const m = await readJson(MANIFEST, { items: [] });
  const arr = Array.isArray(m.items) ? m.items : (Array.isArray(m.projects) ? m.projects : []);
  arr.unshift({ id, title, path: relPath, ts: Date.now() });
  if (Array.isArray(m.items)) m.items = arr; else m.projects = arr;
  await fs.mkdir(path.dirname(MANIFEST), { recursive: true });
  await fs.writeFile(MANIFEST, JSON.stringify(m, null, 2));
}
