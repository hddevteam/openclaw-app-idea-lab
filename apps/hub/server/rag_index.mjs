import fs from 'node:fs/promises';
import path from 'node:path';

import { embed, cosine } from './similarity.mjs';

// Simple local RAG index maintained by labhub.
// Stores embeddings for project summaries so all clients share one retrieval source.

function ensureDir(p){
  return fs.mkdir(p, { recursive: true });
}

export function defaultIndexPaths({ labRuntime }){
  const dataDir = path.join(labRuntime, 'data');
  return {
    dataDir,
    indexPath: path.join(dataDir, 'rag_projects_index.json')
  };
}

export async function buildProjectIndex({ labRuntime, topN = 500 }){
  const { dataDir, indexPath } = defaultIndexPaths({ labRuntime });
  await ensureDir(dataDir);

  const manifestPath = path.join(dataDir, 'manifest.json');
  const manifestRaw = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];

  const items = [];
  for (const e of entries.slice(0, topN)) {
    const text = `${e.title || ''}\n${e.desc || ''}`.trim();
    if (!text) continue;
    const v = Array.from(embed(text));
    items.push({
      id: e.id || e.date,
      date: e.date,
      title: e.title,
      desc: e.desc,
      text,
      v
    });
  }

  const out = {
    updatedAt: new Date().toISOString(),
    dims: items[0]?.v?.length || 0,
    items
  };

  await fs.writeFile(indexPath, JSON.stringify(out, null, 2));
  return { indexPath, count: items.length };
}

export async function loadProjectIndex({ labRuntime }){
  const { indexPath } = defaultIndexPaths({ labRuntime });
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function queryProjectIndex({ labRuntime, queryText, k = 5 }){
  const index = await loadProjectIndex({ labRuntime });
  if (!index || !Array.isArray(index.items) || index.items.length === 0) {
    // Lazy build if missing
    await buildProjectIndex({ labRuntime });
  }
  const idx = await loadProjectIndex({ labRuntime });
  const items = Array.isArray(idx?.items) ? idx.items : [];

  const qv = embed(String(queryText || ''));
  const scored = items
    .map(it => ({
      id: it.id,
      date: it.date,
      title: it.title,
      desc: it.desc,
      score: cosine(qv, Float32Array.from(it.v))
    }))
    .sort((a,b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(50, Number(k) || 5)));

  return {
    updatedAt: idx?.updatedAt || null,
    k,
    results: scored.map(r => ({ ...r, score: Number(r.score.toFixed(3)) }))
  };
}
