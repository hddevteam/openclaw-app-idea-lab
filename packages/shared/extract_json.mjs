/**
 * Robust JSON extraction from LLM outputs.
 *
 * Handles:
 *  - ```json ... ``` code fences
 *  - Leading/trailing prose around JSON
 *  - Multiple JSON objects/arrays (returns first valid)
 *  - Partial/trailing commas (simple fixup)
 *
 * Also provides `callWithRetry()` – a higher-order wrapper that adds
 * auto-retry with diagnostics logging on parse failure.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// extractJson – best-effort parse of LLM text into a JS value
// ---------------------------------------------------------------------------
export function extractJson(text) {
  if (!text || typeof text !== 'string') return { ok: false, value: null, raw: text, error: 'empty input' };

  // 1. Strip code fences
  let cleaned = text.replace(/```(?:json|jsonc)?\s*\n?([\s\S]*?)```/gi, '$1').trim();

  // 2. Try direct parse first (cheapest)
  try {
    return { ok: true, value: JSON.parse(cleaned), raw: text, error: null };
  } catch { /* continue */ }

  // 3. Locate first '{' or '[' and match to closing bracket
  const starts = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{' || cleaned[i] === '[') starts.push(i);
  }

  for (const start of starts) {
    const open = cleaned[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let esc = false;

    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          const candidate = cleaned.slice(start, i + 1);
          try {
            return { ok: true, value: JSON.parse(candidate), raw: text, error: null };
          } catch {
            // Try fixing trailing commas
            const fixed = candidate.replace(/,\s*([}\]])/g, '$1');
            try {
              return { ok: true, value: JSON.parse(fixed), raw: text, error: null };
            } catch { /* try next start */ }
          }
          break;
        }
      }
    }
  }

  return { ok: false, value: null, raw: text, error: 'no valid JSON found in LLM output' };
}

// ---------------------------------------------------------------------------
// extractJsonArray / extractJsonObject – convenience wrappers
// ---------------------------------------------------------------------------
export function extractJsonArray(text) {
  const r = extractJson(text);
  if (r.ok && Array.isArray(r.value)) return r;
  // Wrap single object in array
  if (r.ok && typeof r.value === 'object' && r.value !== null) {
    return { ...r, value: [r.value] };
  }
  return { ok: false, value: null, raw: text, error: r.error || 'expected JSON array' };
}

export function extractJsonObject(text) {
  const r = extractJson(text);
  if (r.ok && typeof r.value === 'object' && !Array.isArray(r.value) && r.value !== null) return r;
  return { ok: false, value: null, raw: text, error: r.error || 'expected JSON object' };
}

// ---------------------------------------------------------------------------
// callWithRetry – wraps an async LLM call with retry + diagnostics
// ---------------------------------------------------------------------------
/**
 * @param {Function} llmCallFn    – async () => string (raw LLM text)
 * @param {Function} parseFn      – (text: string) => { ok, value, error }
 * @param {Object}   opts
 * @param {number}   opts.maxAttempts    – default 3
 * @param {number}   opts.delayMs        – base delay between retries (doubles each attempt)
 * @param {string}   opts.logDir         – where to save failed attempts
 * @param {string}   opts.runId          – correlation id
 * @param {string}   opts.operationName  – e.g. 'idea_generate'
 * @param {Object}   opts.requestMeta    – extra metadata included in diagnostic log
 */
export async function callWithRetry(llmCallFn, parseFn, opts = {}) {
  const {
    maxAttempts = 3,
    delayMs = 2000,
    logDir = null,
    runId = randomUUID().slice(0, 8),
    operationName = 'llm_call',
    requestMeta = {},
  } = opts;

  const attempts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let rawText = null;
    try {
      rawText = await llmCallFn();
      const result = parseFn(rawText);
      if (result.ok) {
        return { ok: true, value: result.value, attempts: attempt, runId };
      }
      // parse failed but no exception
      attempts.push({ attempt, error: result.error, rawSnippet: (rawText || '').slice(0, 500) });
    } catch (err) {
      attempts.push({ attempt, error: err.message, rawSnippet: (rawText || '').slice(0, 500) });
    }

    // Delay before retry (exponential backoff)
    if (attempt < maxAttempts) {
      const wait = delayMs * Math.pow(2, attempt - 1);
      console.warn(`[${operationName}] Attempt ${attempt}/${maxAttempts} failed, retrying in ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }

  // All attempts exhausted → save diagnostics
  if (logDir) {
    try {
      await fs.mkdir(logDir, { recursive: true });
      const diagPath = path.join(logDir, `${operationName}_failed_${runId}_${Date.now()}.json`);
      await fs.writeFile(diagPath, JSON.stringify({
        operationName,
        runId,
        timestamp: new Date().toISOString(),
        maxAttempts,
        attempts,
        requestMeta,
      }, null, 2));
      console.error(`[${operationName}] All ${maxAttempts} attempts failed. Diagnostics → ${diagPath}`);
    } catch (logErr) {
      console.error(`[${operationName}] Failed to write diagnostics:`, logErr.message);
    }
  }

  return {
    ok: false,
    value: null,
    attempts: maxAttempts,
    runId,
    error: attempts[attempts.length - 1]?.error || 'all attempts failed',
  };
}
