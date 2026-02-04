import path from 'node:path';
import fs from 'node:fs/promises';

async function readJson(p, fallback){
  try{
    return JSON.parse(await fs.readFile(p,'utf8'));
  }catch{
    return fallback;
  }
}

export async function handleIdeaBacklog(req, res, { labRuntime }){
  const p = path.join(labRuntime, 'data', 'idea_backlog.json');
  const j = await readJson(p, { updatedAt: null, ideas: [] });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(j));
}

export async function handleIdeaBacklogAdd(req, res, { labRuntime }){
  let body='';
  req.on('data', c => body += c);
  await new Promise(r => req.on('end', r));
  const input = JSON.parse(body || '{}');
  const idea = input.idea;
  if(!idea || typeof idea !== 'object') throw new Error('missing idea');
  if(!idea.id) throw new Error('idea.id required');

  const p = path.join(labRuntime, 'data', 'idea_backlog.json');
  const cur = await readJson(p, { updatedAt: null, ideas: [] });
  const ideas = Array.isArray(cur.ideas) ? cur.ideas : [];

  const exists = ideas.some(x => String(x.id) === String(idea.id));
  const next = exists ? ideas.map(x => String(x.id)===String(idea.id) ? { ...x, ...idea, updatedAt: new Date().toISOString() } : x)
                      : [{ ...idea, createdAt: new Date().toISOString(), status: 'new' }, ...ideas];

  const out = { updatedAt: new Date().toISOString(), ideas: next };
  await fs.writeFile(p, JSON.stringify(out, null, 2));

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok:true }));
}
