import path from 'node:path';
import { deleteOutput } from './manifest_dynamic.mjs';
import { readJsonSafe, writeJsonAtomic, withFileLock } from '../../../packages/shared/atomic_fs.mjs';
import { normalizeIdeaList } from '../../../packages/shared/json_contract.mjs';

export async function handleIdeaRestore(req, res, { labRuntime, labOutputs }){
  const url = new URL(req.url, `http://${req.headers.host}`);
  const id = url.searchParams.get('id'); // This is the folder name, e.g. 2026-02-03-extra-1234
  
  if(!id) throw new Error('id required');

  // 1. Find ideaId in backlog by searching for the link containing the id
  const backlogPath = path.join(labRuntime, 'data', 'idea_backlog.json');
  const queuePath = path.join(labRuntime, 'data', 'idea_queue.json');
  let ideaId = null;

  await withFileLock(backlogPath, async () => {
    const backlog = normalizeIdeaList(await readJsonSafe(backlogPath, { ideas: [] }));
    const idea = backlog.ideas.find(it => it.link && it.link.includes(id));
    ideaId = idea?.id;

    if (idea) {
      idea.status = 'new';
      delete idea.pickedAt;
      delete idea.implementedAt;
      delete idea.link;
      await writeJsonAtomic(backlogPath, backlog);
    }
  });

  // Clear the queue
  await writeJsonAtomic(queuePath, { updatedAt: new Date().toISOString(), idea: null }).catch(()=>{});

  // 3. Delete the output directory and manifest cache
  await deleteOutput({ labOutputs, id });

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, ideaId }));
}
