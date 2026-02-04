import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.DAILY_WEB_LAB_ROOT || path.resolve(HERE, '..', '..'));
const DATA = path.join(ROOT, 'runtime', 'data');
const BACKLOG = path.join(DATA, 'idea_backlog.json');
const QUEUE = path.join(DATA, 'idea_queue.json');

async function readJson(p, fallback) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; }
}

export async function markImplemented({ ideaId, title, relPath }) {
  const j = await readJson(BACKLOG, null);
  if (j) {
    const items = j.ideas || j.items || j.backlog || [];
    const it = items.find(x => (ideaId && (x.id===ideaId)) || (title && (x.title===title)));
    if (it) {
      it.status = 'implemented';
      it.implementedAt = Date.now();
      it.link = relPath;
      await fs.writeFile(BACKLOG, JSON.stringify(j, null, 2));
    }
  }
  // clear queue
  await fs.writeFile(QUEUE, JSON.stringify({}), 'utf8').catch(()=>{});
}

export async function unpickIdea(ideaId) {
  const j = await readJson(BACKLOG, null);
  if (j && ideaId) {
    const items = j.ideas || j.items || j.backlog || [];
    const it = items.find(x => x.id === ideaId);
    if (it) {
      it.status = 'new'; // reset status
      delete it.pickedAt;
      await fs.writeFile(BACKLOG, JSON.stringify(j, null, 2));
    }
  }
  // clear queue so it doesn't get stuck
  await fs.writeFile(QUEUE, JSON.stringify({}), 'utf8').catch(()=>{});
}
