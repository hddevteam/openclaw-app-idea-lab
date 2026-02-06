import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { isTooSimilar } from './rag_dedupe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.DAILY_APP_LAB_ROOT || path.resolve(HERE, '..', '..'));
const DATA = path.join(ROOT, 'runtime', 'data');
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
        models: [{ id: MODEL }] // Standardizing on the model ID used in code
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

// 1. Search Tool
async function braveSearch(query, apiKey) {
  console.log(`[Agent:Search] "${query}"`);
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=4`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey } });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    return data.web?.results || [];
  } catch (e) {
    console.warn(`[Agent:Search] Failed: ${e.message}`);
    return [];
  }
}

// 2. Scrape Tool (Text Extraction)
async function fetchPageContent(url) {
  console.log(`[Agent:Browse] Reading: ${url.slice(0, 50)}...`);
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000); // 8s timeout
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    
    if (!res.ok) throw new Error(`Status ${res.status}`);
    let text = await res.text();
    
    // Naive HTML stripper (since we don't have cheerio/jsdom)
    // 1. Remove scripts/styles
    text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gmi, "");
    text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gmi, "");
    // 2. Remove tags
    text = text.replace(/<[^>]+>/g, " ");
    // 3. Normalize whitespace
    text = text.replace(/\s+/g, " ").trim();
    
    return text.slice(0, 2000); // Limit to 2k chars context
  } catch (e) {
    console.warn(`[Agent:Browse] Ignore ${url}: ${e.message}`);
    return "";
  }
}

// 3. LLM Tool
async function callLLM(prompt, config, _role = 'system') {
  const { baseUrl, apiKey, models } = config;
  const model = models.find(m => m.id === MODEL) || models[0];
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 120000); // 120s timeout for LLM

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: model.id,
        messages: [
          { role: 'system', content: `You are an advanced creative agent. You specialize in "Combinatorial Innovation". All your written output and analysis MUST be in ${LANG}.` },
          { role: 'user', content: prompt }
        ],
        temperature: 0.85 // High creativity
      })
    });

    const raw = await res.text();
    if (!res.ok) throw new Error(`LLM Error: ${raw.slice(0, 100)}`);
    const data = JSON.parse(raw);
    return data.choices[0].message.content;
  } finally {
    clearTimeout(id);
  }
}

// --- Agent Workflow ---

// Step 1: Brainstorm unexpected domains
async function phaseBroaden(config) {
  console.log('[Agent:Phase1] Broadening horizons (Global + Local)...');

  // Evolution (A): Load yesterday's report to avoid repetition
  let previousTrends = "";
  try {
    previousTrends = await fs.readFile(TRENDS_REPORT, 'utf8');
    previousTrends = "RECENT TRENDS ANALYZED YESTERDAY:\n" + previousTrends.slice(0, 1000);
  } catch (e) {
    console.warn(`[Agent:Phase1] Failed to load previous trends: ${e.message}`);
  }

  const prompt = `
  ${previousTrends}

  Task: Generate 6 search queries to discover emerging digital tool trends or unsolved needs.
  
  Primary Engine Categories: [AI (人工智能), System (系统性能), Network (网络通信), Game (游戏机制), Productivity (生产力)].
  
  Apple App Store Niches for Cross-Innovation:
  - Creative: [Graphics & Design, Photography & Video, Music]
  - Life & Health: [Health & Fitness, Medical, Lifestyle, Travel]
  - Utility & Professional: [Finance, Business, Developer Tools, Education]
  
  Constraints:
  1. Pick 1 "Primary Category" and mix it with 1-2 "Apple Niches".
  2. DIVERSIFY: Ensure queries do NOT repeat the themes found in "RECENT TRENDS ANALYZED YESTERDAY".
  3. LANGUAGE MIX: Generate 3 queries in English (global innovators like Product Hunt/Indie Hackers) and 3 queries in ${LANG} (local pain points).
  4. Formulate specific search queries to find unique, non-generic utilities.
  
  Output JSON ONLY: ["query1", "query2", ...]
  `;
  const json = await callLLM(prompt, config);
  try {
    const match = json.match(/\[.*\]/s);
    if (!match) throw new Error("No JSON array found");
    return JSON.parse(match[0]);
  } catch {
    return ["innovative system monitoring utilities for macOS/iOS 2026", "productivity tools with spatial computing integration", "AI语音转MIDI生成器 技术现状", "移动端大文件清理 痛点分析"];
  }
}

// Step 2 & 3: Research & Scrape
async function phaseResearch(queries, config) {
  console.log('[Agent:Phase2] Executing Deep Research...');
  let context = "";
  const sources = [];
  
  for (const q of queries) {
    const results = await braveSearch(q, config.braveKey);
    if (results.length === 0) continue;
    
    // Evolution (B): Smarter selection. Pick top 4, then have LLM select top 2 most relevant or non-spammy
    const candidateList = results.slice(0, 4).map((r, i) => `${i}: ${r.title} - ${r.url} - ${r.description}`).join('\n');
    const selectPrompt = `From this search result list, return the indices of the TWO most insightful and high-quality unique sources for technical inspiration. Discard pure SEO spam. JSON ONLY: [0, 1]
    Results:\n${candidateList}`;
    
    let picks = [0, 1];
    try {
      const resp = await callLLM(selectPrompt, config.azure);
      const match = resp.match(/\[.*\]/);
      if (match) picks = JSON.parse(match[0]);
    } catch (e) {
      console.warn(`[Agent:Phase2] Source selection failed: ${e.message}`);
    }

    context += `\n### Search Query: ${q}\n`;
    
    for (const idx of picks) {
      const r = results[idx];
      if (!r) continue;
      sources.push({ title: r.title, url: r.url });
      const content = await fetchPageContent(r.url);
      if (content.length > 200) {
        context += `- Source: ${r.title} (${r.url})\n  Content: ${content}\n`;
      } else {
        context += `- Source: ${r.title}: ${r.description}\n`;
      }
      await sleep(1000);
    }
  }
  return { context, sources };
}

// Step 4: Ideate
async function phaseIdeate(researchContext, config) {
  console.log('[Agent:Phase3] Generating Concepts...');
  const prompt = `
  Context from Global & Local App Research:
  ${researchContext.slice(0, 10000)}

  Task:
  Generate 6 "Micro-App" ideas focusing on high-quality, professional, and "Juicy" interactions.
  
  IMPORTANT: The input context may contain English research findings. You must DIGEST and TRANSLATE them. 
  All fields in the resulting JSON (title, hudScenario, output, mockDataStrategy, demoStartState, etc.) MUST be written in ${LANG}. 
  The app names and descriptions should be natural, professional, and localized for a ${LANG} speaking audience.
  
  Philosophy: "Simple, Fast, Tactile, Self-Contained".
  
  Core Categories: ["ai", "system", "network", "game", "productivity"].
  Extended Apple Categories (Can be added to keywords):
  - Creative: ["design", "photo", "video", "music"]
  - Professional: ["finance", "business", "dev-tools", "edu"]
  - Lifestyle: ["health", "lifestyle", "travel", "medical"]
  
  Inspired by Apple's high-quality design standards and Human Interface Guidelines (HIG).
  
  Hard Constraints:
  1. NO Login, NO Backend, NO Paid Keys.
  2. Must be buildable in React+Tailwind in < 60 mins.
  3. MUST have "Simulation Mode" (fake data) if it looks like it needs an API.
  4. Avoid generic "ToDo lists". Look for visualizers, calculators, simulators, game-mechanic experiments.

  Return JSON ONLY:
  [
    {
      "title": "...",
      "hudScenario": "详细描述：[谁] 使用它来 [做什么] 并得到 [什么结果]",
      "output": "Copyable/Exportable result (具体的输出格式描述)",
      "coreInteractions": [
        "描述性步骤1 (例如：拖拽时间轴滑块实时调整现金流缺口，并看到图表动态收缩反馈)",
        "描述性步骤2 (例如：捏合手势切换保守/激进预测模型，阴影带随之扩张)",
        "描述性步骤3..."
      ],
      "selfHealing": [
        "增强鲁棒性方案1 (例如：当模拟数据产生极值导致溢出时，自动平滑曲线并提示修正)",
        "增强鲁棒性方案2...",
        "增强鲁棒性方案3..."
      ],
      "keywords": ["ai", "productivity", "system", "network", "game", "design", "finance", "..."],
      "mockDataStrategy": "详细的本地 Mock 逻辑方案",
      "complexityBudget": {"minutes": 60, "screens": 2, "interactions": 3},
      "sources": [{"title": "source", "url": "..."}]
    }
  ]
  `;
  return callLLM(prompt, config.azure);
}

// Step 5: Reflect & Filter (The "Critic" Persona)
async function phaseReflect(rawIdeasJson, config) {
  console.log('[Agent:Phase4] Reflecting and Refining (Tech Stack Check)...');
  const prompt = `
  Review these ideas:
  ${rawIdeasJson}

  Critique Criteria:
  1. Is it too boring? (e.g. just a form). We want "Juicy" and "Tactile" apps.
  2. Evolution (C): TECH REASONABILITY. Can this be built with React 18 + Tailwind WITHOUT a real backend? 
     - If it requires native binary APIs (e.g. registry editing, low-level driver access), can it be REWRITTEN as a Simulation? 
     - If it's IMPOSSIBLE in browser, DISCARD.
  3. Category Alignment: Does at least one word in "keywords" match [ai, system, network, game, productivity]?
  4. Detail check: "coreInteractions" and "selfHealing" must be descriptive sentences.
  
  IMPORTANT: The final output MUST be in ${LANG}.

  Action:
  - Keep the good ones.
  - REWRITE the boring ones to be more "Juicy" or "Interactive".
  - DISCARD the impossible ones (e.g. hardware-level drivers that can't be simulated).
  - Return the final filtered list as JSON.
  `;
  return callLLM(prompt, config.azure);
}

// Step 6: Summarize trends
async function phaseSummarize(researchContext, config) {
  console.log('[Agent:Phase5] Summarizing Trends...');
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

async function main() {
  const config = await loadConfig();
  
  // 1. Broaden
  const queries = await phaseBroaden(config.azure);
  console.log(`[Agent] Selected paths:`, queries);
  
  // 2. Research
  const { context: researchContext, sources } = await phaseResearch(queries, config);

  // 3. Summarize Trends
  const trendsReport = await phaseSummarize(researchContext, config);
  await fs.writeFile(TRENDS_REPORT, trendsReport);
  console.log(`[Agent] Trends report updated: ${TRENDS_REPORT}`);
  
  // Save sources for generator
  await fs.writeFile(SOURCES_DATA, JSON.stringify({ updated: new Date().toISOString(), sources }, null, 2));
  console.log(`[Agent] Sources data updated: ${SOURCES_DATA}`);

  // 4. Ideate
  const draftJson = await phaseIdeate(researchContext, config);
  
  // 5. Reflect
  const finalJsonRaw = await phaseReflect(draftJson, config);
  
  // Parse
  let newIdeas = [];
  try {
    const match = finalJsonRaw.match(/\[[\s\S]*\]/);
    if (match) newIdeas = JSON.parse(match[0]);
  } catch (e) {
    console.error("Failed to parse final ideas", e);
    // Fallback to draft if reflection fails
    const m2 = draftJson.match(/\[[\s\S]*\]/);
    if (m2) newIdeas = JSON.parse(m2[0]);
  }

  console.log(`[Agent] Finalized ${newIdeas.length} ideas.`);

  // Dedupe & Save
  const backlogRaw = await fs.readFile(BACKLOG, 'utf8').catch(() => '{"ideas":[]}');
  const backlog = JSON.parse(backlogRaw);
  if (!backlog.ideas) backlog.ideas = [];

  for (const idea of newIdeas) {
    const query = `${idea.title} ${idea.hudScenario}`;
    const sim = await isTooSimilar({ query, indexPath: RAG_INDEX, threshold: 0.72 });
    
    if (sim.tooSimilar) {
      console.log(`[Dedupe] Skipping: ${idea.title}`);
    } else {
      idea.id = `idea_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      idea.createdAt = new Date().toISOString();
      backlog.ideas.push(idea);
      console.log(`[Backlog] + ${idea.title}`);
    }
  }

  await fs.writeFile(BACKLOG, JSON.stringify(backlog, null, 2));
  console.log('[Agent] Cycle Complete.');
}

main().catch(console.error);
