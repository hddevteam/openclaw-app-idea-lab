import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { writeJsonAtomic, readJsonSafe, withFileLock } from '../../../shared/atomic_fs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.DAILY_APP_LAB_ROOT || path.resolve(HERE, '..', '..'));
const DATA = path.join(ROOT, 'runtime', 'data');
const MANIFEST = path.join(DATA, 'manifest.json');

export async function appendManifest({ id, title, relPath }) {
  await fs.mkdir(path.dirname(MANIFEST), { recursive: true });
  await withFileLock(MANIFEST, async () => {
    const m = await readJsonSafe(MANIFEST, { items: [] });
    const arr = Array.isArray(m.items) ? m.items : (Array.isArray(m.projects) ? m.projects : []);
    // Avoid duplicates
    if (!arr.some(x => x.id === id)) {
      arr.unshift({ id, title, path: relPath, ts: Date.now() });
    }
    if (Array.isArray(m.items)) m.items = arr; else m.projects = arr;
    m.updatedAt = new Date().toISOString();
    await writeJsonAtomic(MANIFEST, m);
  });
}
