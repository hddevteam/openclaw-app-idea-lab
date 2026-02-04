import fs from 'node:fs/promises';
import path from 'node:path';

export async function listOutputsAsManifest({ labOutputs }){
  const dirents = await fs.readdir(labOutputs, { withFileTypes:true });
  const dirs = dirents.filter(d=>d.isDirectory()).map(d=>d.name);
  const items = dirs.filter(n => /^\d{4}-\d{2}-\d{2}/.test(n));
  items.sort((a,b)=> b.localeCompare(a));

  const entries = [];
  for(const name of items){
    const base = path.join(labOutputs, name);
    // Only include if building finished (check dist/index.html)
    // or if it's a legacy folder that has index.html at root
    const hasDist = await fs.access(path.join(base, 'dist/index.html')).then(()=>true).catch(()=>false);
    const hasRoot = await fs.access(path.join(base, 'index.html')).then(()=>true).catch(()=>false);
    
    if(!hasDist && !hasRoot) continue;

    // Use clean URLs. The server's logic in serve.mjs will handle the dist/ fallback automatically.
    const indexPath = `/${name}/index.html`;

    const readme = path.join(base, 'README.md');
    let title = name;
    let desc = '';
    let scenario = '';
    let workflow = '';
    try{
      const raw = await fs.readFile(readme, 'utf8');
      const lines = raw.split(/\r?\n/);
      const h = lines.find(l => l.startsWith('# '));
      if(h) title = h.replace(/^#\s+/,'').trim() || title;
      const p = lines.find(l => l.trim() && !l.startsWith('#'));
      if(p) desc = p.trim().slice(0, 200);

      // Extract Scenario
      const scenarioMatch = raw.match(/## (?:Scenario|Use Case（使用场景）|Use Case|Project Overview|项目概览)\s*([\s\S]*?)(?=\n##|$)/i);
      if(scenarioMatch) scenario = scenarioMatch[1].trim();

      // Extract Workflow
      const workflowMatch = raw.match(/## (?:How to use|Workflow|如何使用|操作说明|Core Interactions|核心交互|Sample Workflow)\s*([\s\S]*?)(?=\n##|$)/i);
      if(workflowMatch) workflow = workflowMatch[1].trim();
    }catch{}
    entries.push({ date: name, id: name, title, desc, scenario, workflow, indexPath });
  }

  return { updatedAt: new Date().toISOString(), entries };
}

export async function deleteOutput({ labOutputs, id }){
  if(!/^\d{4}-\d{2}-\d{2}/.test(id)) throw new Error('invalid id');
  const target = path.join(labOutputs, id);
  // safety: ensure inside outputs
  const rel = path.relative(labOutputs, target);
  if(rel.startsWith('..')) throw new Error('path escape');

  await fs.rm(target, { recursive:true, force:true });

  // Update manifest cache if exists to prevent "ghost" entries upon refresh
  try {
    const manifestPath = path.join(path.dirname(labOutputs), 'runtime', 'data', 'manifest.json');
    const raw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);
    if (manifest && Array.isArray(manifest.entries)) {
      const nextEntries = manifest.entries.filter(e => e.date !== id && e.id !== id);
      if (nextEntries.length !== manifest.entries.length) {
        manifest.entries = nextEntries;
        manifest.updatedAt = new Date().toISOString();
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      }
    }
  } catch (e) {
    // ignore manifest update errors (might not exist yet)
    console.error('Manifest cache update failed:', e.message);
  }

  return { ok:true };
}
