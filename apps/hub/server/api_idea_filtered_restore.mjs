import path from 'node:path';
import fs from 'node:fs/promises';

async function readJson(p, fallback){
  try{ return JSON.parse(await fs.readFile(p,'utf8')); }catch{ return fallback; }
}

export async function handleIdeaFilteredRestore(req, res, { labRuntime }){
  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id');
  if(!id) throw new Error('id required');

  const filteredPath = path.join(labRuntime, 'data', 'idea_filtered.json');
  const backlogPath = path.join(labRuntime, 'data', 'idea_backlog.json');

  const filteredData = await readJson(filteredPath, { ideas: [] });
  const backlogData = await readJson(backlogPath, { ideas: [] });

  const ideaToRestore = filteredData.ideas.find(x => String(x.id) === String(id));
  
  if (ideaToRestore) {
    // 1. Remove from filtered
    const nextFiltered = filteredData.ideas.filter(x => String(x.id) !== String(id));
    await fs.writeFile(filteredPath, JSON.stringify({ ...filteredData, updatedAt: new Date().toISOString(), ideas: nextFiltered }, null, 2));

    // 2. Ensure it's in backlog (and reset status if needed)
    const existsInBacklog = backlogData.ideas.some(x => String(x.id) === String(id));
    if (!existsInBacklog) {
      backlogData.ideas.push({ ...ideaToRestore, status: 'backlog' });
      await fs.writeFile(backlogPath, JSON.stringify({ ...backlogData, updatedAt: new Date().toISOString(), ideas: backlogData.ideas }, null, 2));
    } else {
      // If it exists, just ensure status is 'backlog'
      const nextBacklog = backlogData.ideas.map(x => String(x.id) === String(id) ? { ...x, status: 'backlog' } : x);
      await fs.writeFile(backlogPath, JSON.stringify({ ...backlogData, updatedAt: new Date().toISOString(), ideas: nextBacklog }, null, 2));
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok:true }));
}
