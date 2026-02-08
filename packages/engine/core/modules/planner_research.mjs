import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { isTooSimilar } from './rag_dedupe.mjs';
import { extractJson, extractJsonArray } from '../../../shared/extract_json.mjs';
import { callWithRetry } from '../../../shared/extract_json.mjs';
import { normalizeIdea, normalizeIdeaList, normalizeDiversityPlan, normalizeScoreCard, computeTotalScore } from '../../../shared/json_contract.mjs';
import { writeJsonAtomic, readJsonSafe, withFileLock } from '../../../shared/atomic_fs.mjs';
import { createEventLogger, generateRunId } from '../../../shared/event_logger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.DAILY_APP_LAB_ROOT || path.resolve(HERE, '..', '..'));
const DATA = path.join(ROOT, 'runtime', 'data');
const LOGS_DIR = path.join(ROOT, 'runtime', 'logs');
const BACKLOG = path.join(DATA, 'idea_backlog.json');
const TRENDS_REPORT = path.join(DATA, 'trends_report.md');
const SOURCES_DATA = path.join(DATA, 'idea_sources.json');
const RAG_INDEX = path.join(DATA, 'rag_projects_index.json');
const CLAW_CONFIG = process.env.CLAWDBOT_CONFIG || path.join(os.homedir(), '.openclaw', 'clawdbot.json');

const LANG = process.env.DAILY_APP_LAB_LANG || 'zh-CN';
const MODEL = process.env.AZURE_OPENAI_MODEL || 'gpt-5.2';

// --- Agent Utils ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function loadConfig() {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7890';
  
  console.log(`[Config] Proxy: ${proxy}`);
  setGlobalDispatcher(new ProxyAgent(proxy));

  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) {
    return {
      braveKey: process.env.BRAVE_API_KEY,
      azure: {
        baseUrl: process.env.AZURE_OPENAI_ENDPOINT,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        models: [{ id: MODEL }]
      }
    };
  }

  const raw = await fs.readFile(CLAW_CONFIG, 'utf8');
  const cfg = JSON.parse(raw);
  
  return {
    braveKey: cfg.tools?.web?.search?.apiKey || cfg.env?.vars?.BRAVE_API_KEY,
    azure: cfg.models?.providers?.['azure-openai'],
  };
}

// =====================================================================
//  Tool Functions (shared by all agents)
// =====================================================================

async function braveSearch(query, apiKey) {
  console.log(`[Tool:Search] "${query}"`);
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=4`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey } });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    return data.web?.results || [];
  } catch (e) {
    console.warn(`[Tool:Search] Failed: ${e.message}`);
    return [];
  }
}

async function fetchPageContent(url) {
  console.log(`[Tool:Browse] Reading: ${url.slice(0, 60)}...`);
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    
    if (!res.ok) throw new Error(`Status ${res.status}`);
    let text = await res.text();
    
    text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gmi, "");
    text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gmi, "");
    text = text.replace(/<[^>]+>/g, " ");
    text = text.replace(/\s+/g, " ").trim();
    
    return text.slice(0, 2000);
  } catch (e) {
    console.warn(`[Tool:Browse] Ignore ${url}: ${e.message}`);
    return "";
  }
}

const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview';

async function callLLM(prompt, config, _role = 'system') {
  const { baseUrl, apiKey, models } = config;
  const model = models.find(m => m.id === MODEL) || models[0];

  // Build Azure OpenAI Responses API URL (same endpoint format as azure_openai_client)
  const base = baseUrl.replace(/\/+$/, '');
  const url = base.includes('/openai')
    ? `${base}/responses?api-version=${API_VERSION}`
    : `${base}/openai/responses?api-version=${API_VERSION}`;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        model: model.id,
        instructions: `You are an advanced creative agent. You specialize in "Combinatorial Innovation". All your written output and analysis MUST be in ${LANG}.`,
        input: prompt,
        temperature: 0.85
      })
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(`LLM Error (${res.status}): ${raw.slice(0, 200)}`);
    const data = JSON.parse(raw);
    // Extract text from Responses API format
    const output = data?.output;
    if (!Array.isArray(output)) return '';
    let text = '';
    for (const item of output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c?.type === 'output_text' && typeof c.text === 'string') text += c.text;
      }
    }
    return text.trim();
  } finally {
    clearTimeout(id);
  }
}

// =====================================================================
//  AGENT 1: PLANNER – Diversity-aware search planning
// =====================================================================

async function agentPlanner(config, eventLog, runId) {
  console.log('[Agent:Planner] Creating diversity-aware research plan...');

  let previousTrends = "";
  try {
    previousTrends = await fs.readFile(TRENDS_REPORT, 'utf8');
    previousTrends = "RECENT TRENDS ANALYZED YESTERDAY:\n" + previousTrends.slice(0, 1000);
  } catch { /* no previous trends */ }

  // Load existing backlog to understand current coverage gaps
  let existingKeywords = [];
  try {
    const backlog = await readJsonSafe(BACKLOG, { ideas: [] });
    const ideas = backlog.ideas || backlog.items || [];
    existingKeywords = ideas.flatMap(i => i.keywords || []);
  } catch { /* ignore */ }

  const prompt = `
  ${previousTrends}

  Current backlog keyword distribution: [${[...new Set(existingKeywords)].slice(0, 30).join(', ')}]

  Task: Create A DIVERSITY PLAN and search queries for discovering fresh micro-app ideas.

  STEP 1 – Diversity Assessment:
  - Identify which domains from [ai, system, network, game, productivity, design, photo, video, music, finance, business, dev-tools, edu, health, lifestyle, travel] are UNDERREPRESENTED in the current backlog.
  - Identify which interaction primitives from [drag-drop, swipe, pinch-zoom, long-press, slider, toggle, canvas-draw, timeline, card-stack, sort-filter, scroll-reveal, gesture-ring] are MISSING.

  STEP 2 – Generate 8 search queries:
  - 4 queries in English (global: Product Hunt, Indie Hackers, HN)
  - 4 queries in ${LANG} (local pain points)
  - Each query must target an UNDERREPRESENTED domain
  - Ensure queries do NOT repeat themes from "RECENT TRENDS ANALYZED YESTERDAY"

  STEP 3 – Output a diversity plan.

  Output JSON ONLY:
  {
    "diversityPlan": {
      "targetCount": 8,
      "minDomains": 5,
      "minInteractions": 4,
      "underrepresentedDomains": ["domain1", "domain2", ...],
      "underrepresentedInteractions": ["interaction1", ...]
    },
    "queries": ["query1", "query2", ...]
  }
  `;

  const result = await callWithRetry(
    () => callLLM(prompt, config.azure),
    (text) => {
      // Try object extraction FIRST (the prompt asks for {diversityPlan, queries})
      const obj = extractJson(text);
      if (obj.ok && !Array.isArray(obj.value) && obj.value && Array.isArray(obj.value.queries)) {
        return { ok: true, value: obj.value };
      }
      // Fall back to array extraction (plain list of queries)
      const r = extractJsonArray(text);
      return r;
    },
    { maxAttempts: 2, delayMs: 2000, logDir: path.join(LOGS_DIR, 'diagnostics'), runId, operationName: 'planner' }
  );

  let queries = [];
  let diversityPlan = {};

  if (result.ok) {
    const val = result.value;
    if (Array.isArray(val)) {
      queries = val;
    } else if (val && val.queries) {
      queries = val.queries;
      diversityPlan = val.diversityPlan || {};
    }
  }

  // Dynamic fallback: use Brave Search to discover real-time trends for gap domains
  if (queries.length === 0) {
    console.warn('[Agent:Planner] LLM planner failed, building search-driven fallback queries');
    const ALL_DOMAINS = ['ai', 'system', 'network', 'game', 'productivity', 'design', 'photo', 'video', 'music', 'finance', 'health', 'edu', 'lifestyle', 'travel'];
    const covered = new Set(existingKeywords.map(k => k.toLowerCase()));
    const gaps = ALL_DOMAINS.filter(d => !covered.has(d));
    const targets = gaps.length >= 4 ? gaps.slice(0, 4) : ALL_DOMAINS.sort(() => Math.random() - 0.5).slice(0, 4);

    // Phase 1: seed search — discover trending terms per gap domain via Brave
    const seedResults = await Promise.all(
      targets.map(d => braveSearch(`${d} micro-app trending tool 2026`, config.braveKey))
    );

    // Phase 2: extract real keywords from search titles/descriptions
    for (let i = 0; i < targets.length; i++) {
      const domain = targets[i];
      const results = seedResults[i];
      if (results.length > 0) {
        // Build query from actual search result titles (real trending terms)
        const topTitles = results.slice(0, 3).map(r => r.title).join(' | ');
        queries.push(`${domain} app like: ${topTitles}`);
        // Also generate a localized query from descriptions
        const snippets = results.slice(0, 2).map(r => (r.description || '').slice(0, 40)).filter(Boolean).join(' ');
        if (snippets) {
          queries.push(`${domain}领域 类似 ${snippets} 的创新微应用`);
        }
      } else {
        // Brave search also failed — minimal template as last resort
        queries.push(`innovative ${domain} micro-app indie developer tools 2026`);
        queries.push(`${domain}领域 创新微应用 移动端痛点 2026`);
      }
    }
    queries = queries.slice(0, 8);
    console.log(`[Agent:Planner] Fallback generated ${queries.length} search-driven queries from ${targets.length} gap domains`);
  }

  diversityPlan = normalizeDiversityPlan(diversityPlan);

  await eventLog.emit('planner.complete', { runId, queryCount: queries.length, diversityPlan });
  console.log(`[Agent:Planner] ${queries.length} queries planned, targeting ${diversityPlan.minDomains} domains`);

  return { queries, diversityPlan };
}

// =====================================================================
//  AGENT 2: RESEARCHER – Evidence-driven parallel research
// =====================================================================

async function agentResearcher(queries, config, eventLog, runId) {
  console.log('[Agent:Researcher] Executing parallel evidence gathering...');
  let context = "";
  const sources = [];
  const evidenceItems = [];

  // Parallel search (batch of 3 at a time for rate limiting)
  const BATCH_SIZE = 3;
  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const batch = queries.slice(i, i + BATCH_SIZE);
    const searchResults = await Promise.all(batch.map(q => braveSearch(q, config.braveKey)));

    for (let j = 0; j < batch.length; j++) {
      const q = batch[j];
      const results = searchResults[j];
      if (results.length === 0) continue;

      // Smart source selection via LLM
      const candidateList = results.slice(0, 4).map((r, idx) => `${idx}: ${r.title} - ${r.url} - ${r.description}`).join('\n');
      const selectPrompt = `From this search result list, return the indices of the TWO most insightful and high-quality unique sources for technical inspiration. Discard pure SEO spam. JSON ONLY: [0, 1]
      Results:\n${candidateList}`;
      
      let picks = [0, 1];
      try {
        const resp = await callLLM(selectPrompt, config.azure);
        const match = resp.match(/\[.*\]/);
        if (match) picks = JSON.parse(match[0]);
      } catch { /* use defaults */ }

      context += `\n### Search Query: ${q}\n`;
      
      for (const idx of picks) {
        const r = results[idx];
        if (!r) continue;
        sources.push({ title: r.title, url: r.url });
        const content = await fetchPageContent(r.url);
        if (content.length > 200) {
          context += `- Source: ${r.title} (${r.url})\n  Content: ${content}\n`;
          evidenceItems.push({ claim: r.title, evidenceUrl: r.url, snippet: content.slice(0, 300) });
        } else {
          context += `- Source: ${r.title}: ${r.description}\n`;
          evidenceItems.push({ claim: r.title, evidenceUrl: r.url, snippet: r.description || '' });
        }
        await sleep(800);
      }
    }
  }

  await eventLog.emit('researcher.complete', { runId, sourcesCount: sources.length, evidenceCount: evidenceItems.length });
  console.log(`[Agent:Researcher] Gathered ${sources.length} sources, ${evidenceItems.length} evidence items`);

  return { context, sources, evidenceItems };
}

// =====================================================================
//  AGENT 3a: IDEATOR – Generate candidates (quantity over quality)
// =====================================================================

async function agentIdeator(researchContext, diversityPlan, config, eventLog, runId) {
  console.log('[Agent:Ideator] Generating diverse candidate ideas...');

  const targetCount = (diversityPlan.targetCount || 8) * 2; // generate 2x for selection

  const prompt = `
  Context from Global & Local App Research:
  ${researchContext.slice(0, 10000)}

  Diversity Requirements:
  - Generate ${targetCount} "Micro-App" ideas (we'll select the best half later)
  - MUST cover these underrepresented domains: ${JSON.stringify(diversityPlan.underrepresentedDomains || diversityPlan.validDomains?.slice(0, 6))}
  - MUST use at least ${diversityPlan.minInteractions || 4} DIFFERENT interaction primitives from: ${JSON.stringify(diversityPlan.validInteractions || [])}
  - NO TWO ideas should share the SAME primary domain + interaction combination
  
  IMPORTANT: All fields in the resulting JSON MUST be written in ${LANG}. 
  
  Philosophy: "Simple, Fast, Tactile, Self-Contained".
  
  Hard Constraints:
  1. NO Login, NO Backend, NO Paid Keys.
  2. Must be buildable in React+Tailwind in < 60 mins.
  3. Use local mock data or browser APIs (localStorage, Canvas, Web Audio, WebRTC) when real data isn't available.
  4. BANNED TITLE WORDS: Do NOT use "模拟器", "模拟", "演练", "离线" in titles — these are overused.
  5. BANNED PATTERNS: No "XX参数调节器", "XX手感实验室", "XX模拟器（离线）".
  6. Think BEYOND simulators! Consider:
     - 🎮 Interactive games/puzzles (not gamified tools)  
     - 🎨 Creative/generative tools (art, music, writing)
     - 📊 Visualizers that reveal hidden patterns
     - 🧩 Mashup tools (combine two unrelated concepts)
     - 🔧 Developer micro-utilities (regex, color, code viz)
     - 🧠 Learning/quiz/flashcard experiences
     - 🎲 Procedural generators (names, stories, maps, palettes)
     - ⏱️ Time-based challenges (speed runs, timed creation)
  7. Each idea must feel like a COMPLETE tiny product, not a "settings panel".
  8. The hudScenario must describe a REAL human desire (fun, curiosity, creativity), not just "调参".

  Return JSON ONLY:
  [
    {
      "title": "...",
      "hudScenario": "详细描述：[谁] 使用它来 [做什么] 并得到 [什么结果]",
      "output": "Copyable/Exportable result",
      "coreInteractions": ["描述性步骤1", "描述性步骤2", "描述性步骤3"],
      "selfHealing": ["增强鲁棒性方案1", "方案2", "方案3"],
      "keywords": ["domain1", "domain2"],
      "mockDataStrategy": "详细的本地 Mock 逻辑方案",
      "complexityBudget": {"minutes": 60, "screens": 2, "interactions": 3},
      "sources": [{"title": "source", "url": "..."}]
    }
  ]
  `;

  const result = await callWithRetry(
    () => callLLM(prompt, config.azure),
    (text) => extractJsonArray(text),
    { maxAttempts: 2, delayMs: 3000, logDir: path.join(LOGS_DIR, 'diagnostics'), runId, operationName: 'ideator' }
  );

  let ideas = [];
  if (result.ok) {
    ideas = (Array.isArray(result.value) ? result.value : []).map(normalizeIdea).filter(Boolean);
  }

  await eventLog.emit('ideator.complete', { runId, candidateCount: ideas.length });
  console.log(`[Agent:Ideator] Generated ${ideas.length} candidate ideas`);
  return ideas;
}

// =====================================================================
//  AGENT 3b: CRITIC / EVALUATOR – Score & filter candidates
// =====================================================================

async function agentCritic(candidateIdeas, diversityPlan, config, eventLog, runId) {
  console.log(`[Agent:Critic] Evaluating ${candidateIdeas.length} candidates...`);

  const ideasForReview = candidateIdeas.map((idea, i) => ({
    idx: i,
    title: idea.title,
    hudScenario: idea.hudScenario,
    keywords: idea.keywords,
    coreInteractions: idea.coreInteractions,
  }));

  const prompt = `
  Review these ${candidateIdeas.length} micro-app idea candidates:
  ${JSON.stringify(ideasForReview, null, 1)}

  Evaluate EACH idea on 4 dimensions (0-10 scale):
  1. **novelty**: How unique/fresh is this? (0=boring clone, 10=never seen before)
  2. **feasibility**: Can it be built in React+Tailwind in 60 mins with NO backend? (0=impossible, 10=trivial)
  3. **coverage**: Does it explore a domain or interaction style that's DIFFERENT from others in this batch? (0=redundant, 10=fills a unique gap)
  4. **risk**: How likely is it to fail during build? (0=safe, 10=very risky)

  CRITICAL: Also check tech feasibility:
  - If it requires native binary APIs, hardware access, or real backend → feasibility = 0
  - If "coreInteractions" are just labels, not descriptive actions → coverage = max 3
  - If it's essentially a CRUD form → novelty = max 2

  IMPORTANT: Output in ${LANG}.

  Return JSON ONLY:
  [
    {
      "ideaIdx": 0,
      "novelty": 7,
      "feasibility": 8,
      "coverage": 6,
      "risk": 2,
      "reason": "一句话评价"
    },
    ...
  ]
  `;

  const result = await callWithRetry(
    () => callLLM(prompt, config.azure),
    (text) => extractJsonArray(text),
    { maxAttempts: 2, delayMs: 2000, logDir: path.join(LOGS_DIR, 'diagnostics'), runId, operationName: 'critic' }
  );

  // Build score cards
  const scoreCards = [];
  if (result.ok && Array.isArray(result.value)) {
    for (const raw of result.value) {
      const idx = Number(raw.ideaIdx ?? raw.idx ?? -1);
      if (idx < 0 || idx >= candidateIdeas.length) continue;
      const card = normalizeScoreCard({
        ideaId: candidateIdeas[idx].id,
        novelty: raw.novelty,
        feasibility: raw.feasibility,
        coverage: raw.coverage,
        risk: raw.risk,
        reason: raw.reason,
      });
      computeTotalScore(card);
      scoreCards.push(card);
    }
  }

  // Fallback: if critic failed, score all equally
  if (scoreCards.length === 0) {
    console.warn('[Agent:Critic] Evaluation failed, using fallback equal scores');
    for (const idea of candidateIdeas) {
      const card = normalizeScoreCard({ ideaId: idea.id, novelty: 5, feasibility: 5, coverage: 5, risk: 3 });
      computeTotalScore(card);
      scoreCards.push(card);
    }
  }

  // Sort by total score descending
  scoreCards.sort((a, b) => b.totalScore - a.totalScore);

  await eventLog.emit('critic.complete', { runId, evaluatedCount: scoreCards.length, topScore: scoreCards[0]?.totalScore });
  console.log(`[Agent:Critic] Evaluated ${scoreCards.length} ideas, top score: ${scoreCards[0]?.totalScore}`);

  return scoreCards;
}

// =====================================================================
//  AGENT 4: TREND SUMMARIZER
// =====================================================================

async function agentSummarizer(researchContext, config, _eventLog, _runId) {
  console.log('[Agent:Summarizer] Creating trends report...');
  const prompt = `
  Based on the following research context, generate a high-quality Markdown report highlighting the most interesting digital tool trends and opportunities for innovation.
  
  Research Context:
  ${researchContext.slice(0, 5000)}
  
  Requirements:
  1. Title should be "AI-Native Trends & Opportunities".
  2. Language MUST be ${LANG}.
  3. Focus on "Micro-Apps" and "Combinatorial Innovation".
  4. Include 3-4 key trend pillars with brief descriptions.
  5. Suggest 2-3 "Wildcard" ideas that bridge unexpected categories.
  6. **CRITICAL: Include a "References & Sources" section at the end with [Title](URL) links for all major facts mentioned.**
  
  Output ONLY the Markdown content.
  `;
  return callLLM(prompt, config.azure);
}

// =====================================================================
//  ORCHESTRATOR – Multi-agent pipeline
// =====================================================================

async function main() {
  const config = await loadConfig();
  const runId = generateRunId();
  const eventLog = createEventLogger({ logDir: LOGS_DIR });

  await eventLog.emit('research_pipeline.start', { runId });
  console.log(`[Orchestrator] RunId: ${runId} – Starting multi-agent research pipeline`);
  
  // ---- Phase 1: PLANNER agent ----
  const { queries, diversityPlan } = await agentPlanner(config, eventLog, runId);
  console.log(`[Orchestrator] Planner produced ${queries.length} queries`);
  
  // ---- Phase 2: RESEARCHER agent (parallel evidence gathering) ----
  const { context: researchContext, sources } = await agentResearcher(queries, config, eventLog, runId);

  // ---- Phase 3: TREND SUMMARIZER agent (runs in parallel with ideation) ----
  const [trendsReport, candidateIdeas] = await Promise.all([
    agentSummarizer(researchContext, config, eventLog, runId),
    agentIdeator(researchContext, diversityPlan, config, eventLog, runId),
  ]);

  // Save trends report
  await fs.writeFile(TRENDS_REPORT, trendsReport);
  console.log(`[Orchestrator] Trends report updated`);

  // Save sources
  await writeJsonAtomic(SOURCES_DATA, { updated: new Date().toISOString(), sources });
  console.log(`[Orchestrator] Sources data updated`);

  // ---- Phase 4: CRITIC agent ----
  const scoreCards = await agentCritic(candidateIdeas, diversityPlan, config, eventLog, runId);

  // ---- Phase 5: SELECTION – diversity-aware quota-based picking ----
  const targetCount = diversityPlan.targetCount || 8;
  const selectedIdeas = [];
  const scoreMap = new Map(scoreCards.map(c => [c.ideaId, c]));
  const usedDomains = new Set();
  const usedInteractions = new Set();

  // First pass: pick top-scoring ideas that fill diversity gaps
  const sortedCandidates = [...candidateIdeas].sort((a, b) => {
    const sa = scoreMap.get(a.id)?.totalScore || 0;
    const sb = scoreMap.get(b.id)?.totalScore || 0;
    return sb - sa;
  });

  for (const idea of sortedCandidates) {
    if (selectedIdeas.length >= targetCount) break;

    // Diversity check: does this idea add a new domain or interaction?
    const newDomains = (idea.keywords || []).filter(k => !usedDomains.has(k));
    const interactions = (idea.coreInteractions || []).map(c => c.split(/[：:]/)[0]?.trim().toLowerCase());
    const newInteractions = interactions.filter(i => !usedInteractions.has(i));

    const card = scoreMap.get(idea.id);
    const score = card?.totalScore || 0;

    // Boost if it fills a gap (accept even slightly lower-scoring if diverse)
    const diversityBonus = (newDomains.length > 0 ? 1 : 0) + (newInteractions.length > 0 ? 0.5 : 0);

    // Minimum quality threshold (use effective score = base + diversity bonus)
    if ((score + diversityBonus) < 2 && diversityBonus === 0) continue;

    selectedIdeas.push({ ...idea, _score: card });
    for (const kw of (idea.keywords || [])) usedDomains.add(kw);
    for (const i of interactions) usedInteractions.add(i);
  }

  console.log(`[Orchestrator] Selected ${selectedIdeas.length}/${candidateIdeas.length} ideas (${usedDomains.size} domains, ${usedInteractions.size} interactions)`);

  // ---- Phase 6: Research log ----
  try {
    const researchLogsDir = path.join(DATA, 'research_logs');
    await fs.mkdir(researchLogsDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotName = `research_${ts}.md`;
    const logPath = path.join(researchLogsDir, snapshotName);
    const logMd = [
      `# Multi-Agent Research Run ${new Date().toISOString()}`,
      `**RunId**: ${runId}`,
      ``,
      `## Diversity Plan`,
      '```json',
      JSON.stringify(diversityPlan, null, 2),
      '```',
      ``,
      `## Selected Queries`,
      '```json',
      JSON.stringify(queries, null, 2),
      '```',
      ``,
      `## Sources (${sources.length})`,
      ...(sources || []).map(s => `- [${s.title}](${s.url})`),
      ``,
      `## Candidate Scores`,
      '```json',
      JSON.stringify(scoreCards.slice(0, 20), null, 2),
      '```',
      ``,
      `## Trends Report`,
      trendsReport,
      ``,
    ].join('\n');
    await fs.writeFile(logPath, logMd);
    console.log(`[Orchestrator] Research log → ${logPath}`);

    const indexPath = path.join(DATA, 'research_index.md');
    const indexEntry = `| ${new Date().toLocaleString()} | [${snapshotName}](./research_logs/${snapshotName}) | ${queries.slice(0, 3).join(', ')} | Multi-Agent | ${selectedIdeas.length} |\n`;
    let indexContent = '';
    try { indexContent = await fs.readFile(indexPath, 'utf8'); } catch {
      indexContent = `# Research & Generation Index\n\n| Date | Report Link | Categories | Styles | Ideas |\n| :--- | :--- | :--- | :--- | :--- |\n`;
    }
    await fs.writeFile(indexPath, indexContent + indexEntry);
  } catch (e) {
    console.warn(`[Orchestrator] Failed to write research log: ${e.message}`);
  }

  // ---- Phase 7: Dedupe & Save to backlog (atomic + locked) ----
  await withFileLock(BACKLOG, async () => {
    const backlog = normalizeIdeaList(await readJsonSafe(BACKLOG, { ideas: [] }));

    let added = 0;
    let skipped = 0;
    const byId = new Map(backlog.ideas.map(x => [String(x.id), x]));

    for (const idea of selectedIdeas) {
      const query = `${idea.title} ${idea.hudScenario}`;
      const sim = await isTooSimilar({ query, indexPath: RAG_INDEX, threshold: 0.72 });
      
      if (sim.tooSimilar) {
        console.log(`[Dedupe] Skipping: ${idea.title} (${sim.method} score=${sim.best?.score?.toFixed?.(3)})`);
        skipped++;
      } else {
        idea.id = idea.id || `idea_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        idea.createdAt = new Date().toISOString();
        idea.runId = runId;
        // Remove internal scoring data before saving
        delete idea._score;
        if (!byId.has(idea.id)) {
          byId.set(idea.id, idea);
          added++;
          console.log(`[Backlog] + ${idea.title}`);
        }
      }
    }

    backlog.ideas = Array.from(byId.values());
    backlog.updatedAt = new Date().toISOString();
    await writeJsonAtomic(BACKLOG, backlog);

    await eventLog.emit('research_pipeline.complete', {
      runId,
      queriesCount: queries.length,
      sourcesCount: sources.length,
      candidatesGenerated: candidateIdeas.length,
      evaluated: scoreCards.length,
      selected: selectedIdeas.length,
      added,
      skippedDedupe: skipped,
      domainsUsed: [...usedDomains],
      interactionsUsed: [...usedInteractions],
    });

    console.log(`[Orchestrator] Pipeline complete: +${added} ideas, ${skipped} deduped, ${usedDomains.size} domains covered`);
  });
}

main().catch(console.error);
