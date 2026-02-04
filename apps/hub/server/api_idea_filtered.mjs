import path from 'node:path';
import fs from 'node:fs/promises';

async function readJson(p, fallback){
  try{ return JSON.parse(await fs.readFile(p,'utf8')); }catch{ return fallback; }
}

export async function handleIdeaFiltered(req, res, { labRuntime }){
  const p = path.join(labRuntime, 'data', 'idea_filtered.json');
  const j = await readJson(p, { updatedAt: null, ideas: [] });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(j));
}

export async function handleIdeaFilteredDelete(req, res, { labRuntime }){
  const url = new URL(req.url, 'http://localhost');
  const idStr = url.searchParams.get('id');
  const idsStr = url.searchParams.get('ids');
  
  if(!idStr && !idsStr) throw new Error('id or ids required');
  
  const idsToDelete = idsStr ? idsStr.split(',') : [idStr];

  const p = path.join(labRuntime, 'data', 'idea_filtered.json');
  const cur = await readJson(p, { updatedAt: null, ideas: [] });
  const ideas = Array.isArray(cur.ideas) ? cur.ideas : [];
  
  const next = ideas.filter(x => !idsToDelete.includes(String(x.id)));
  const out = { updatedAt: new Date().toISOString(), ideas: next };
  await fs.writeFile(p, JSON.stringify(out, null, 2));

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok:true, count: ideas.length - next.length }));
}
