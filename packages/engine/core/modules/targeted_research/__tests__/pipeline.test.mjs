/**
 * Pipeline integration test – runs the complete pipeline with mock providers.
 * Validates: plan → research → ideate → critique → select → persist flow.
 *
 * No real network / LLM / filesystem calls.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { runResearchPipeline, defaultSelectionPhase } from '../../research_pipeline.mjs';

// ---------------------------------------------------------------------------
// Mock Providers
// ---------------------------------------------------------------------------

function createMockProviders() {
  const written = { files: new Map(), locked: [] };

  return {
    providers: {
      llm: {
        /**
         * Mock LLM – returns different responses based on prompt content.
         */
        async complete(prompt) {
          // Source selection prompt
          if (prompt.includes('most insightful sources') || prompt.includes('TWO')) {
            return '[0, 1]';
          }

          // Critique prompt
          if (prompt.includes('Evaluate EACH')) {
            return JSON.stringify([
              { ideaIdx: 0, novelty: 8, feasibility: 7, coverage: 6, risk: 2, reason: 'Good' },
              { ideaIdx: 1, novelty: 6, feasibility: 8, coverage: 5, risk: 3, reason: 'OK' },
              { ideaIdx: 2, novelty: 9, feasibility: 6, coverage: 8, risk: 1, reason: 'Great' },
            ]);
          }

          // Default: return empty to trigger fallbacks
          return '[]';
        },
      },

      search: {
        async web(query) {
          return {
            results: [
              { title: `Result for: ${query.slice(0, 30)}`, url: 'https://example.com/a', description: 'Desc A' },
              { title: 'Second result', url: 'https://example.com/b', description: 'Desc B' },
            ],
          };
        },
      },

      fetcher: {
        async readText(url) {
          // Return substantial content so it passes the >200 char threshold
          return `This is page content from ${url}. `.repeat(20);
        },
      },

      store: {
        async readJson(_path, fallback) { return fallback; },
        async writeJson(filePath, data) { written.files.set(filePath, data); },
        async withLock(filePath, fn) { written.locked.push(filePath); return fn(); },
        async writeText(filePath, content) { written.files.set(filePath, content); },
        async readText(_filePath) { throw new Error('not found'); },
        async mkdir(_dir) { /* no-op */ },
      },

      clock: { now: () => '2026-02-06T12:00:00.000Z' },
      rng: { id: () => 'mock_001' },
    },

    written,
  };
}

// ---------------------------------------------------------------------------
// Mock Phases (minimal targeted-like)
// ---------------------------------------------------------------------------

function createMockPhases() {
  const calls = {};

  return {
    phases: {
      async plan(providers, ctx) {
        calls.plan = true;
        return {
          queries: ['query1', 'query2'],
          planMeta: { targetCount: 3, campaignId: 'camp_test', topicTag: 'test' },
        };
      },

      async ideate(researchContext, planMeta, providers, ctx) {
        calls.ideate = true;
        assert.ok(researchContext.length > 0, 'ideate should receive researchContext');
        assert.ok(planMeta.campaignId, 'ideate should receive planMeta');
        return [
          { id: 'idea_0', title: 'Idea A', keywords: ['photo'], coreInteractions: ['drag: 拖拽'], hudScenario: 'Scenario A' },
          { id: 'idea_1', title: 'Idea B', keywords: ['video'], coreInteractions: ['swipe: 滑动'], hudScenario: 'Scenario B' },
          { id: 'idea_2', title: 'Idea C', keywords: ['music'], coreInteractions: ['tap: 点击'], hudScenario: 'Scenario C' },
        ];
      },

      async persist(result, providers, ctx) {
        calls.persist = true;
        calls.persistResult = result;
      },
    },

    calls,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runResearchPipeline – integration with mocks', () => {
  let mockProviders, written, mockPhases, calls;

  beforeEach(() => {
    ({ providers: mockProviders, written } = createMockProviders());
    ({ phases: mockPhases, calls } = createMockPhases());
  });

  it('should run all phases in order', async () => {
    const result = await runResearchPipeline({
      providers: mockProviders,
      phases: mockPhases,
      runId: 'test-run-001',
    });

    assert.ok(calls.plan, 'plan phase should run');
    assert.ok(calls.ideate, 'ideate phase should run');
    assert.ok(calls.persist, 'persist phase should run');
  });

  it('should pass research context to ideate phase', async () => {
    const result = await runResearchPipeline({
      providers: mockProviders,
      phases: mockPhases,
      runId: 'test-run-002',
    });

    // Research context should contain search query info
    assert.ok(result.sources.length > 0, 'should have sources');
    assert.ok(result.evidence.length > 0, 'should have evidence');
  });

  it('should produce scored and selected ideas', async () => {
    const result = await runResearchPipeline({
      providers: mockProviders,
      phases: mockPhases,
      runId: 'test-run-003',
    });

    assert.ok(result.scoreCards.length > 0, 'should have scoreCards');
    assert.ok(result.selectedIdeas.length > 0, 'should have selectedIdeas');
    assert.ok(result.selectedIdeas.length <= 3, 'should not exceed targetCount');
  });

  it('should pass full result to persist phase', async () => {
    await runResearchPipeline({
      providers: mockProviders,
      phases: mockPhases,
      runId: 'test-run-004',
    });

    const persisted = calls.persistResult;
    assert.ok(persisted.queries, 'result should have queries');
    assert.ok(persisted.sources, 'result should have sources');
    assert.ok(persisted.scoreCards, 'result should have scoreCards');
    assert.ok(persisted.selectedIdeas, 'result should have selectedIdeas');
    assert.ok(persisted.planMeta, 'result should have planMeta');
    assert.equal(persisted.planMeta.campaignId, 'camp_test');
  });

  it('should use default research phase when not provided', async () => {
    // phases.research is not defined → uses defaultResearchPhase
    const result = await runResearchPipeline({
      providers: mockProviders,
      phases: mockPhases,
      runId: 'test-run-005',
    });

    // Default research phase should have called search.web and fetcher.readText
    assert.ok(result.sources.length > 0);
  });

  it('should forward extra context properties to phases', async () => {
    let receivedCtx;
    const customPhases = {
      ...mockPhases,
      async plan(providers, ctx) {
        receivedCtx = ctx;
        return { queries: ['q1'], planMeta: { targetCount: 1 } };
      },
      async ideate() { return [{ id: 'x', title: 'X', keywords: [] }]; },
      async persist() {},
    };

    await runResearchPipeline({
      providers: mockProviders,
      phases: customPhases,
      runId: 'test-run-006',
      lang: 'zh-CN',
      targetedConfig: { topic: 'test-topic', creative: 0.8 },
    });

    assert.equal(receivedCtx.lang, 'zh-CN');
    assert.equal(receivedCtx.targetedConfig.topic, 'test-topic');
    assert.equal(receivedCtx.targetedConfig.creative, 0.8);
  });

  it('should run optional summarize phase in parallel with ideate', async () => {
    let summarizeCalled = false;
    const phasesWithSummary = {
      ...mockPhases,
      async summarize(researchContext, providers, ctx) {
        summarizeCalled = true;
        return '# Trends Report\nContent here...';
      },
    };

    const result = await runResearchPipeline({
      providers: mockProviders,
      phases: phasesWithSummary,
      runId: 'test-run-007',
    });

    assert.ok(summarizeCalled, 'summarize should be called');
    assert.ok(result.summaryReport.includes('Trends Report'));
  });

  it('should have null summaryReport when no summarize phase', async () => {
    const result = await runResearchPipeline({
      providers: mockProviders,
      phases: mockPhases,
      runId: 'test-run-008',
    });

    assert.equal(result.summaryReport, null);
  });
});

describe('defaultSelectionPhase', () => {
  it('should pick top-scored ideas up to targetCount', () => {
    const ideas = [
      { id: 'a', keywords: ['k1'], coreInteractions: ['drag: test'] },
      { id: 'b', keywords: ['k2'], coreInteractions: ['swipe: test'] },
      { id: 'c', keywords: ['k3'], coreInteractions: ['tap: test'] },
    ];
    const scores = [
      { ideaId: 'a', totalScore: 5 },
      { ideaId: 'b', totalScore: 8 },
      { ideaId: 'c', totalScore: 3 },
    ];
    const planMeta = { targetCount: 2 };

    const { selectedIdeas } = defaultSelectionPhase(ideas, scores, planMeta, {});
    assert.equal(selectedIdeas.length, 2);
    // b should be first (highest score)
    assert.equal(selectedIdeas[0].id, 'b');
  });

  it('should respect diversity bonus', () => {
    const ideas = [
      { id: 'a', keywords: ['photo'], coreInteractions: ['drag: test'] },
      { id: 'b', keywords: ['photo'], coreInteractions: ['drag: dup'] },  // same domain + interaction
      { id: 'c', keywords: ['music'], coreInteractions: ['tap: test'] },  // new domain + interaction
    ];
    const scores = [
      { ideaId: 'a', totalScore: 5 },
      { ideaId: 'b', totalScore: 4.5 },  // slightly lower
      { ideaId: 'c', totalScore: 4 },     // lowest but diverse
    ];
    const planMeta = { targetCount: 3 };

    const { selectedIdeas, usedDomains } = defaultSelectionPhase(ideas, scores, planMeta, {});
    assert.equal(selectedIdeas.length, 3);
    assert.ok(usedDomains.includes('photo'));
    assert.ok(usedDomains.includes('music'));
  });
});
