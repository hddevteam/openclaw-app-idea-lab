/**
 * Config – parse & validate targeted-research parameters.
 * Pure function, no side effects.
 */

export const DEFAULTS = {
  creative: 0.6,
  count: 6,
  searchLangs: ['zh-CN', 'en'],
  contextTokenBudget: 8000,
};

/**
 * Parse and validate targeted research configuration.
 * @param {object} raw – user-supplied options (from CLI or API body)
 * @returns {{ ok: boolean, value?: object, error?: string }}
 */
export function parseTargetedConfig(raw = {}) {
  const topic = (raw.topic ?? '').trim();
  if (!topic) {
    return { ok: false, error: 'topic is required' };
  }

  const creative = clamp(Number(raw.creative) || DEFAULTS.creative, 0, 1);
  const count = clamp(Math.round(Number(raw.count) || DEFAULTS.count), 3, 12);
  const searchLangs = Array.isArray(raw.searchLangs) && raw.searchLangs.length
    ? raw.searchLangs.map(String)
    : [...DEFAULTS.searchLangs];
  const contextTokenBudget = Math.max(2000, Number(raw.contextTokenBudget) || DEFAULTS.contextTokenBudget);

  return {
    ok: true,
    value: { topic, creative, count, searchLangs, contextTokenBudget },
  };
}

/**
 * Parse CLI arguments in --key value or --key=value format.
 * @param {string[]} argv – e.g. process.argv.slice(2)
 * @returns {object} key-value map
 */
export function parseCliArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      result[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      result[arg.slice(2)] = argv[i + 1];
      i++;
    } else {
      result[arg.slice(2)] = true;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
