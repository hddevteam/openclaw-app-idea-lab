/**
 * Research Pipeline – shared orchestration skeleton.
 *
 * Both Research V2 (trend-driven) and Targeted Research (anchor-driven) share
 * the same pipeline structure: plan → research → ideate → critique → select → persist.
 *
 * This module provides:
 *   - runResearchPipeline()       – the orchestrator (accepts injectable phase strategies)
 *   - defaultResearchPhase()      – shared researcher (search → fetch → build context)
 *   - defaultCritiquePhase()      – shared critic (score on 4 dimensions)
 *   - defaultSelectionPhase()     – shared selector (diversity-aware picking)
 *
 * Mode-specific behavior (V2 query planning, targeted perspective-diverse ideation)
 * is injected via the `phases` parameter.
 *
 * See: §6.3 of 01_targeted_research_design.md
 */

import { callWithRetry, extractJsonArray } from '../../../shared/extract_json.mjs';
import { normalizeScoreCard, computeTotalScore } from '../../../shared/json_contract.mjs';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Shared Phase: RESEARCH – search → fetch → build context
// ---------------------------------------------------------------------------

/**
 * Execute search queries, fetch pages, build research context.
 * Identical for V2 and Targeted – the only difference is the queries themselves.
 *
 * @param {string[]} queries
 * @param {{ llm, search, fetcher }} providers
 * @param {{ runId, eventLog }} ctx
 * @returns {Promise<{ researchContext: string, sources: object[], evidence: object[] }>}
 */
export async function defaultResearchPhase(queries, providers, ctx) {
  const { llm, search, fetcher } = providers;
  const { eventLog, runId } = ctx;

  console.log('[Research] Executing parallel evidence gathering...');
  let researchContext = '';
  const sources = [];
  const evidence = [];

  const SEARCH_DELAY_MS = 1200; // Brave rate-limit safe gap between searches
  const searchResults = [];
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await sleep(SEARCH_DELAY_MS);
    searchResults.push(await search.web(queries[i]));
  }

  const BATCH_SIZE = 3; // fetch batch size (page retrieval)
  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const batch = queries.slice(i, i + BATCH_SIZE);

    for (let j = 0; j < batch.length; j++) {
      const q = batch[j];
      const results = (searchResults[i + j]?.results) || [];
      if (results.length === 0) continue;

      // Smart source selection via LLM
      const candidateList = results
        .slice(0, 4)
        .map((r, idx) => `${idx}: ${r.title} - ${r.url} - ${r.description}`)
        .join('\n');
      const selectPrompt =
        `From this search result list, return the indices of the TWO most insightful sources for technical inspiration. Discard SEO spam. JSON ONLY: [0, 1]\nResults:\n${candidateList}`;

      let picks = [0, 1];
      try {
        const resp = await llm.complete(selectPrompt);
        const match = resp.match(/\[.*\]/);
        if (match) picks = JSON.parse(match[0]);
      } catch { /* use defaults */ }

      researchContext += `\n### Search Query: ${q}\n`;

      for (const idx of picks) {
        const r = results[idx];
        if (!r) continue;
        sources.push({ title: r.title, url: r.url });
        const content = await fetcher.readText(r.url);
        if (content && content.length > 200) {
          researchContext += `- Source: ${r.title} (${r.url})\n  Content: ${content}\n`;
          evidence.push({ claim: r.title, evidenceUrl: r.url, snippet: content.slice(0, 300) });
        } else {
          researchContext += `- Source: ${r.title}: ${r.description}\n`;
          evidence.push({ claim: r.title, evidenceUrl: r.url, snippet: r.description || '' });
        }
        await sleep(800);
      }
    }
  }

  if (eventLog) {
    await eventLog.emit('researcher.complete', { runId, sourcesCount: sources.length, evidenceCount: evidence.length });
  }
  console.log(`[Research] Gathered ${sources.length} sources, ${evidence.length} evidence items`);
  return { researchContext, sources, evidence };
}

// ---------------------------------------------------------------------------
// Shared Phase: CRITIQUE – score candidates
// ---------------------------------------------------------------------------

/**
 * Score candidate ideas on novelty/feasibility/coverage/risk.
 * Mode-specific wrappers can extend (e.g., targeted adds diversity_score).
 */
export async function defaultCritiquePhase(candidateIdeas, providers, ctx) {
  const { llm } = providers;
  const { eventLog, runId, logDir, lang = 'zh-CN' } = ctx;

  console.log(`[Critique] Evaluating ${candidateIdeas.length} candidates...`);

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

  Evaluate EACH on 4 dimensions (0-10):
  1. **novelty**: uniqueness (0=clone, 10=never seen)
  2. **feasibility**: buildable in React+Tailwind 60m, no backend? (0=impossible, 10=trivial)
  3. **coverage**: explores a different domain/interaction from others? (0=redundant, 10=unique gap)
  4. **risk**: likelihood of build failure (0=safe, 10=very risky)

  Tech feasibility:
  - Needs native APIs/backend → feasibility = 0
  - Non-descriptive coreInteractions → coverage ≤ 3
  - CRUD form → novelty ≤ 2

  Output in ${lang}. JSON ONLY:
  [{ "ideaIdx": 0, "novelty": 7, "feasibility": 8, "coverage": 6, "risk": 2, "reason": "..." }]
  `;

  const result = await callWithRetry(
    () => llm.complete(prompt),
    (text) => extractJsonArray(text),
    { maxAttempts: 2, delayMs: 2000, logDir, runId, operationName: 'critic' },
  );

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

  // Fallback: equal scores
  if (scoreCards.length === 0) {
    console.warn('[Critique] Evaluation failed, fallback equal scores');
    for (const idea of candidateIdeas) {
      const card = normalizeScoreCard({ ideaId: idea.id, novelty: 5, feasibility: 5, coverage: 5, risk: 3 });
      computeTotalScore(card);
      scoreCards.push(card);
    }
  }

  scoreCards.sort((a, b) => b.totalScore - a.totalScore);

  if (eventLog) {
    await eventLog.emit('critic.complete', { runId, evaluatedCount: scoreCards.length, topScore: scoreCards[0]?.totalScore });
  }
  console.log(`[Critique] ${scoreCards.length} scored, top: ${scoreCards[0]?.totalScore}`);
  return scoreCards;
}

// ---------------------------------------------------------------------------
// Shared Phase: SELECTION – diversity-aware picking
// ---------------------------------------------------------------------------

/**
 * Pick top ideas with diversity quotas.
 *
 * @param {object[]} candidateIdeas
 * @param {object[]} scoreCards
 * @param {object} planMeta – must include targetCount
 * @returns {{ selectedIdeas: object[], usedDomains: string[], usedInteractions: string[] }}
 */
export function defaultSelectionPhase(candidateIdeas, scoreCards, planMeta, _ctx) {
  const targetCount = planMeta.targetCount || 8;
  const selectedIdeas = [];
  const scoreMap = new Map(scoreCards.map(c => [c.ideaId, c]));
  const usedDomains = new Set();
  const usedInteractions = new Set();

  const sorted = [...candidateIdeas].sort((a, b) => {
    return (scoreMap.get(b.id)?.totalScore || 0) - (scoreMap.get(a.id)?.totalScore || 0);
  });

  for (const idea of sorted) {
    if (selectedIdeas.length >= targetCount) break;

    const newDomains = (idea.keywords || []).filter(k => !usedDomains.has(k));
    const interactions = (idea.coreInteractions || [])
      .map(c => c.split(/[：:]/)[0]?.trim().toLowerCase());
    const newInteractions = interactions.filter(i => !usedInteractions.has(i));

    const score = scoreMap.get(idea.id)?.totalScore || 0;
    const diversityBonus = (newDomains.length > 0 ? 1 : 0) + (newInteractions.length > 0 ? 0.5 : 0);

    if ((score + diversityBonus) < 2 && diversityBonus === 0) continue;

    selectedIdeas.push({ ...idea, _score: scoreMap.get(idea.id) });
    for (const kw of (idea.keywords || [])) usedDomains.add(kw);
    for (const i of interactions) usedInteractions.add(i);
  }

  console.log(`[Select] ${selectedIdeas.length}/${candidateIdeas.length} ideas (${usedDomains.size} domains)`);
  return {
    selectedIdeas,
    usedDomains: [...usedDomains],
    usedInteractions: [...usedInteractions],
  };
}

// ---------------------------------------------------------------------------
// Pipeline Runner
// ---------------------------------------------------------------------------

/**
 * Run the complete research pipeline with injectable phase strategies.
 *
 * @param {object} opts
 * @param {object} opts.providers – { llm, search, fetcher, store, clock, rng }
 * @param {object} opts.phases
 * @param {Function} opts.phases.plan       – (providers, ctx) => { queries, planMeta }
 * @param {Function} [opts.phases.research] – defaults to defaultResearchPhase
 * @param {Function} opts.phases.ideate     – (researchContext, planMeta, providers, ctx) => ideas[]
 * @param {Function} [opts.phases.critique] – defaults to defaultCritiquePhase
 * @param {Function} [opts.phases.select]   – defaults to defaultSelectionPhase
 * @param {Function} [opts.phases.summarize]– (researchContext, providers, ctx) => string
 * @param {Function} opts.phases.persist    – (result, providers, ctx) => void
 * @param {string} opts.runId
 * @param {object} [opts.eventLog]
 * @param {string} [opts.logDir]
 * @param {string} [opts.lang]
 * @returns {Promise<object>} pipeline result
 */
export async function runResearchPipeline({ providers, phases, runId, eventLog, logDir, lang, ...extra }) {
  const ctx = { runId, eventLog, logDir, lang, ...extra };

  if (eventLog) await eventLog.emit('research_pipeline.start', { runId });
  console.log(`[Pipeline] RunId: ${runId}`);

  // Phase 1: Plan
  const { queries, planMeta } = await phases.plan(providers, ctx);
  console.log(`[Pipeline] ${queries.length} queries planned`);

  // Phase 2: Research
  const researchFn = phases.research || defaultResearchPhase;
  const { researchContext, sources, evidence } = await researchFn(queries, providers, ctx);

  // Phase 3: Ideate (+optional summarize in parallel)
  const ideateP = phases.ideate(researchContext, planMeta, providers, ctx);
  const summarizeP = phases.summarize
    ? phases.summarize(researchContext, providers, ctx)
    : Promise.resolve(null);
  const [candidateIdeas, summaryReport] = await Promise.all([ideateP, summarizeP]);

  // Phase 4: Critique
  const critiqueFn = phases.critique || defaultCritiquePhase;
  const scoreCards = await critiqueFn(candidateIdeas, providers, ctx);

  // Phase 5: Select
  const selectFn = phases.select || defaultSelectionPhase;
  const selection = selectFn(candidateIdeas, scoreCards, planMeta, ctx);

  // Assemble result
  const result = {
    queries,
    sources,
    evidence,
    candidateIdeas,
    scoreCards,
    summaryReport,
    planMeta,
    ...selection,
  };

  // Phase 6: Persist
  await phases.persist(result, providers, ctx);

  if (eventLog) {
    await eventLog.emit('research_pipeline.complete', {
      runId,
      queriesCount: queries.length,
      sourcesCount: sources.length,
      candidatesGenerated: candidateIdeas.length,
      selected: selection.selectedIdeas.length,
    });
  }

  console.log(`[Pipeline] Complete: ${selection.selectedIdeas.length} ideas selected`);
  return result;
}
