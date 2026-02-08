import path from 'node:path';
import { readJsonSafe, writeJsonAtomic, withFileLock } from '../../../packages/shared/atomic_fs.mjs';
import { normalizeIdeaList } from '../../../packages/shared/json_contract.mjs';

export async function handleIdeaBacklogDelete(req, res, { labRuntime }){
  const url = new URL(req.url, 'http://localhost');
  const idStr = url.searchParams.get('id');
  const idsStr = url.searchParams.get('ids');
  
  if(!idStr && !idsStr) throw new Error('id or ids required');
  
  const idsToDelete = idsStr ? idsStr.split(',') : [idStr];

  const p = path.join(labRuntime, 'data', 'idea_backlog.json');
  let deletedCount = 0;

  await withFileLock(p, async () => {
    const cur = normalizeIdeaList(await readJsonSafe(p, { updatedAt: null, ideas: [] }));
    const ideas = cur.ideas;
    const next = ideas.filter(x => !idsToDelete.includes(String(x.id)));
    deletedCount = ideas.length - next.length;
    const out = { updatedAt: new Date().toISOString(), ideas: next };
    await writeJsonAtomic(p, out);
  });

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok:true, count: deletedCount }));
}
