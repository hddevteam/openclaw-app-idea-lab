/**
 * JSON Contract Layer – runtime validation & normalisation for all shared JSON files.
 *
 * Philosophy: validate + repair (fill defaults, clamp, normalize) rather than
 * reject outright.  Normalisation should be idempotent so calling it twice on the
 * same data yields the same result.
 */

// ---------------------------------------------------------------------------
// Idea status enum
// ---------------------------------------------------------------------------
const VALID_IDEA_STATUSES = new Set([
  'new', 'backlog', 'implement-now', 'picked', 'implemented', 'blocked', 'archived', 'filtered',
]);

function normalizeStatus(s) {
  if (!s) return 'new';
  const lo = String(s).toLowerCase().trim();
  if (VALID_IDEA_STATUSES.has(lo)) return lo;
  // fuzzy map
  if (lo === 'done') return 'implemented';
  if (lo === 'ready') return 'new';
  return 'new';
}

// ---------------------------------------------------------------------------
// Single idea normaliser
// ---------------------------------------------------------------------------
export function normalizeIdea(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const idea = { ...raw };

  // id – kebab-case string
  if (!idea.id) idea.id = `idea_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  idea.id = String(idea.id);

  // title
  idea.title = String(idea.title || idea.name || '').trim() || 'Untitled';

  // scenario / description unify
  idea.hudScenario = String(idea.hudScenario || idea.scenario || idea.desc || idea.description || '').trim();

  // status
  idea.status = normalizeStatus(idea.status);

  // keywords → always array of strings
  if (!Array.isArray(idea.keywords)) idea.keywords = [];
  idea.keywords = idea.keywords.map(String).filter(Boolean);

  // sources → max 3 entries, each needs title + url
  if (!Array.isArray(idea.sources)) idea.sources = [];
  idea.sources = idea.sources
    .filter(s => s && (s.title || s.url))
    .slice(0, 3)
    .map(s => ({ title: String(s.title || ''), url: String(s.url || '') }));

  // coreInteractions → array of strings
  if (!Array.isArray(idea.coreInteractions)) idea.coreInteractions = [];

  // selfHealing → array of strings
  if (!Array.isArray(idea.selfHealing)) idea.selfHealing = [];

  // complexityBudget
  if (!idea.complexityBudget || typeof idea.complexityBudget !== 'object') {
    idea.complexityBudget = { minutes: 60, screens: 2, interactions: 3 };
  }
  idea.complexityBudget.minutes = Math.min(120, Math.max(10, Number(idea.complexityBudget.minutes) || 60));

  // targetPersona – who this idea serves (e.g. "街边奶茶店老板", "装修工人")
  if (idea.targetPersona) {
    idea.targetPersona = String(idea.targetPersona).trim();
  }

  // timestamps
  idea.createdAt = idea.createdAt || new Date().toISOString();

  return idea;
}

// ---------------------------------------------------------------------------
// Idea list container (idea_backlog.json / idea_filtered.json)
// ---------------------------------------------------------------------------
export function normalizeIdeaList(raw) {
  if (!raw || typeof raw !== 'object') raw = {};
  const ideas = Array.isArray(raw.ideas) ? raw.ideas
    : Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.backlog) ? raw.backlog
    : [];

  const normalized = ideas.map(normalizeIdea).filter(Boolean);

  return {
    updatedAt: raw.updatedAt || new Date().toISOString(),
    ideas: normalized,
  };
}

// ---------------------------------------------------------------------------
// idea_queue.json
// ---------------------------------------------------------------------------
export function normalizeIdeaQueue(raw) {
  if (!raw || typeof raw !== 'object') return { updatedAt: new Date().toISOString(), idea: null };
  const idea = raw.idea ? normalizeIdea(raw.idea) : null;
  return {
    updatedAt: raw.updatedAt || new Date().toISOString(),
    idea,
  };
}

// ---------------------------------------------------------------------------
// build_status.json
// ---------------------------------------------------------------------------
const VALID_BUILD_STATUSES = new Set(['idle', 'running', 'error', 'complete']);

export function normalizeBuildStatus(raw) {
  if (!raw || typeof raw !== 'object') raw = {};
  const status = VALID_BUILD_STATUSES.has(raw.status) ? raw.status : 'idle';
  return {
    status,
    stage: String(raw.stage || ''),
    progress: Math.max(0, Math.min(100, Number(raw.progress) || 0)),
    title: String(raw.title || ''),
    outId: String(raw.outId || ''),
    runId: String(raw.runId || ''),
    attempt: Number(raw.attempt) || 0,
    error: raw.error || null,
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// rag_projects_index.json
// ---------------------------------------------------------------------------
export function normalizeRagIndex(raw) {
  if (!raw || typeof raw !== 'object') raw = {};
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    updatedAt: raw.updatedAt || new Date().toISOString(),
    dims: Number(raw.dims) || 0,
    items: items.filter(it => it && (it.id || it.title)),
  };
}

// ---------------------------------------------------------------------------
// Diversity plan (new – used by multi-agent planner)
// ---------------------------------------------------------------------------
const INTERACTION_PRIMITIVES = [
  'drag-drop', 'swipe', 'pinch-zoom', 'long-press', 'slider', 'toggle',
  'canvas-draw', 'timeline', 'card-stack', 'sort-filter', 'color-pick',
  'scroll-reveal', 'gesture-ring', 'shake', 'tap-hold',
];

const DOMAIN_CATEGORIES = [
  'ai', 'system', 'network', 'game', 'productivity',
  'design', 'photo', 'video', 'music',
  'finance', 'business', 'dev-tools', 'edu',
  'health', 'lifestyle', 'travel',
];

export function normalizeDiversityPlan(raw) {
  if (!raw || typeof raw !== 'object') raw = {};
  return {
    targetCount: Math.max(3, Math.min(20, Number(raw.targetCount) || 8)),
    minDomains: Math.max(2, Number(raw.minDomains) || 4),
    minInteractions: Math.max(2, Number(raw.minInteractions) || 3),
    domainQuotas: raw.domainQuotas || {},
    interactionQuotas: raw.interactionQuotas || {},
    validDomains: DOMAIN_CATEGORIES,
    validInteractions: INTERACTION_PRIMITIVES,
  };
}

// ---------------------------------------------------------------------------
// Evaluator score card (for critic agent)
// ---------------------------------------------------------------------------
export function normalizeScoreCard(raw) {
  if (!raw || typeof raw !== 'object') raw = {};
  const clamp = (v, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, Number(v) || 0));
  return {
    ideaId: String(raw.ideaId || ''),
    novelty: clamp(raw.novelty),
    feasibility: clamp(raw.feasibility),
    coverage: clamp(raw.coverage),
    risk: clamp(raw.risk),
    totalScore: 0, // computed below
    reason: String(raw.reason || ''),
  };
}

export function computeTotalScore(card) {
  // weighted sum: feasibility matters most, novelty 2nd, coverage 3rd, risk is penalty
  card.totalScore = Number(
    (card.feasibility * 0.35 + card.novelty * 0.30 + card.coverage * 0.25 - card.risk * 0.10).toFixed(2)
  );
  return card;
}
