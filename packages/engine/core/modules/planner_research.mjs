import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { isTooSimilar } from './rag_dedupe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.DAILY_WEB_LAB_ROOT || path.resolve(HERE, '..', '..'));
const DATA = path.join(ROOT, 'runtime', 'data');
const BACKLOG = path.join(DATA, 'idea_backlog.json');
const TRENDS_REPORT = path.join(DATA, 'trends_report.md');
const RAG_INDEX = path.join(DATA, 'rag_projects_index.json');
const CLAW_CONFIG = process.env.CLAWDBOT_CONFIG || path.join(os.homedir(), '.openclaw', 'clawdbot.json');
const TIMEOUT_MS = 180000; // 3 min total budget

// --- Agent Utils ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function loadConfig() {
  const raw = await fs.readFile(CLAW_CONFIG, 'utf8');
  const cfg = JSON.parse(raw);
  const proxy = cfg.env?.vars?.https_proxy || cfg.env?.vars?.HTTPS_PROXY || 'http://127.0.0.1:7890';
  
  console.log(`[Config] Proxy: ${proxy}`);
  setGlobalDispatcher(new ProxyAgent(proxy));

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
async function callLLM(prompt, config, role = 'system') {
  const { baseUrl, apiKey, models } = config;
  const model = models.find(m => m.id === 'gpt-5.2') || models[0];
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model.id,
      messages: [
        { role: 'system', content: 'You are an advanced creative agent. You specialize in "Combinatorial Innovation" - mixing disparate fields to create fresh digital tools.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.85 // High creativity
    })
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`LLM Error: ${raw.slice(0, 100)}`);
  const data = JSON.parse(raw);
  return data.choices[0].message.content;
}

// --- Agent Workflow ---

// Step 1: Brainstorm unexpected domains
async function phaseBroaden(config) {
  console.log('[Agent:Phase1] Broadening horizons...');
  const prompt = `
  Generate 4 search queries to discover emerging digital tool trends or unsolved needs.
  
  Primary Engine Categories: [AI (人工智能), System (系统性能), Network (网络通信), Game (游戏机制), Productivity (生产力)].
  
  Apple App Store Niches for Cross-Innovation:
  - Creative: [Graphics & Design, Photography & Video, Music]
  - Life & Health: [Health & Fitness, Medical, Lifestyle, Travel]
  - Utility & Professional: [Finance, Business, Developer Tools, Education]
  
  Constraints:
  1. Pick 1 "Primary Category" and mix it with 1-2 "Apple Niches".
  2. For example: "System" + "Music" tools, or "AI" + "Finance" utilities.
  3. Formulate specific search queries to find unique, non-generic utilities.
  
  Output JSON ONLY: ["query1", "query2", "query3", "query4"]
  `;
  const json = await callLLM(prompt, config);
  try {
    const queries = JSON.parse(json.match(/\[.*\]/s)[0]);
    return queries;
  } catch {
    return ["innovative system monitoring utilities for macOS/iOS 2026", "productivity tools with spatial computing integration", "AI-driven local-first creative workflows", "multiplayer networking mechanics for browser utilities"];
  }
}

// Step 2 & 3: Research & Scrape
async function phaseResearch(queries, config) {
  console.log('[Agent:Phase2] Executing Deep Research...');
  let context = "";
  
  for (const q of queries) {
    const results = await braveSearch(q, config.braveKey);
    if (results.length === 0) continue;
    
    // Pick top 2 results to scrape
    const top2 = results.slice(0, 2);
    context += `\n### Search Query: ${q}\n`;
    
    for (const r of top2) {
      const content = await fetchPageContent(r.url);
      if (content.length > 200) {
        context += `- Source: ${r.title} (${r.url})\n  Content: ${content}\n`;
      } else {
        context += `- Source: ${r.title}: ${r.description}\n`;
      }
      await sleep(1000);
    }
  }
  return context;
}

// Step 4: Ideate
async function phaseIdeate(researchContext, config) {
  console.log('[Agent:Phase3] Generating Concepts...');
  const currentYear = new Date().getFullYear();
  const prompt = `
  Context from Web Research:
  ${researchContext.slice(0, 10000)}

  Task:
  Generate 6 "Micro-App" ideas focusing on high-quality, professional, and "Juicy" interactions.
  
  IMPORTANT: All fields in the JSON (title, hudScenario, output, mockDataStrategy, demoStartState, etc.) MUST be written in Simplified Chinese (zh-CN). The app names and descriptions should be natural and professional in a Chinese context.
  
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
      "hudScenario": "用户+动作+结果",
      "output": "Copyable/Exportable result",
      "coreInteractions": ["Swipe", "Drag", "Pinch"],
      "keywords": ["ai", "productivity", "system", "network", "game", "design", "finance", "..."],
      "mockDataStrategy": "How to fake it?",
      "complexityBudget": {"minutes": 60, "screens": 2, "interactions": 3},
      "sources": [{"title": "source", "url": "..."}]
    }
  ]
  `;
  return callLLM(prompt, config.azure);
}

// Step 5: Reflect & Filter (The "Critic" Persona)
async function phaseReflect(rawIdeasJson, config) {
  console.log('[Agent:Phase4] Reflecting and Refining...');
  const prompt = `
  Review these ideas:
  ${rawIdeasJson}

  Critique Criteria:
  1. Is it too boring? (e.g. just a form). We want "Juicy" and "Tactile" apps.
  2. Is it too complex? (e.g. needs real backend).
  3. Category Alignment: Does at least one word in "keywords" match [ai, system, network, game, productivity]?
  
  IMPORTANT: The final output MUST be in Simplified Chinese (zh-CN).

  Action:
  - Keep the good ones.
  - REWRITE the boring ones to be more "Juicy" or "Interactive".
  - DISCARD the impossible ones.
  - Return the final filtered list as JSON.
  `;
  return callLLM(prompt, config.azure);
}

async function main() {
  const config = await loadConfig();
  
  // 1. Broaden
  const queries = await phaseBroaden(config.azure);
  console.log(`[Agent] Selected paths:`, queries);
  
  // 2. Research
  const researchContext = await phaseResearch(queries, config);
  
  // 3. Ideate
  const draftJson = await phaseIdeate(researchContext, config);
  
  // 4. Reflect
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
