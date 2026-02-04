import path from 'node:path';
import fs from 'node:fs/promises';

async function readJson(p, fallback){
  try{ return JSON.parse(await fs.readFile(p,'utf8')); }catch{ return fallback; }
}

export async function handleIdeaStatusRestore(req, res, { labRuntime }){
  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id');
  if(!id) throw new Error('id required');

  const p = path.join(labRuntime, 'data', 'idea_backlog.json');
  const cur = await readJson(p, { updatedAt: null, ideas: [] });
  const ideas = Array.isArray(cur.ideas) ? cur.ideas : [];
  
  const next = ideas.map(x => {
    if (String(x.id) === String(id)) {
      return { ...x, status: 'backlog' }; // Remove 'implemented' status
    }
    return x;
  });

  const out = { updatedAt: new Date().toISOString(), ideas: next };
  await fs.writeFile(p, JSON.stringify(out, null, 2));

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok:true }));
}
