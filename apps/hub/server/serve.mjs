import http from 'node:http';
import path from 'node:path';

import { HUB_ROOT, LAB_OUTPUTS, LAB_RUNTIME, LAB_ROOT, PASS, PORT, USER } from './config.mjs';
import { checkAuth, unauthorized } from './basic_auth.mjs';
import { safeJoin, serveFile } from './static.mjs';
import { handleManifest } from './api_manifest.mjs';
import { loadFeedback, saveFeedback } from './api_feedback.mjs';
import { handleIdeaGenerate } from './api_idea_generate.mjs';
import { handleIdeaBacklog, handleIdeaBacklogAdd } from './api_idea_backlog.mjs';
import { handleIdeaBacklogDelete } from './api_idea_backlog_delete.mjs';
import { handleIdeaResearch } from './api_idea_research.mjs';
import { handleIdeaPrioritizeAndExecute } from './api_idea_prioritize.mjs';
import { handleIdeaFiltered, handleIdeaFilteredDelete } from './api_idea_filtered.mjs';
import { handleIdeaFilteredRestore } from './api_idea_filtered_restore.mjs';
import { handleIdeaRestore } from './api_idea_restore.mjs';
import { handleIdeaStatusRestore } from './api_idea_status_restore.mjs';
import { handleIdeaAbort } from './api_idea_abort.mjs';
import { handleRagQuery, handleRagReindex } from './api_rag.mjs';
import { handleTargetedResearch, handleTargetedResearchStatus, handleCampaigns } from './api_targeted_research.mjs';
import {
  handleBatchCreate, handleBatchStart, handleBatchStatus,
  handleBatchPause, handleBatchResume, handleBatchCancel,
  handleBatchRetryItem, handleBatchSkipItem, handleBatchEvents, handleBatchJobs,
} from './api_batch.mjs';
import { deleteOutput } from './manifest_dynamic.mjs';

const SPA_DIST = path.join(HUB_ROOT, 'dist');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api')) {
    console.log(`[API Request] ${req.method} ${url.pathname}${url.search}`);
  }

  if(!checkAuth(req, { user: USER, pass: PASS })) return unauthorized(res);

  // API
  if(url.pathname === '/api/manifest'){
    try{
      await handleManifest(res);
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/rag/reindex'){
    try{
      await handleRagReindex(req, res, { labRuntime: LAB_RUNTIME });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/rag/query' && req.method === 'GET'){
    try{
      await handleRagQuery(req, res, { url, labRuntime: LAB_RUNTIME });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/build-status' && req.method === 'GET'){
    try{
      const p = path.join(LAB_RUNTIME, 'data', 'build_status.json');
      const raw = await (await import('node:fs/promises')).readFile(p, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(raw);
    }catch(_e){
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'idle' }));
    }
    return;
  }

  if(url.pathname === '/api/output' && req.method === 'DELETE'){
    try{
      const id = url.searchParams.get('id');
      if(!id) throw new Error('id required');
      await deleteOutput({ labOutputs: LAB_OUTPUTS, id });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:true }));
    }catch(e){
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea-restore' && req.method === 'POST'){
    try{
      await handleIdeaRestore(req, res, { 
        labRuntime: LAB_RUNTIME, 
        labOutputs: LAB_OUTPUTS,
        labRoot: LAB_ROOT
      });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea-status-restore' && req.method === 'POST'){
    try{
      await handleIdeaStatusRestore(req, res, { labRuntime: LAB_RUNTIME });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea-filtered-restore' && req.method === 'POST'){
    try{
      await handleIdeaFilteredRestore(req, res, { labRuntime: LAB_RUNTIME });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/feedback' && req.method === 'GET'){
    try{
      const date = url.searchParams.get('date');
      const data = await loadFeedback(path.join(LAB_RUNTIME, 'feedback'), date);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, data }));
    }catch(e){
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/feedback' && req.method === 'POST'){
    try{
      let body = '';
      req.on('data', (c) => (body += c));
      await new Promise((r) => req.on('end', r));
      const j = JSON.parse(body || '{}');
      const out = await saveFeedback(path.join(LAB_RUNTIME, 'feedback'), j);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out));
    }catch(e){
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea-prioritize' && req.method === 'POST'){
    try{
      await handleIdeaPrioritizeAndExecute(req, res, { labRuntime: LAB_RUNTIME, labRoot: LAB_ROOT });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea-queue' && req.method === 'POST'){
    try{
      let body = '';
      req.on('data', (c) => (body += c));
      await new Promise((r) => req.on('end', r));
      const j = JSON.parse(body || '{}');
      const idea = j?.idea;
      if(!idea || !idea.id || !idea.title) throw new Error('idea required');

      const outPath = path.join(LAB_RUNTIME, 'data', 'idea_queue.json');
      const payload = {
        updatedAt: new Date().toISOString(),
        idea,
      };
      await (await import('node:fs/promises')).writeFile(outPath, JSON.stringify(payload, null, 2));

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, path: outPath }));
    }catch(e){
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea-sources' && req.method === 'GET'){
    try{
      const p = path.join(LAB_RUNTIME, 'data', 'idea_sources.json');
      const raw = await (await import('node:fs/promises')).readFile(p, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(raw);
    }catch(_e){
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(_e?.message||_e) }));
    }
    return;
  }
  if(url.pathname === '/api/trends-report' && req.method === 'GET'){
    try{
      const p = path.join(LAB_RUNTIME, 'data', 'trends_report.md');
      const raw = await (await import('node:fs/promises')).readFile(p, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(raw);
    }catch(_e){
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end('');
    }
    return;
  }
  if(url.pathname === '/api/research-index' && req.method === 'GET'){
    try{
      const p = path.join(LAB_RUNTIME, 'data', 'research_index.md');
      const raw = await (await import('node:fs/promises')).readFile(p, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(raw);
    }catch(_e){
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end('');
    }
    return;
  }
  if(url.pathname === '/api/research-log' && req.method === 'GET'){
    try{
      const name = url.searchParams.get('name');
      if(!name || !name.endsWith('.md')) throw new Error('invalid name');
      const p = path.join(LAB_RUNTIME, 'data', 'research_logs', path.basename(name));
      const raw = await (await import('node:fs/promises')).readFile(p, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
      res.end(raw);
    }catch(e){
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }
  if(url.pathname === '/api/idea-research' && req.method === 'POST'){
    try{
      await handleIdeaResearch(req, res, { labRoot: LAB_ROOT });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea/research/targeted' && req.method === 'POST'){
    try{
      await handleTargetedResearch(req, res, { labRoot: LAB_ROOT });
    }catch(e){
      if(!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea/research/targeted/status' && req.method === 'GET'){
    try{
      handleTargetedResearchStatus(req, res);
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/campaigns' && req.method === 'GET'){
    try{
      await handleCampaigns(req, res, { labRuntime: LAB_RUNTIME });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  // --- Batch Build API ---
  if(url.pathname === '/api/batch/create' && req.method === 'POST'){
    try{ await handleBatchCreate(req, res, { labRuntime: LAB_RUNTIME }); }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }
  if(url.pathname === '/api/batch/start' && req.method === 'POST'){
    try{ await handleBatchStart(req, res, { labRuntime: LAB_RUNTIME, labRoot: LAB_ROOT }); }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }
  if(url.pathname === '/api/batch/status' && req.method === 'GET'){
    try{ await handleBatchStatus(req, res, { labRuntime: LAB_RUNTIME }); }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }
  if(url.pathname === '/api/batch/pause' && req.method === 'POST'){
    try{ await handleBatchPause(req, res, { labRuntime: LAB_RUNTIME }); }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }
  if(url.pathname === '/api/batch/resume' && req.method === 'POST'){
    try{ await handleBatchResume(req, res, { labRuntime: LAB_RUNTIME, labRoot: LAB_ROOT }); }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }
  if(url.pathname === '/api/batch/cancel' && req.method === 'POST'){
    try{ await handleBatchCancel(req, res, { labRuntime: LAB_RUNTIME }); }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }
  if(url.pathname === '/api/batch/retry-item' && req.method === 'POST'){
    try{ await handleBatchRetryItem(req, res, { labRuntime: LAB_RUNTIME }); }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }
  if(url.pathname === '/api/batch/skip-item' && req.method === 'POST'){
    try{ await handleBatchSkipItem(req, res, { labRuntime: LAB_RUNTIME }); }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }
  if(url.pathname === '/api/batch/events' && req.method === 'GET'){
    try{ handleBatchEvents(req, res, { labRuntime: LAB_RUNTIME }); }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }
  if(url.pathname === '/api/batch/jobs' && req.method === 'GET'){
    try{ await handleBatchJobs(req, res, { labRuntime: LAB_RUNTIME }); }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea-abort' && req.method === 'POST'){
    try{
      await handleIdeaAbort(req, res, { labRuntime: LAB_RUNTIME });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea-generate' && req.method === 'POST'){
    try{
      await handleIdeaGenerate(req, res, { labRuntime: LAB_RUNTIME, labRoot: LAB_ROOT });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea-backlog' && req.method === 'GET'){
    try{
      await handleIdeaBacklog(req, res, { labRuntime: LAB_RUNTIME });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea-backlog' && req.method === 'POST'){
    try{
      await handleIdeaBacklogAdd(req, res, { labRuntime: LAB_RUNTIME });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea-backlog' && req.method === 'DELETE'){
    try{
      await handleIdeaBacklogDelete(req, res, { labRuntime: LAB_RUNTIME });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea-filtered' && req.method === 'GET'){
    try{
      await handleIdeaFiltered(req, res, { labRuntime: LAB_RUNTIME });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  if(url.pathname === '/api/idea-filtered' && req.method === 'DELETE'){
    try{
      await handleIdeaFilteredDelete(req, res, { labRuntime: LAB_RUNTIME });
    }catch(e){
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok:false, error: String(e?.message||e) }));
    }
    return;
  }

  // 1. Project assets/pages (e.g. /2026-02-03-...)
  // Prioritize project-specific paths to avoid SPA assets shadowing them
  const projectMatch = url.pathname.match(/^\/(\d{4}-\d{2}-\d{2}[^/]*)(.*)$/);
  if (projectMatch) {
    const [_, projectId, rest] = projectMatch;

    // Enforce trailing slash for the project base URL to ensure relative assets work
    if (!rest && !url.pathname.endsWith('/')) {
      res.writeHead(302, { 'Location': url.pathname + '/' + (url.search || '') });
      res.end();
      return;
    }

    const projectDir = path.join(LAB_OUTPUTS, projectId);
    const distDir = path.join(projectDir, 'dist');
    
    // Check if dist/ exists
    let useDist = false;
    try {
      const s = await (await import('node:fs/promises')).stat(distDir);
      if (s.isDirectory()) useDist = true;
    } catch (_e) {
      // Ignored: directory check failed
    }

    const mapped = useDist 
      ? safeJoin(distDir, rest || '/index.html') 
      : safeJoin(projectDir, rest || '/index.html');
      
    if(mapped) {
      // For unbuilt projects (no dist), index.html often uses absolute paths like /src/...
      // We need to either rewrite those to relative ./src/ or handle the mapping.
      // We'll rewrite the HTML content on-the-fly for unbuilt projects.
      const modifier = !useDist ? (html) => {
        return html
          .replace(/src="\/(src|node_modules|assets)\//g, 'src="./$1/')
          .replace(/href="\/(src|node_modules|assets)\//g, 'href="./$1/');
      } : null;

      if(await serveFile(res, mapped, url, modifier)) return;
    }
  }

  // 2. SPA assets (must be checked before global fallthrough)
  const spaPath = url.pathname === '/' ? path.join(SPA_DIST, 'index.html') : safeJoin(SPA_DIST, url.pathname);
  if(spaPath) {
    if(await serveFile(res, spaPath, url)) return;
  }

  // 3. SPA fallback for client-side routing
  if(url.pathname === '/' || !path.extname(url.pathname)){
    if(await serveFile(res, path.join(SPA_DIST, 'index.html'), url)) return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Daily App Lab Hub: http://0.0.0.0:${PORT}/ (basic auth user=${USER}, pass=${PASS?'<set>':'<not set>'})`);
  console.log(`LAB_ROOT=${LAB_ROOT}`);
});
