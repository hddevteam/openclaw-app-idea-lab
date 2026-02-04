import path from 'node:path';
import fs from 'node:fs/promises';
import { deleteOutput } from './manifest_dynamic.mjs';

async function readJson(p, fallback){
  try{
    return JSON.parse(await fs.readFile(p,'utf8'));
  }catch{
    return fallback;
  }
}

export async function handleIdeaRestore(req, res, { labRuntime, labOutputs, labRoot }){
  const url = new URL(req.url, `http://${req.headers.host}`);
  const id = url.searchParams.get('id'); // This is the folder name, e.g. 2026-02-03-extra-1234
  
  if(!id) throw new Error('id required');

  // 1. Find ideaId in backlog by searching for the link containing the id
  const backlogPath = path.join(labRuntime, 'data', 'idea_backlog.json');
  const backlog = await readJson(backlogPath, { ideas: [] });
  const ideas = backlog.ideas || [];
  
  const idea = ideas.find(it => it.link && it.link.includes(id));
  const ideaId = idea?.id;

  // 2. Unpick specifically if we found the idea
  if (ideaId) {
    // We need to import unpickIdea from the lab's core modules
    // Since we are in the hub, we might need a relative import or a absolute one
    // But better to just implement the logic here or expose it via a shared module if possible.
    // Given the current structure, we can just perform the update here.
    idea.status = 'new';
    delete idea.pickedAt;
    delete idea.implementedAt;
    delete idea.link;
    
    await fs.writeFile(backlogPath, JSON.stringify(backlog, null, 2));

    // Also clear the queue if it was this one (unlikely but safe)
    const queuePath = path.join(labRuntime, 'data', 'idea_queue.json');
    await fs.writeFile(queuePath, JSON.stringify({}), 'utf8').catch(()=>{});
  }

  // 3. Delete the output directory and manifest cache
  await deleteOutput({ labOutputs, id });

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, ideaId }));
}
