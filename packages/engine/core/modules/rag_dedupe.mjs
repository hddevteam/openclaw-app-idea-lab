import fs from 'node:fs/promises';

// Minimal in-repo dedupe helper.
// Loads runtime/data/rag_projects_index.json produced by dailyapphub (or other tooling)
// and computes similarity using token Jaccard as a fallback.

function tokenize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export async function isTooSimilar({ query, indexPath, threshold = 0.6, k = 5 }) {
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const idx = JSON.parse(raw);
    const items = idx?.items || idx?.projects || idx || [];
    const qTok = tokenize(query);
    const scored = [];
    for (const it of items) {
      const text = [it.title, it.desc, it.description, it.summary].filter(Boolean).join(' ');
      const score = jaccard(qTok, tokenize(text));
      scored.push({ score, it });
    }
    scored.sort((a,b)=>b.score-a.score);
    const top = scored.slice(0, k);
    return {
      tooSimilar: top[0]?.score >= threshold,
      best: top[0] || null,
      top,
      method: 'jaccard-fallback'
    };
  } catch {
    return { tooSimilar: false, best: null, top: [], method: 'no-index' };
  }
}
