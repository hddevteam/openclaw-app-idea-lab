
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { writeJsonAtomic, readJsonSafe, withFileLock } from '../../../shared/atomic_fs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.DAILY_APP_LAB_ROOT || path.resolve(HERE, '..', '..'));
const DATA = path.join(ROOT, 'runtime', 'data');
const BACKLOG = path.join(DATA, 'idea_backlog.json');
const QUEUE = path.join(DATA, 'idea_queue.json');

export async function markImplemented({ ideaId, title, relPath }) {
  await withFileLock(BACKLOG, async () => {
    const j = await readJsonSafe(BACKLOG, null);
    if (j) {
      const items = j.ideas || j.items || j.backlog || [];
      const it = items.find(x => (ideaId && (x.id===ideaId)) || (title && (x.title===title)));
      if (it) {
        it.status = 'implemented';
        it.implementedAt = Date.now();
        it.link = relPath;
        await writeJsonAtomic(BACKLOG, j);
      }
    }
  });
  // clear queue
  await writeJsonAtomic(QUEUE, { updatedAt: new Date().toISOString(), idea: null }).catch(()=>{});
}

export async function unpickIdea(ideaId) {
  await withFileLock(BACKLOG, async () => {
    const j = await readJsonSafe(BACKLOG, null);
    if (j && ideaId) {
      const items = j.ideas || j.items || j.backlog || [];
      const it = items.find(x => x.id === ideaId);
      if (it) {
        it.status = 'new'; // reset status
        delete it.pickedAt;
        await writeJsonAtomic(BACKLOG, j);
      }
    }
  });
  // clear queue so it doesn't get stuck
  await writeJsonAtomic(QUEUE, { updatedAt: new Date().toISOString(), idea: null }).catch(()=>{});
}
