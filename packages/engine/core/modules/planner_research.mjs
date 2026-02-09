/**
 * Research V2 (trend-driven) – multi-agent pipeline.
 *
 * Refactored to use research_pipeline.mjs shared skeleton + research_providers.mjs.
 * Run: node planner_research.mjs
 *
 * V2-specific behaviour:
 *   - Plan: diversity-aware query generation (random-domain exploration)
 *   - Ideate: broad micro-app ideas with domain/interaction quotas
 *   - Summarize: trend report in Markdown (runs in parallel with ideation)
 *   - Persist: trends report, sources, research log, dedupe & backlog merge
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTooSimilar } from './rag_dedupe.mjs';
import { callWithRetry, extractJson, extractJsonArray } from '../../../shared/extract_json.mjs';
import { normalizeIdea, normalizeIdeaList, normalizeDiversityPlan } from '../../../shared/json_contract.mjs';
import { createEventLogger, generateRunId } from '../../../shared/event_logger.mjs';
import { createProviders } from './research_providers.mjs';
import { runResearchPipeline } from './research_pipeline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.DAILY_APP_LAB_ROOT || path.resolve(HERE, '..', '..'));
const DATA = path.join(ROOT, 'runtime', 'data');
const LOGS_DIR = path.join(ROOT, 'runtime', 'logs');
const BACKLOG = path.join(DATA, 'idea_backlog.json');
const TRENDS_REPORT = path.join(DATA, 'trends_report.md');
const SOURCES_DATA = path.join(DATA, 'idea_sources.json');
const RAG_INDEX = path.join(DATA, 'rag_projects_index.json');

const LANG = process.env.DAILY_APP_LAB_LANG || 'zh-CN';

// =====================================================================
//  V2-specific Pipeline Phases
// =====================================================================

async function v2PlanPhase(providers, ctx) {
  const { llm, search, store } = providers;
  const { eventLog, runId, logDir } = ctx;

  console.log('[V2:Planner] Creating diversity-aware research plan...');

  let previousTrends = '';
  try {
    previousTrends = await store.readText(TRENDS_REPORT);
    previousTrends = 'RECENT TRENDS ANALYZED YESTERDAY:\n' + previousTrends.slice(0, 1000);
  } catch { /* no previous trends */ }

  let existingKeywords = [];
  try {
    const backlog = await store.readJson(BACKLOG, { ideas: [] });
    const ideas = backlog.ideas || backlog.items || [];
    existingKeywords = ideas.flatMap(i => i.keywords || []);
  } catch { /* ignore */ }

  const prompt = `
  ${previousTrends}

  Current backlog keyword distribution: [${[...new Set(existingKeywords)].slice(0, 30).join(', ')}]

  Task: Create A DIVERSITY PLAN and search queries for discovering fresh micro-app ideas.

  STEP 1 – Diversity Assessment:
  - Identify which domains from [food-bev, construction, agriculture, beauty, logistics, retail, parenting, education, fitness, music, content-creation, finance, health, crafts, pet-care, real-estate, game, productivity, design, dev-tools, social] are UNDERREPRESENTED in the current backlog.
  - Identify which interaction primitives from [drag-drop, swipe, pinch-zoom, long-press, slider, toggle, canvas-draw, timeline, card-stack, sort-filter, scroll-reveal, gesture-ring, shake, voice-input, camera-feed, tap-counter] are MISSING.
  - CRITICAL: Prioritize domains that serve NON-tech workers (餐饮/工地/美容/物流/农业/小商户/家长/学生/健身教练).

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
    () => llm.complete(prompt),
    (text) => {
      const obj = extractJson(text);
      if (obj.ok && !Array.isArray(obj.value) && obj.value && Array.isArray(obj.value.queries)) {
        return { ok: true, value: obj.value };
      }
      return extractJsonArray(text);
    },
    { maxAttempts: 2, delayMs: 2000, logDir, runId, operationName: 'planner' },
  );

  let queries = [];
  let diversityPlan = {};
  if (result.ok) {
    const val = result.value;
    if (Array.isArray(val)) {
      queries = val;
    } else if (val?.queries) {
      queries = val.queries;
      diversityPlan = val.diversityPlan || {};
    }
  }

  // Dynamic fallback: use Brave Search to discover real-time trends for gap domains
  if (queries.length === 0) {
    console.warn('[V2:Planner] LLM planner failed, building search-driven fallback queries');
    const ALL_DOMAINS = [
      'food-bev', 'construction', 'agriculture', 'beauty', 'logistics', 'retail',
      'parenting', 'education', 'fitness', 'music', 'content-creation', 'finance',
      'health', 'crafts', 'pet-care', 'real-estate', 'game', 'productivity', 'design', 'dev-tools',
    ];
    const covered = new Set(existingKeywords.map(k => k.toLowerCase()));
    const gaps = ALL_DOMAINS.filter(d => !covered.has(d));
    const targets = gaps.length >= 4
      ? gaps.slice(0, 4)
      : ALL_DOMAINS.sort(() => Math.random() - 0.5).slice(0, 4);

    const seedResults = await Promise.all(
      targets.map(d => search.web(`${d} micro-app trending tool 2026`)),
    );

    for (let i = 0; i < targets.length; i++) {
      const domain = targets[i];
      const results = seedResults[i].results || [];
      if (results.length > 0) {
        const topTitles = results.slice(0, 3).map(r => r.title).join(' | ');
        queries.push(`${domain} app like: ${topTitles}`);
        const snippets = results.slice(0, 2).map(r => (r.description || '').slice(0, 40)).filter(Boolean).join(' ');
        if (snippets) queries.push(`${domain}领域 类似 ${snippets} 的创新微应用`);
      } else {
        queries.push(`innovative ${domain} micro-app indie developer tools 2026`);
        queries.push(`${domain}领域 创新微应用 移动端痛点 2026`);
      }
    }
    queries = queries.slice(0, 8);
    console.log(`[V2:Planner] Fallback generated ${queries.length} queries from ${targets.length} gap domains`);
  }

  diversityPlan = normalizeDiversityPlan(diversityPlan);

  if (eventLog) await eventLog.emit('planner.complete', { runId, queryCount: queries.length, diversityPlan });
  console.log(`[V2:Planner] ${queries.length} queries planned, targeting ${diversityPlan.minDomains} domains`);

  return { queries, planMeta: diversityPlan };
}

async function v2IdeatePhase(researchContext, planMeta, providers, ctx) {
  const { llm } = providers;
  const { eventLog, runId, logDir } = ctx;

  console.log('[V2:Ideator] Generating diverse candidate ideas...');

  const targetCount = (planMeta.targetCount || 8) * 2; // generate 2x for selection

  const prompt = `
  Context from Global & Local App Research:
  ${researchContext.slice(0, 10000)}

  Diversity Requirements:
  - Generate ${targetCount} "Micro-App" ideas (we'll select the best half later)
  - MUST cover these underrepresented domains: ${JSON.stringify(planMeta.underrepresentedDomains || planMeta.validDomains?.slice(0, 6))}
  - MUST use at least ${planMeta.minInteractions || 4} DIFFERENT interaction primitives from: ${JSON.stringify(planMeta.validInteractions || [])}
  - NO TWO ideas should share the SAME primary domain + interaction combination
  
  IMPORTANT: All fields in the resulting JSON MUST be written in ${LANG}. 
  
  Philosophy: "Simple, Fast, Tactile, Self-Contained".
  
  Hard Constraints:
  1. NO Login, NO Backend, NO Paid Keys.
  2. Must be buildable in React+Tailwind in < 60 mins.
  3. Use local mock data or browser APIs (localStorage, Canvas, Web Audio, WebRTC) when real data isn't available.
  4. BANNED TITLE WORDS: Do NOT use "模拟器", "模拟", "演练", "离线" in titles.
  5. BANNED PATTERNS: No "XX参数调节器", "XX手感实验室".
  6. TARGET REAL INDUSTRY PERSONAS (at least HALF of ideas must be for NON-tech workers):
     - 🍳 餐饮: recipe costing, prep timer, menu maker
     - 🏗️ 工地/维修: measurement converter, material estimator, safety checklist
     - 💇 美容/手艺: appointment card, portfolio showcase, color mixer
     - 🏪 小商户/摊贩: daily tally, inventory countdown, price tag maker
     - 👶 家长/护理: medication schedule, growth tracker, meal planner
     - 🎓 学生/考生: flashcard battle, formula quick-ref, study timer
     - 🏋️ 健身教练: rep counter, circuit builder, progress card
     - 🚚 物流/快递: route sorter, delivery receipt maker
     - 🌾 农业: planting calendar, harvest tracker
     - 📸 内容创作者: thumbnail composer, caption generator
  7. Also consider: calculators for specific trades, checklist/SOP builders, one-day dashboards, randomizers, timers with presets, camera→organize→export tools.
  8. Each idea must feel like a COMPLETE tiny product for a SPECIFIC persona.
  9. The hudScenario must name a SPECIFIC persona (如 "街边奶茶店老板"), not generic "用户".

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
    () => llm.complete(prompt),
    (text) => extractJsonArray(text),
    { maxAttempts: 2, delayMs: 3000, logDir, runId, operationName: 'ideator' },
  );

  let ideas = [];
  if (result.ok) {
    ideas = (Array.isArray(result.value) ? result.value : []).map(normalizeIdea).filter(Boolean);
  }

  if (eventLog) await eventLog.emit('ideator.complete', { runId, candidateCount: ideas.length });
  console.log(`[V2:Ideator] Generated ${ideas.length} candidate ideas`);
  return ideas;
}

async function v2SummarizePhase(researchContext, providers, _ctx) {
  console.log('[V2:Summarizer] Creating trends report...');
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
  return providers.llm.complete(prompt);
}

async function v2PersistPhase(result, providers, ctx) {
  const { selectedIdeas, sources, scoreCards, summaryReport, queries, planMeta, usedDomains, usedInteractions } = result;
  const { store, clock, rng } = providers;
  const { runId, eventLog } = ctx;

  // Save trends report
  if (summaryReport) {
    await store.writeText(TRENDS_REPORT, summaryReport);
    console.log('[V2:Persist] Trends report updated');
  }

  // Save sources
  await store.writeJson(SOURCES_DATA, { updated: clock.now(), sources });
  console.log('[V2:Persist] Sources data updated');

  // Research log
  try {
    const researchLogsDir = path.join(DATA, 'research_logs');
    await store.mkdir(researchLogsDir);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotName = `research_${ts}.md`;
    const logPath = path.join(researchLogsDir, snapshotName);
    const logMd = [
      `# Multi-Agent Research Run ${new Date().toISOString()}`,
      `**RunId**: ${runId}`,
      '',
      '## Diversity Plan',
      '```json',
      JSON.stringify(planMeta, null, 2),
      '```',
      '',
      '## Selected Queries',
      '```json',
      JSON.stringify(queries, null, 2),
      '```',
      '',
      `## Sources (${sources.length})`,
      ...(sources || []).map(s => `- [${s.title}](${s.url})`),
      '',
      '## Candidate Scores',
      '```json',
      JSON.stringify(scoreCards.slice(0, 20), null, 2),
      '```',
      '',
      '## Trends Report',
      summaryReport || '(none)',
      '',
    ].join('\n');
    await store.writeText(logPath, logMd);
    console.log(`[V2:Persist] Research log → ${logPath}`);

    const indexPath = path.join(DATA, 'research_index.md');
    const indexEntry = `| ${new Date().toLocaleString()} | [${snapshotName}](./research_logs/${snapshotName}) | ${queries.slice(0, 3).join(', ')} | Multi-Agent | ${selectedIdeas.length} |\n`;
    let indexContent = '';
    try { indexContent = await store.readText(indexPath); } catch {
      indexContent = `# Research & Generation Index\n\n| Date | Report Link | Categories | Styles | Ideas |\n| :--- | :--- | :--- | :--- | :--- |\n`;
    }
    await store.writeText(indexPath, indexContent + indexEntry);
  } catch (e) {
    console.warn(`[V2:Persist] Failed to write research log: ${e.message}`);
  }

  // Dedupe & Save to backlog (atomic + locked)
  await store.withLock(BACKLOG, async () => {
    const backlog = normalizeIdeaList(await store.readJson(BACKLOG, { ideas: [] }));

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
        idea.id = idea.id || `idea_${rng.id()}`;
        idea.createdAt = clock.now();
        idea.runId = runId;
        delete idea._score;
        if (!byId.has(idea.id)) {
          byId.set(idea.id, idea);
          added++;
          console.log(`[Backlog] + ${idea.title}`);
        }
      }
    }

    backlog.ideas = Array.from(byId.values());
    backlog.updatedAt = clock.now();
    await store.writeJson(BACKLOG, backlog);

    if (eventLog) {
      await eventLog.emit('research_pipeline.saved', {
        runId,
        queriesCount: queries.length,
        sourcesCount: sources.length,
        candidatesGenerated: result.candidateIdeas?.length || 0,
        evaluated: scoreCards.length,
        selected: selectedIdeas.length,
        added,
        skippedDedupe: skipped,
        domainsUsed: usedDomains,
        interactionsUsed: usedInteractions,
      });
    }

    console.log(`[V2:Persist] Pipeline complete: +${added} ideas, ${skipped} deduped, ${usedDomains?.length || 0} domains covered`);
  });
}

// =====================================================================
//  V2 Pipeline Phase Assembly
// =====================================================================

export const v2Phases = {
  plan: v2PlanPhase,
  // research: uses default from pipeline (defaultResearchPhase)
  ideate: v2IdeatePhase,
  // critique: uses default from pipeline (defaultCritiquePhase)
  // select: uses default from pipeline (defaultSelectionPhase)
  summarize: v2SummarizePhase,
  persist: v2PersistPhase,
};

// =====================================================================
//  CLI Entrypoint
// =====================================================================

async function main() {
  const providers = await createProviders();
  const runId = generateRunId();
  const eventLog = createEventLogger({ logDir: LOGS_DIR });

  await runResearchPipeline({
    providers,
    phases: v2Phases,
    runId,
    eventLog,
    logDir: path.join(LOGS_DIR, 'diagnostics'),
    lang: LANG,
  });
}

main().catch(console.error);
