/**
 * Campaign – id generation and metadata structure.
 * Pure functions (clock / hasher injectable for testing determinism).
 */

import { createHash } from 'node:crypto';

/**
 * Build a deterministic campaign ID.
 * Format: camp_{compactTimestamp}_{shortHash}
 *
 * @param {string} topic – the anchor text
 * @param {{ now: () => string }} clock – injectable clock (ISO string)
 * @returns {string}
 */
export function buildCampaignId(topic, clock = { now: () => new Date().toISOString() }) {
  // compact timestamp: 20260206T1200 (13 chars)
  const iso = clock.now();
  const ts = iso.replace(/[-:]/g, '').slice(0, 13);
  const hash = createHash('sha256').update(topic).digest('hex').slice(0, 4);
  return `camp_${ts}_${hash}`;
}

/**
 * Human-readable short tag from topic – trimmed to 20 chars.
 * @param {string} topic
 * @returns {string}
 */
export function buildTopicTag(topic) {
  const tag = topic.trim().replace(/\s+/g, ' ');
  return tag.length > 20 ? tag.slice(0, 20) + '…' : tag;
}

/**
 * Create a full Campaign metadata object for storage in campaigns.json.
 */
export function createCampaignMeta({ campaignId, topicTag, originalAnchor, options = {}, clock }) {
  const now = clock ? clock.now() : new Date().toISOString();
  return {
    campaignId,
    topicTag,
    title: topicTag,
    originalAnchor,
    createdAt: now,
    options: {
      creative: Number(options.creative) || 0.6,
      count: Number(options.count) || 6,
      lang: options.lang || 'zh-CN',
    },
    stats: { total: 0, built: 0, failed: 0, running: 0 },
    perspectiveConfig: {
      dimensions: ['scope', 'user', 'interaction'],
      selectionSignals: [],
    },
  };
}

/**
 * Normalize campaigns.json container.
 * Philosophy: repair, not reject. Idempotent.
 */
export function normalizeCampaignList(raw) {
  if (!raw || typeof raw !== 'object') raw = {};
  const campaigns = Array.isArray(raw.campaigns) ? raw.campaigns : [];
  return {
    updatedAt: raw.updatedAt || new Date().toISOString(),
    campaigns: campaigns.filter(c => c && c.campaignId),
  };
}
