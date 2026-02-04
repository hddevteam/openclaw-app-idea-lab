import path from 'node:path';
import fs from 'node:fs/promises';

import { readClawdbotAzureConfig } from './clawdbot_config_read.mjs';
import { callAzureOpenAI, extractTextFromResponse } from './azure_openai_client.mjs';
import { runPlannerResearch } from './research_runner.mjs';

export async function handleIdeaGenerate(req, res, { labRuntime, labRoot }){
  const LANG = process.env.DAILY_APP_LAB_LANG || 'zh-CN';
  let body='';
  req.on('data', c => body += c);
  await new Promise(r => req.on('end', r));
  const input = JSON.parse(body || '{}');

  const count = Math.max(3, Math.min(12, Number(input.count || 8)));
  const strictness = Number(input.strictness || 0.78);
  const want = Math.max(3, Math.min(12, Number(input.want || count)));

  // Optional: refresh research sources (default: false, since planner_research auto-generates ideas now)
  const refreshResearch = input.refreshResearch === true;
  if (refreshResearch) {
    try {
      await runPlannerResearch({ labRoot, timeoutMs: 120000 });
    } catch (err) {
      console.warn('Failed to refresh research data:', err.message);
    }
  }

  const manifestRaw = await fs.readFile(path.join(labRuntime,'data','manifest.json'), 'utf8');
  const sourcesRaw = await fs.readFile(path.join(labRuntime,'data','idea_sources.json'), 'utf8');

  const model = process.env.AZURE_OPENAI_MODEL || 'gpt-5.2';
  const { baseUrl, apiKey } = await readClawdbotAzureConfig();

  const prompt = `You are a product planner for Daily App Lab.

IMPORTANT: Output MUST be written in ${LANG}, except URLs.

Goal:
- Generate ${count} NEW micro-app/web tool ideas.
- FOCUS: "Simple, Fast, Tactile".
- CONSTRAINT: Each idea must be buildable in 60 mins (React+Tailwind).
- CONSTRAINT: Must be "Simulation-First" (Works offline with fake data).
- Must be semantically different from ALL past projects.
- Must include touch gestures (Swipe/Drag/Pinch).
- Each idea must cite 1-2 research sources (title+url) from the provided sources.
- Strictness: treat similarity >= ${strictness} as duplicate.

Note: some ideas may still be similar; the server will run a local similarity filter afterwards.

Past projects (manifest.json):
${manifestRaw}

Research sources (idea_sources.json):
${sourcesRaw}

Return ONLY valid JSON with schema (all string fields must be in ${LANG}):
{
  "generatedAt": "...",
  "ideas": [
    {
      "id": "kebab-case-unique",
      "title": "...",
      "hudScenario": "1 sentence: who uses it, for what decision/workflow, what output",
      "output": "Concrete output users can copy/export",
      "coreInteractions": ["Swipe to...", "Drag to...", "Pinch to..."],
      "mockDataStrategy": "How to fake the data? (e.g. 'Generate 10 random items', 'Pre-load JSON')",
      "demoStartState": "What users see immediately (No empty states!)",
      "selfHealing": ["..."],
      "keywords": ["..."],
      "complexityBudget": {"minutes": 60, "screens": 2, "interactions": 3},
      "sources": [{"title":"...","url":"..."}]
    }
  ]
}
`; 

  const resp = await callAzureOpenAI({
    baseUrl,
    apiKey,
    model,
    input: prompt,
    timeoutMs: 90000,
  });

  const text = extractTextFromResponse(resp);
  let json;
  try{
    json = JSON.parse(text);
  }catch(e){
    throw new Error('Model did not return valid JSON');
  }

  // Local similarity hard filter vs history (manifest)
  const { embed, cosine } = await import('./similarity.mjs');
  const manifest = JSON.parse(manifestRaw);
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const histEmb = entries.map(e => {
    const txt = `${e.title||''}\n${e.desc||''}`.trim();
    return { id: e.id, date: e.date, title: e.title, v: embed(txt) };
  });

  const accepted = [];
  const rejected = [];
  const seen = new Set();

  for(const idea of (json.ideas||[])){
    const id = String(idea?.id||'');
    if(!id || seen.has(id)) continue;
    seen.add(id);

    const txt = `${idea.title||''}\n${idea.hudScenario||''}\n${(idea.keywords||[]).join(' ')}`.trim();
    const v = embed(txt);
    let best = { score: -1, match: null };
    for(const h of histEmb){
      const s = cosine(v, h.v);
      if(s > best.score) best = { score: s, match: h };
    }

    idea.similarity = { score: Number(best.score.toFixed(3)), match: best.match ? { id: best.match.id, date: best.match.date, title: best.match.title } : null };

    if(best.score >= strictness){
      rejected.push(idea);
    }else if(accepted.length < want){
      accepted.push(idea);
    }else{
      // extra ideas beyond want go to rejected bucket
      rejected.push(idea);
    }
  }

  // Persist rejected ideas to a separate file for review/deletion
  try{
    const p = path.join(labRuntime, 'data', 'idea_filtered.json');
    const cur = JSON.parse(await fs.readFile(p,'utf8').catch(()=>'{"updatedAt":null,"ideas":[]}'));
    const curIdeas = Array.isArray(cur.ideas) ? cur.ideas : [];
    const byId = new Map(curIdeas.map(x=>[String(x.id), x]));
    for(const idea of rejected){
      const id = String(idea.id||'');
      if(!id) continue;
      if(!byId.has(id)) byId.set(id, { ...idea, createdAt: new Date().toISOString(), status: 'filtered' });
    }
    const out = { updatedAt: new Date().toISOString(), ideas: Array.from(byId.values()) };
    await fs.writeFile(p, JSON.stringify(out, null, 2));
  }catch{}

  // Persist accepted ideas to backlog (unimplemented AI ideas)
  try{
    const p = path.join(labRuntime, 'data', 'idea_backlog.json');
    const cur = JSON.parse(await fs.readFile(p,'utf8').catch(()=>'{"updatedAt":null,"ideas":[]}'));
    const curIdeas = Array.isArray(cur.ideas) ? cur.ideas : [];
    const byId = new Map(curIdeas.map(x=>[String(x.id), x]));
    for(const idea of accepted){
      const id = String(idea.id||'');
      if(!id) continue;
      if(!byId.has(id)) byId.set(id, { ...idea, createdAt: new Date().toISOString(), status: 'new' });
    }
    const out = { updatedAt: new Date().toISOString(), ideas: Array.from(byId.values()) };
    await fs.writeFile(p, JSON.stringify(out, null, 2));
  }catch{}

  const outJson = { ...json, ideas: accepted, filtered: rejected.length };

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(outJson));
}
