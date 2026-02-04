import { buildProjectIndex, queryProjectIndex } from './rag_index.mjs';

export async function handleRagReindex(req, res, { labRuntime }){
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }
  const r = await buildProjectIndex({ labRuntime });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, ...r }));
}

export async function handleRagQuery(req, res, { url, labRuntime }){
  const q = url.searchParams.get('q') || '';
  const k = Number(url.searchParams.get('k') || 5);
  const out = await queryProjectIndex({ labRuntime, queryText: q, k });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, ...out }));
}
