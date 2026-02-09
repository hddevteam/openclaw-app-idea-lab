/**
 * Targeted Research Runner – anchor-driven research pipeline.
 *
 * Uses the shared research_pipeline.mjs skeleton with targeted-specific phases:
 *   - Plan: generate queries around a specific topic anchor (multi-lang)
 *   - Ideate: perspective-diverse idea generation (Refinement by Selection)
 *   - Critique: extends default with diversity_score penalty
 *   - Persist: tag ideas with campaign metadata, create campaign, merge backlog
 *
 * CLI: node targeted_research/runner.mjs --topic "摄影师资产维护工具" [--creative 0.7] [--count 8]
 * API: import { runTargetedResearch } from './runner.mjs'
 *
 * See: §2.1.1, §3, §6.1 of 01_targeted_research_design.md
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callWithRetry, extractJsonArray } from '../../../../shared/extract_json.mjs';
import { normalizeIdea, normalizeIdeaList } from '../../../../shared/json_contract.mjs';
import { createEventLogger, generateRunId } from '../../../../shared/event_logger.mjs';
import { createProviders } from '../research_providers.mjs';
import { runResearchPipeline, defaultCritiquePhase } from '../research_pipeline.mjs';
import { parseTargetedConfig, parseCliArgs } from './config.mjs';
import { buildCampaignId, buildTopicTag, createCampaignMeta, normalizeCampaignList } from './campaign.mjs';
import { tagIdea, buildIdeaId, mergeIntoBacklog } from './tagging.mjs';
import { buildPerspectivePrompt, parsePerspectiveTags, computeDiversityScore } from './perspective_slots.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = path.resolve(process.env.DAILY_APP_LAB_ROOT || path.resolve(HERE, '..', '..', '..'));
const DATA = path.join(ENGINE_ROOT, 'runtime', 'data');
const LOGS_DIR = path.join(ENGINE_ROOT, 'runtime', 'logs');
const BACKLOG = path.join(DATA, 'idea_backlog.json');
const CAMPAIGNS = path.join(DATA, 'campaigns.json');
const SOURCES_DATA = path.join(DATA, 'idea_sources.json');

const LANG = process.env.DAILY_APP_LAB_LANG || 'zh-CN';

// =====================================================================
//  Targeted-specific Pipeline Phases
// =====================================================================

/**
 * Plan phase: generate search queries around the topic anchor.
 * Multi-language strategy: zh-CN + en queries from a single topic.
 */
async function targetedPlanPhase(providers, ctx) {
  const { llm } = providers;
  const { runId, eventLog, logDir, targetedConfig } = ctx;
  const { topic, creative, count, searchLangs } = targetedConfig;

  console.log(`[Targeted:Plan] Topic: "${topic}", creative: ${creative}, count: ${count}`);

  // Build campaign identity
  const campaignId = buildCampaignId(topic, providers.clock);
  const topicTag = buildTopicTag(topic);

  const langInstruction = searchLangs.length > 1
    ? `Generate queries in BOTH ${searchLangs.join(' and ')} (roughly half-half).`
    : `Generate all queries in ${searchLangs[0]}.`;

  const queryCount = Math.max(4, Math.min(8, count));

  const prompt = `
  你需要围绕以下主题进行深度调研：
  主题：${topic}

  任务：生成 ${queryCount} 个精准的搜索查询，用于发现与该主题相关的：
  1. 技术现状 / 已有解决方案 / 竞品
  2. 竞品的痛点 / 用户抱怨
  3. 跨界交互灵感（其他领域的类似问题是怎么解决的）
  4. 垂直领域的边缘 Case（非显而易见的用户场景）

  ${langInstruction}

  创新程度: ${creative} (0=保守聚焦, 1=大胆跨界)
  ${creative > 0.7 ? '鼓励包含 1-2 个跨领域的创意搜索查询。' : '保持查询聚焦在核心主题周围。'}

  Return JSON ONLY (array of query strings):
  ["query1", "query2", ...]
  `;

  const result = await callWithRetry(
    () => llm.complete(prompt),
    (text) => extractJsonArray(text),
    { maxAttempts: 2, delayMs: 2000, logDir, runId, operationName: 'targeted-planner' },
  );

  let queries = [];
  if (result.ok && Array.isArray(result.value)) {
    queries = result.value.map(String).filter(Boolean);
  }

  // Fallback: construct basic queries from topic
  if (queries.length === 0) {
    console.warn('[Targeted:Plan] LLM failed, using template fallback');
    queries = [
      `${topic} 解决方案 工具 app`,
      `${topic} 用户痛点 问题`,
      `"${topic}" site:producthunt.com OR site:news.ycombinator.com`,
      `${topic} alternative tools 2026`,
    ];
    if (searchLangs.includes('en')) {
      queries.push(`${topic} indie developer tools`);
      queries.push(`${topic} open source solution`);
    }
  }

  const planMeta = {
    campaignId,
    topicTag,
    originalAnchor: topic,
    creative,
    targetCount: count,
    dimensions: ['scope', 'user', 'interaction'],
  };

  if (eventLog) {
    await eventLog.emit('targeted.plan.complete', { runId, campaignId, queryCount: queries.length });
  }
  console.log(`[Targeted:Plan] Campaign: ${campaignId}, ${queries.length} queries`);

  return { queries, planMeta };
}

/**
 * Ideate phase: perspective-diverse idea generation.
 * Injects Perspective Slots into the prompt to enforce diversity across dimensions.
 */
async function targetedIdeatePhase(researchContext, planMeta, providers, ctx) {
  const { llm } = providers;
  const { runId, eventLog, logDir } = ctx;
  const { originalAnchor, targetCount, creative, dimensions } = planMeta;

  console.log(`[Targeted:Ideate] Generating ${targetCount} perspective-diverse ideas...`);

  const perspectiveBlock = buildPerspectivePrompt(targetCount, dimensions);

  const prompt = `
  调研上下文：
  ${researchContext.slice(0, 8000)}

  用户需求锚点：${originalAnchor}
  创新程度：${creative}

  ${perspectiveBlock}

  基于以上调研上下文和需求锚点，生成 ${targetCount} 个 Micro-App idea。

  每个 idea 必须符合：
  1. 无后端、无登录、React+Tailwind 60分钟内可构建
  2. 使用本地 Mock 数据或浏览器 API
  3. hudScenario 必须指明具体人群（如"婚庆摄影师"）
  4. 每个 idea 附带 perspectiveTags 和 challengesOriginal 字段

  Return JSON ONLY:
  [
    {
      "title": "...",
      "hudScenario": "[谁] 使用它来 [做什么] 并得到 [什么结果]",
      "output": "用户获得的可导出结果",
      "coreInteractions": ["步骤1", "步骤2", "步骤3"],
      "selfHealing": ["鲁棒性方案1", "方案2"],
      "keywords": ["domain1", "domain2"],
      "mockDataStrategy": "本地 Mock 方案",
      "complexityBudget": {"minutes": 60, "screens": 2, "interactions": 3},
      "sources": [{"title": "...", "url": "..."}],
      "perspectiveTags": ["scope:mvp", "user:wedding-photographer", "interaction:visual"],
      "challengesOriginal": "对原始需求的隐含挑战说明"
    }
  ]
  `;

  const result = await callWithRetry(
    () => llm.complete(prompt),
    (text) => extractJsonArray(text),
    { maxAttempts: 2, delayMs: 3000, logDir, runId, operationName: 'targeted-ideator' },
  );

  let ideas = [];
  if (result.ok) {
    ideas = (Array.isArray(result.value) ? result.value : []).map(raw => {
      const idea = normalizeIdea(raw);
      if (!idea) return null;

      // Normalize perspective tags (failsafe: empty array if LLM didn't provide)
      idea.perspectiveTags = parsePerspectiveTags(raw.perspectiveTags);
      idea.challengesOriginal = String(raw.challengesOriginal || '').trim();

      return idea;
    }).filter(Boolean);
  }

  // Assign deterministic IDs
  ideas.forEach((idea, i) => {
    idea.id = buildIdeaId(planMeta.campaignId, i);
  });

  if (eventLog) {
    await eventLog.emit('targeted.ideate.complete', { runId, candidateCount: ideas.length });
  }
  console.log(`[Targeted:Ideate] Generated ${ideas.length} perspective-diverse ideas`);
  return ideas;
}

/**
 * Critique phase: extends default critique with diversity_score.
 * Penalises ideas whose perspectiveTags overlap too much with siblings.
 */
async function targetedCritiquePhase(candidateIdeas, providers, ctx) {
  // Run base critique
  const scoreCards = await defaultCritiquePhase(candidateIdeas, providers, ctx);

  // Add diversity_score based on perspectiveTags
  const existingTagSets = [];
  const scoreMap = new Map(scoreCards.map(c => [c.ideaId, c]));

  for (const idea of candidateIdeas) {
    const card = scoreMap.get(idea.id);
    if (!card) continue;

    const tags = idea.perspectiveTags || [];
    const diversityScore = computeDiversityScore(tags, existingTagSets);

    card.diversityScore = Number(diversityScore.toFixed(3));

    // Penalise low diversity
    if (diversityScore < 0.3 && tags.length > 0) {
      card.totalScore = Number((card.totalScore - 1).toFixed(2));
    }

    existingTagSets.push(tags);
  }

  // Re-sort after diversity penalty
  scoreCards.sort((a, b) => b.totalScore - a.totalScore);
  return scoreCards;
}

/**
 * Persist phase: tag ideas → create campaign → merge into backlog.
 */
async function targetedPersistPhase(result, providers, ctx) {
  const { selectedIdeas, sources, planMeta } = result;
  const { store, clock } = providers;
  const { runId, eventLog } = ctx;
  const { campaignId, topicTag, originalAnchor } = planMeta;

  console.log(`[Targeted:Persist] Saving ${selectedIdeas.length} ideas for campaign ${campaignId}`);

  // 1. Tag all selected ideas with campaign metadata
  const taggedIdeas = selectedIdeas.map(idea => {
    const tagged = tagIdea(idea, { campaignId, topicTag, originalAnchor });
    tagged.status = 'new';
    tagged.build = {
      projectId: null,
      lastError: null,
      queuedAt: null,
      startedAt: null,
      finishedAt: null,
    };
    tagged.createdAt = clock.now();
    tagged.runId = runId;
    delete tagged._score;
    return tagged;
  });

  // 2. Save sources
  await store.writeJson(SOURCES_DATA, { updated: clock.now(), sources });

  // 3. Create / update campaign metadata
  await store.withLock(CAMPAIGNS, async () => {
    const raw = await store.readJson(CAMPAIGNS, { campaigns: [] });
    const campaignList = normalizeCampaignList(raw);

    const campaignMeta = createCampaignMeta({
      campaignId,
      topicTag,
      originalAnchor,
      options: { creative: planMeta.creative, count: planMeta.targetCount },
      clock,
    });
    campaignMeta.stats.total = taggedIdeas.length;

    campaignList.campaigns.push(campaignMeta);
    campaignList.updatedAt = clock.now();

    await store.writeJson(CAMPAIGNS, campaignList);
    console.log(`[Targeted:Persist] Campaign ${campaignId} created`);
  });

  // 4. Merge into backlog
  await store.withLock(BACKLOG, async () => {
    const backlog = normalizeIdeaList(await store.readJson(BACKLOG, { ideas: [] }));
    const merged = mergeIntoBacklog(backlog.ideas, taggedIdeas);

    await store.writeJson(BACKLOG, {
      updatedAt: clock.now(),
      ideas: merged,
    });

    if (eventLog) {
      await eventLog.emit('targeted.persist.complete', {
        runId,
        campaignId,
        addedCount: taggedIdeas.length,
      });
    }
    console.log(`[Targeted:Persist] +${taggedIdeas.length} ideas merged into backlog`);
  });
}

// =====================================================================
//  Targeted Pipeline Phase Assembly
// =====================================================================

export const targetedPhases = {
  plan: targetedPlanPhase,
  // research: uses default from pipeline (defaultResearchPhase)
  ideate: targetedIdeatePhase,
  critique: targetedCritiquePhase,
  // select: uses default from pipeline (defaultSelectionPhase)
  persist: targetedPersistPhase,
};

// =====================================================================
//  Public API
// =====================================================================

/**
 * Run targeted research.
 *
 * @param {{ topic: string, creative?: number, count?: number, searchLangs?: string[] }} rawConfig
 * @param {object} [providerOverrides] – for testing: { llm?, search?, fetcher?, store?, clock? }
 * @returns {Promise<object>} pipeline result
 */
export async function runTargetedResearch(rawConfig, providerOverrides = {}) {
  const parsed = parseTargetedConfig(rawConfig);
  if (!parsed.ok) throw new Error(parsed.error);

  const providers = await createProviders(providerOverrides);
  const runId = generateRunId();
  const eventLog = createEventLogger({ logDir: LOGS_DIR });

  return runResearchPipeline({
    providers,
    phases: targetedPhases,
    runId,
    eventLog,
    logDir: path.join(LOGS_DIR, 'diagnostics'),
    lang: LANG,
    // Pass targeted config through ctx (phases.plan reads ctx.targetedConfig)
    targetedConfig: parsed.value,
  });
}

// =====================================================================
//  CLI Entrypoint
// =====================================================================

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  const rawConfig = {
    topic: args.topic,
    creative: args.creative ? Number(args.creative) : undefined,
    count: args.count ? Number(args.count) : undefined,
    searchLangs: args.lang ? [args.lang] : undefined,
  };

  const result = await runTargetedResearch(rawConfig);
  console.log(`\n✓ Targeted research complete: ${result.selectedIdeas.length} ideas generated for campaign ${result.planMeta.campaignId}`);
}

// Only run main() if this file is executed directly (not imported)
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  main().catch(err => {
    console.error(`[Targeted] Fatal: ${err.message}`);
    process.exit(1);
  });
}
