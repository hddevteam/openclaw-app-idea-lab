import path from 'node:path';
import { readJsonSafe, writeJsonAtomic, withFileLock } from '../../../packages/shared/atomic_fs.mjs';
import { normalizeIdeaList } from '../../../packages/shared/json_contract.mjs';

export async function handleIdeaFilteredRestore(req, res, { labRuntime }){
  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id');
  if(!id) throw new Error('id required');

  const filteredPath = path.join(labRuntime, 'data', 'idea_filtered.json');
  const backlogPath = path.join(labRuntime, 'data', 'idea_backlog.json');

  // Lock BOTH files in a consistent order to prevent cross-file race conditions
  await withFileLock(filteredPath, async () => {
    await withFileLock(backlogPath, async () => {
      const filteredData = normalizeIdeaList(await readJsonSafe(filteredPath, { ideas: [] }));
      const backlogData = normalizeIdeaList(await readJsonSafe(backlogPath, { ideas: [] }));

      const ideaToRestore = filteredData.ideas.find(x => String(x.id) === String(id));
      
      if (ideaToRestore) {
        // 1. Remove from filtered
        const nextFiltered = filteredData.ideas.filter(x => String(x.id) !== String(id));
        await writeJsonAtomic(filteredPath, { ...filteredData, updatedAt: new Date().toISOString(), ideas: nextFiltered });

        // 2. Ensure it's in backlog (and reset status if needed)
        const existsInBacklog = backlogData.ideas.some(x => String(x.id) === String(id));
        if (!existsInBacklog) {
          backlogData.ideas.push({ ...ideaToRestore, status: 'backlog' });
        } else {
          backlogData.ideas = backlogData.ideas.map(x => String(x.id) === String(id) ? { ...x, status: 'backlog' } : x);
        }
        await writeJsonAtomic(backlogPath, { ...backlogData, updatedAt: new Date().toISOString() });
      }
    });
  });

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok:true }));
}
