/**
 * Research Providers – injectable dependency layer for the research pipeline.
 *
 * Real implementations wrap Azure OpenAI, Brave Search, and fetch.
 * For testing, pass mock providers via createProviders(overrides).
 *
 * Error contract (§6.2):
 *   - Network providers (search, fetcher): return null / empty on failure (failsafe)
 *   - LLM provider: throw on failure (caller wraps with callWithRetry)
 *   - Store provider: throw on write failure (atomic writes are critical)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import 'dotenv/config';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { writeJsonAtomic, readJsonSafe, withFileLock } from '../../../shared/atomic_fs.mjs';

const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview';

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

/**
 * Load configuration from env vars or ~/.openclaw/clawdbot.json.
 * Configures the global HTTP proxy as a side effect.
 */
export async function loadConfig() {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7890';
  console.log(`[Config] Proxy: ${proxy}`);
  setGlobalDispatcher(new ProxyAgent(proxy));

  const lang = process.env.DAILY_APP_LAB_LANG || 'zh-CN';
  const model = process.env.AZURE_OPENAI_MODEL || 'gpt-5.2';
  const clawConfig = process.env.CLAWDBOT_CONFIG || path.join(os.homedir(), '.openclaw', 'clawdbot.json');

  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT) {
    return {
      braveKey: process.env.BRAVE_API_KEY,
      azure: {
        baseUrl: process.env.AZURE_OPENAI_ENDPOINT,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        models: [{ id: model }],
      },
      lang,
      model,
    };
  }

  const raw = await fs.readFile(clawConfig, 'utf8');
  const cfg = JSON.parse(raw);
  return {
    braveKey: cfg.tools?.web?.search?.apiKey || cfg.env?.vars?.BRAVE_API_KEY,
    azure: cfg.models?.providers?.['azure-openai'],
    lang,
    model,
  };
}

// ---------------------------------------------------------------------------
// LLM Provider – Azure OpenAI Responses API
// ---------------------------------------------------------------------------

/** @returns {{ complete(prompt: string, opts?: object): Promise<string> }} */
export function createLlmProvider(azureConfig, options = {}) {
  const defaultLang = options.lang || 'zh-CN';
  const defaultModel = options.model || 'gpt-5.2';

  return {
    async complete(prompt, opts = {}) {
      const { baseUrl, apiKey, models } = azureConfig;
      const model = models.find(m => m.id === defaultModel) || models[0];

      // Strip trailing slashes and /v1 suffix (config may include /openai/v1/)
      const base = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
      const url = base.includes('/openai')
        ? `${base}/responses?api-version=${API_VERSION}`
        : `${base}/openai/responses?api-version=${API_VERSION}`;

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), opts.timeout || 120_000);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
          signal: controller.signal,
          body: JSON.stringify({
            model: model.id,
            instructions: opts.systemPrompt ||
              `You are an advanced creative agent. You specialize in "Combinatorial Innovation". All your written output and analysis MUST be in ${defaultLang}.`,
            input: prompt,
            temperature: opts.temperature ?? 0.85,
          }),
        });

        const raw = await res.text();
        if (!res.ok) throw new Error(`LLM Error (${res.status}): ${raw.slice(0, 200)}`);
        const data = JSON.parse(raw);

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
    },
  };
}

// ---------------------------------------------------------------------------
// Search Provider – Brave Search API
// ---------------------------------------------------------------------------

/** @returns {{ web(query: string, opts?: object): Promise<{ results: object[] }> }} */
export function createSearchProvider(braveKey) {
  return {
    async web(query, options = {}) {
      console.log(`[Search] "${query}"`);
      try {
        const count = options.count || 4;
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
        const res = await fetch(url, {
          headers: { Accept: 'application/json', 'X-Subscription-Token': braveKey },
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        return { results: data.web?.results || [] };
      } catch (e) {
        console.warn(`[Search] Failed: ${e.message}`);
        return { results: [] };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Fetcher Provider – page content extraction
// ---------------------------------------------------------------------------

/** @returns {{ readText(url: string, opts?: object): Promise<string|null> }} */
export function createFetcherProvider() {
  return {
    async readText(url, options = {}) {
      console.log(`[Fetcher] ${url.slice(0, 60)}...`);
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), options.timeout || 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(id);

        if (!res.ok) throw new Error(`Status ${res.status}`);
        let text = await res.text();

        text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gmi, '');
        text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gmi, '');
        text = text.replace(/<[^>]+>/g, ' ');
        text = text.replace(/\s+/g, ' ').trim();

        return text.slice(0, options.maxLength || 2000);
      } catch (e) {
        console.warn(`[Fetcher] Ignore ${url}: ${e.message}`);
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Store Provider – atomic file operations
// ---------------------------------------------------------------------------

/** @returns {{ readJson, writeJson, withLock, writeText, readText, mkdir }} */
export function createStoreProvider() {
  return {
    readJson: readJsonSafe,
    writeJson: writeJsonAtomic,
    withLock: withFileLock,
    writeText: (filePath, content) => fs.writeFile(filePath, content, 'utf8'),
    readText: (filePath) => fs.readFile(filePath, 'utf8'),
    mkdir: (dir) => fs.mkdir(dir, { recursive: true }),
  };
}

// ---------------------------------------------------------------------------
// Provider Factory
// ---------------------------------------------------------------------------

/**
 * Create all providers. Pass overrides to swap any provider (for tests).
 *
 * @param {object} [overrides] – partial overrides: { llm?, search?, fetcher?, store?, clock?, rng?, config? }
 * @returns {Promise<{ llm, search, fetcher, store, clock, rng, config }>}
 */
export async function createProviders(overrides = {}) {
  const config = overrides.config || await loadConfig();
  return {
    llm: overrides.llm || createLlmProvider(config.azure, { lang: config.lang, model: config.model }),
    search: overrides.search || createSearchProvider(config.braveKey),
    fetcher: overrides.fetcher || createFetcherProvider(),
    store: overrides.store || createStoreProvider(),
    clock: overrides.clock || { now: () => new Date().toISOString() },
    rng: overrides.rng || { id: () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}` },
    config,
  };
}
