import fs from 'node:fs/promises';
import path from 'node:path';

function asEntry(e){
  if(!e || typeof e !== 'object') return null;
  const date = typeof e.date === 'string' ? e.date : null;
  const id = typeof e.id === 'string' ? e.id : (date || null);
  if(!date && !id) return null;
  return {
    date: date || id,
    title: typeof e.title === 'string' ? e.title : id,
    desc: typeof e.desc === 'string' ? e.desc : '',
    id,
  };
}

export async function loadManifestSafe(manifestPath){
  const backupPath = manifestPath + '.bak';
  const fallback = { updatedAt: null, entries: [] };

  // 1) Try parse current
  try{
    const raw = await fs.readFile(manifestPath, 'utf8');
    const j = JSON.parse(raw);
    return { ok:true, json: normalizeManifest(j) };
  }catch(e){
    // continue to heal
  }

  // 2) Try backup
  try{
    const raw = await fs.readFile(backupPath, 'utf8');
    const j = JSON.parse(raw);
    const healed = normalizeManifest(j);
    await fs.writeFile(manifestPath, JSON.stringify(healed, null, 2));
    return { ok:true, json: healed, healed:true, source:'bak' };
  }catch{}

  // 3) Rebuild from outputs directory
  const labRoot = path.resolve(path.dirname(path.dirname(manifestPath))); // .../runtime/data -> .../runtime -> ...
  const outputsDir = path.join(labRoot, 'outputs');
  try{
    const entries = await rebuildFromOutputs(outputsDir);
    const healed = normalizeManifest({ updatedAt: new Date().toISOString(), entries });
    await fs.writeFile(manifestPath, JSON.stringify(healed, null, 2));
    return { ok:true, json: healed, healed:true, source:'rebuild' };
  }catch{}

  // 4) Last resort
  await fs.writeFile(manifestPath, JSON.stringify(fallback, null, 2));
  return { ok:true, json: fallback, healed:true, source:'empty' };
}

export function normalizeManifest(j){
  const entriesRaw = Array.isArray(j?.entries) ? j.entries : [];
  const map = new Map();
  for(const r of entriesRaw){
    const e = asEntry(r);
    if(!e) continue;
    const k = String(e.id || e.date);
    if(!map.has(k)) map.set(k, e);
  }
  return {
    updatedAt: typeof j?.updatedAt === 'string' ? j.updatedAt : new Date().toISOString(),
    entries: Array.from(map.values())
  };
}

async function rebuildFromOutputs(outputsDir){
  const dirents = await fs.readdir(outputsDir, { withFileTypes:true });
  const dirs = dirents.filter(d=>d.isDirectory()).map(d=>d.name);
  // Only include folders that look like dated outputs
  const keep = dirs.filter(n => /^\d{4}-\d{2}-\d{2}/.test(n));
  // Newest first
  keep.sort((a,b)=> b.localeCompare(a));

  const entries = [];
  for(const name of keep){
    const readme = path.join(outputsDir, name, 'README.md');
    let title = name;
    let desc = '';
    try{
      const raw = await fs.readFile(readme, 'utf8');
      const lines = raw.split(/\r?\n/);
      const h = lines.find(l => l.startsWith('# '));
      if(h) title = h.replace(/^#\s+/,'').trim() || title;
      const p = lines.find(l => l.trim() && !l.startsWith('#'));
      if(p) desc = p.trim().slice(0, 200);
    }catch{}
    entries.push({ date: name, id: name, title, desc });
  }
  return entries;
}
