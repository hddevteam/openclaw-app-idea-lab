import path from 'node:path';
import { readJsonSafe, writeJsonAtomic, withFileLock } from '../../../packages/shared/atomic_fs.mjs';
import { normalizeIdeaList } from '../../../packages/shared/json_contract.mjs';

export async function handleIdeaStatusRestore(req, res, { labRuntime }){
  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id');
  if(!id) throw new Error('id required');

  const p = path.join(labRuntime, 'data', 'idea_backlog.json');
  await withFileLock(p, async () => {
    const cur = normalizeIdeaList(await readJsonSafe(p, { updatedAt: null, ideas: [] }));
    const next = cur.ideas.map(x => {
      if (String(x.id) === String(id)) {
        return { ...x, status: 'backlog' };
      }
      return x;
    });
    const out = { updatedAt: new Date().toISOString(), ideas: next };
    await writeJsonAtomic(p, out);
  });

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok:true }));
}
