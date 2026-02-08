import path from 'node:path';
import fs from 'node:fs/promises';

import { readClawdbotAzureConfig } from './clawdbot_config_read.mjs';
import { callAzureOpenAI, extractTextFromResponse } from './azure_openai_client.mjs';
import { runPlannerResearch } from './research_runner.mjs';
import { listOutputsAsManifest } from './manifest_dynamic.mjs';
import { LAB_OUTPUTS } from './config.mjs';

import { extractJsonObject } from '../../../packages/shared/extract_json.mjs';
import { callWithRetry } from '../../../packages/shared/extract_json.mjs';
import { normalizeIdea, normalizeIdeaList } from '../../../packages/shared/json_contract.mjs';
import { writeJsonAtomic, readJsonSafe, withFileLock } from '../../../packages/shared/atomic_fs.mjs';
import { createEventLogger, generateRunId } from '../../../packages/shared/event_logger.mjs';

export async function handleIdeaGenerate(req, res, { labRuntime, labRoot }){
  const LANG = process.env.DAILY_APP_LAB_LANG || 'zh-CN';
  const runId = generateRunId();
  const eventLog = createEventLogger({ logDir: path.join(labRuntime, 'logs') });
  const diagLogDir = path.join(labRuntime, 'logs', 'diagnostics');

  let body='';
  req.on('data', c => body += c);
  await new Promise(r => req.on('end', r));
  const input = JSON.parse(body || '{}');

  const count = Math.max(3, Math.min(12, Number(input.count || 8)));
  const strictness = Number(input.strictness || 0.78);
  const want = Math.max(3, Math.min(12, Number(input.want || count)));

  const categories = Array.isArray(input.categories) ? input.categories.join(', ') : 'General';
  const styles = Array.isArray(input.styles) ? input.styles.join(', ') : 'Tactile';
  const form = input.form || 'ui-template';

  await eventLog.emit('idea_generate.start', { runId, count, want, strictness, categories, styles, form });

  // Optional: refresh research
  const refreshResearch = input.refreshResearch === true;
  if (refreshResearch) {
    try {
      await runPlannerResearch({ labRoot, timeoutMs: 600000 });
    } catch (err) {
      console.warn('Failed to refresh research data:', err.message);
    }
  }

  // *** SINGLE TRUTH SOURCE: use dynamic manifest (outputs/ scan) ***
  const { entries: manifestEntries } = await listOutputsAsManifest({ labOutputs: LAB_OUTPUTS });
  const manifestSummary = JSON.stringify(manifestEntries.slice(0, 60).map(e => ({
    id: e.id, title: e.title, desc: (e.desc || '').slice(0, 100),
  })));

  const sourcesRaw = await fs.readFile(path.join(labRuntime,'data','idea_sources.json'), 'utf8').catch(() => '{"sources":[]}');

  const model = process.env.AZURE_OPENAI_MODEL || 'gpt-5.2';
  const { baseUrl, apiKey } = await readClawdbotAzureConfig();

  // Generate 2x candidates for diversity selection
  const generateCount = Math.min(24, count * 2);
  // Dynamic timeout: 60s base + 15s per extra idea beyond 6
  const llmTimeoutMs = Math.max(60000, 60000 + Math.max(0, generateCount - 6) * 15000);

  const prompt = `You are a product planner for Daily App Lab.

IMPORTANT: Output MUST be written in ${LANG}, except URLs.

Context:
- Category focus: ${categories}
- Visual/Interaction Style: ${styles}
- Form: ${form} (Priority: minimal interaction logic that works)

Goal:
- Generate ${generateCount} NEW micro-app/web tool ideas (we will select top ${want} later).
- FOCUS: "Simple, Fast, Tactile".
- CONSTRAINT: Each idea must be buildable in 60 mins (React+Tailwind).
- CONSTRAINT: Works offline — use local mock data or browser APIs (localStorage, Canvas, Web Audio, WebRTC, etc.).

CRITICAL — ANTI-REPETITION RULES (your output will be REJECTED if violated):
1. BANNED TITLE WORDS: Do NOT use "模拟器", "模拟", "演练", "离线" in titles. These are already overused (30% of existing ideas).
2. BANNED PATTERNS: Do NOT generate "XX参数调节器", "XX手感实验室", "XX模拟器（离线）". These patterns are exhausted.
3. THINK BEYOND SIMULATORS: Consider these alternative idea archetypes:
   - 🎮 Interactive games/puzzles (not gamified tools)
   - 🎨 Creative/generative tools (art, music, writing)
   - 📊 Visualizers that reveal hidden patterns in data
   - 🧩 Combinatorial/mashup tools (combine two unrelated concepts)
   - 🔧 Developer micro-utilities (code visualization, regex playground, etc.)
   - 📱 Social/collaborative micro-experiences (no backend = use WebRTC/local)
   - 🧠 Learning/quiz/flashcard experiences
   - 🎲 Procedural generators (names, stories, maps, palettes, recipes)
   - ⏱️ Time-based challenges (speed runs, timed creation)
   - 🗺️ Spatial/map-based explorations (using static map tiles)
4. Each idea must feel like a COMPLETE tiny product, not a "settings panel" or "parameter tuner".
5. The "hudScenario" must describe a REAL human desire (fun, curiosity, creativity, social), not just "调参" or "决策".

- DIVERSITY REQUIREMENT:
  - Cover at least 5 DIFFERENT domains from: ai, system, network, game, productivity, design, photo, video, music, finance, business, dev-tools, edu, health, lifestyle, travel, food, social, storytelling, language.
  - Use at least 4 DIFFERENT interaction primitives from: drag-drop, swipe, pinch-zoom, long-press, slider, toggle, canvas-draw, timeline, card-stack, sort-filter, scroll-reveal, gesture-ring, shake, voice-input, camera-feed.
  - NO TWO ideas should share the same primary interaction AND domain.
- MOBILE USABILITY CRITICAL:
  - DO NOT capture gestures on document/body.
  - Interaction areas MUST be contained (e.g. within a center card).
  - Use "centered layout" to leave space for page scrolling at edges.
  - Provide button fallbacks for complex gestures (e.g., +/- for pinch).
  - Use 'touch-action: pan-y' for lists to preserve vertical scroll.
- STYLE: Apply "${styles}" aesthetics and logic.
- Must be semantically different from ALL past projects.
- Each idea must cite 1-2 research sources (title+url) from the provided sources.
- Strictness: treat similarity >= ${strictness} as duplicate.

Note: some ideas may still be similar; the server will run a local similarity filter afterwards.

Past projects (recent ${manifestEntries.length}):
${manifestSummary}

Research sources (idea_sources.json):
${sourcesRaw}

Return ONLY valid JSON with schema (all string fields must be in ${LANG}):
{
  "generatedAt": "...",
  "ideas": [
    {
      "id": "kebab-case-unique",
      "title": "简洁有趣的产品名（禁止用'模拟器/演练/离线'）",
      "hudScenario": "1 sentence: who uses it, for what HUMAN DESIRE (fun/curiosity/creativity/productivity), what delightful output",
      "visualTheme": "Choose ONE preset: professional (clean, biz), tech (slate, cyber, data), nature (sage, organic), vibrant (bright, energetic), creative (deep purple, magic), minimal (monochrome, zen)",
      "output": "Concrete output users can copy/export/share",
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

  // *** LLM call with auto-retry + robust JSON extraction ***
  const llmResult = await callWithRetry(
    async () => {
      const resp = await callAzureOpenAI({ baseUrl, apiKey, model, input: prompt, timeoutMs: llmTimeoutMs });
      return extractTextFromResponse(resp);
    },
    (text) => extractJsonObject(text),
    {
      maxAttempts: 3,
      delayMs: 3000,
      logDir: diagLogDir,
      runId,
      operationName: 'idea_generate',
      requestMeta: { model, count: generateCount, categories, styles },
    }
  );

  if (!llmResult.ok) {
    await eventLog.emit('idea_generate.failed', { runId, error: llmResult.error, attempts: llmResult.attempts });
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Model did not return valid JSON after retries', runId, attempts: llmResult.attempts }));
    return;
  }

  const json = llmResult.value;

  // *** Normalize each idea through JSON contract ***
  const rawIdeas = Array.isArray(json.ideas) ? json.ideas : [];
  const normalizedIdeas = rawIdeas.map(normalizeIdea).filter(Boolean);

  // Local similarity hard filter vs history (dynamic manifest)
  const { embed, cosine } = await import('./similarity.mjs');
  const histEmb = manifestEntries.map(e => {
    const txt = `${e.title||''}\n${e.desc||''}`.trim();
    return { id: e.id, date: e.date, title: e.title, v: embed(txt) };
  });

  const accepted = [];
  const rejected = [];
  const seen = new Set();
  // Track diversity coverage
  const usedDomains = new Set();
  const usedInteractions = new Set();

  for(const idea of normalizedIdeas){
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
    }else{
      accepted.push(idea);
      // Track diversity
      for (const kw of (idea.keywords || [])) usedDomains.add(kw);
      for (const ci of (idea.coreInteractions || [])) usedInteractions.add(ci.split(' ')[0]?.toLowerCase());
    }
  }

  // *** Diversity-aware selection: pick top `want` ensuring coverage ***
  const finalAccepted = accepted.slice(0, want);
  const extraAccepted = accepted.slice(want);
  for (const idea of extraAccepted) rejected.push(idea);

  await eventLog.emit('idea_generate.result', {
    runId,
    candidateCount: normalizedIdeas.length,
    acceptedCount: finalAccepted.length,
    rejectedCount: rejected.length,
    domainsUsed: [...usedDomains],
    attempts: llmResult.attempts,
    model,
  });

  // *** Persist rejected ideas atomically ***
  try{
    const p = path.join(labRuntime, 'data', 'idea_filtered.json');
    await withFileLock(p, async () => {
      const cur = normalizeIdeaList(await readJsonSafe(p, { ideas: [] }));
      const byId = new Map(cur.ideas.map(x=>[String(x.id), x]));
      for(const idea of rejected){
        const id = String(idea.id||'');
        if(!id) continue;
        if(!byId.has(id)) byId.set(id, { ...idea, createdAt: new Date().toISOString(), status: 'filtered' });
      }
      const out = { updatedAt: new Date().toISOString(), ideas: Array.from(byId.values()) };
      await writeJsonAtomic(p, out);
    });
  } catch (err) {
    console.error('Failed to save filtered ideas:', err.message);
  }

  // *** Persist accepted ideas to backlog atomically ***
  try {
    const p = path.join(labRuntime, 'data', 'idea_backlog.json');
    await withFileLock(p, async () => {
      const cur = normalizeIdeaList(await readJsonSafe(p, { ideas: [] }));
      const byId = new Map(cur.ideas.map(x=>[String(x.id), x]));
      for (const idea of finalAccepted) {
        const id = String(idea.id||'');
        if (!id) continue;
        if (!byId.has(id)) byId.set(id, { ...idea, createdAt: new Date().toISOString(), status: 'new' });
      }
      const out = { updatedAt: new Date().toISOString(), ideas: Array.from(byId.values()) };
      await writeJsonAtomic(p, out);
    });
  } catch (err) {
    console.error('Failed to save backlog ideas:', err.message);
  }

  // --- Research Archiving & Indexing ---
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logDir = path.join(labRuntime, 'data', 'research_logs');
    const reportPath = path.join(labRuntime, 'data', 'trends_report.md');
    const indexPath = path.join(labRuntime, 'data', 'research_index.md');

    let reportContent = '';
    try {
      reportContent = await fs.readFile(reportPath, 'utf8');
    } catch {
      reportContent = '> No research report available for this session.';
    }

    const snapshotName = `research_${timestamp}.md`;
    const snapshotPath = path.join(logDir, snapshotName);
    
    const snapshotHeader = `# Research Snapshot: ${new Date().toLocaleString()}\n\n` +
      `**RunId**: ${runId}\n` +
      `**Categories**: ${categories}\n` +
      `**Styles**: ${styles}\n` +
      `**Form**: ${form}\n` +
      `**Generated Ideas**: ${finalAccepted.length}\n\n` +
      `--- \n\n`;
    
    await fs.mkdir(logDir, { recursive: true });
    await fs.writeFile(snapshotPath, snapshotHeader + reportContent);

    const indexEntry = `| ${new Date().toLocaleString()} | [${snapshotName}](./research_logs/${snapshotName}) | ${categories} | ${styles} | ${finalAccepted.length} |\n`;
    let indexContent = '';
    try {
      indexContent = await fs.readFile(indexPath, 'utf8');
    } catch {
      indexContent = `# Research & Generation Index\n\n| Date | Report Link | Categories | Styles | Ideas |\n| :--- | :--- | :--- | :--- | :--- |\n`;
    }
    
    await fs.writeFile(indexPath, indexContent + indexEntry);
    console.log(`[Archive] Saved research snapshot to ${snapshotName}`);
  } catch (err) {
    console.warn('[Archive] Failed to archive research:', err.message);
  }

  const outJson = { ...json, ideas: finalAccepted, filtered: rejected.length, runId };

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(outJson));
}
