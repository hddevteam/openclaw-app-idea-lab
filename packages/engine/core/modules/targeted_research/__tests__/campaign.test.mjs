import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCampaignId,
  buildTopicTag,
  createCampaignMeta,
  normalizeCampaignList,
  removeCampaign,
} from '../campaign.mjs';

// Fixed clock for deterministic tests
const fixedClock = { now: () => '2026-02-06T12:00:00.000Z' };

describe('buildCampaignId', () => {
  it('should produce camp_{timestamp}_{hash} format', () => {
    const id = buildCampaignId('摄影师资产维护', fixedClock);
    assert.match(id, /^camp_\d{8}T\d{4}_[0-9a-f]{4}$/);
  });

  it('should use compact timestamp from clock', () => {
    const id = buildCampaignId('test', fixedClock);
    assert.ok(id.includes('20260206T1200'));
  });

  it('should produce different hashes for different topics', () => {
    const a = buildCampaignId('topic A', fixedClock);
    const b = buildCampaignId('topic B', fixedClock);
    // same timestamp but different hash
    assert.notEqual(a, b);
    assert.equal(a.slice(0, 18), b.slice(0, 18)); // camp_20260206T1200 prefix is same
    assert.notEqual(a.slice(-4), b.slice(-4));     // hash differs
  });

  it('should be deterministic for same inputs', () => {
    const a = buildCampaignId('摄影师资产维护', fixedClock);
    const b = buildCampaignId('摄影师资产维护', fixedClock);
    assert.equal(a, b);
  });

  it('should use real clock when none is provided', () => {
    const id = buildCampaignId('test');
    assert.match(id, /^camp_\d{8}T\d{4}_[0-9a-f]{4}$/);
  });
});

describe('buildTopicTag', () => {
  it('should return short topics as-is', () => {
    assert.equal(buildTopicTag('摄影师工具'), '摄影师工具');
  });

  it('should trim and collapse whitespace', () => {
    assert.equal(buildTopicTag('  摄影师  工具  '), '摄影师 工具');
  });

  it('should truncate long topics to 20 chars + ellipsis', () => {
    const long = '这是一个非常非常非常长的主题描述文字超过二十个字符';
    const tag = buildTopicTag(long);
    assert.equal(tag.length, 21); // 20 chars + '…'
    assert.ok(tag.endsWith('…'));
  });

  it('should keep exactly 20-char topics without ellipsis', () => {
    const exact = '12345678901234567890'; // exactly 20
    assert.equal(buildTopicTag(exact), exact);
  });
});

describe('createCampaignMeta', () => {
  it('should produce complete metadata with defaults', () => {
    const meta = createCampaignMeta({
      campaignId: 'camp_test_0001',
      topicTag: '摄影师工具',
      originalAnchor: '针对独立摄影师的资产维护工具',
      clock: fixedClock,
    });
    assert.equal(meta.campaignId, 'camp_test_0001');
    assert.equal(meta.topicTag, '摄影师工具');
    assert.equal(meta.title, '摄影师工具');
    assert.equal(meta.originalAnchor, '针对独立摄影师的资产维护工具');
    assert.equal(meta.createdAt, '2026-02-06T12:00:00.000Z');
    assert.equal(meta.options.creative, 0.6);
    assert.equal(meta.options.count, 6);
    assert.equal(meta.options.lang, 'zh-CN');
    assert.deepEqual(meta.stats, { total: 0, built: 0, failed: 0, running: 0 });
    assert.deepEqual(meta.perspectiveConfig.dimensions, ['scope', 'user', 'interaction']);
    assert.deepEqual(meta.perspectiveConfig.selectionSignals, []);
  });

  it('should respect custom options', () => {
    const meta = createCampaignMeta({
      campaignId: 'camp_test_0002',
      topicTag: 'test',
      originalAnchor: 'test',
      options: { creative: 0.9, count: 10, lang: 'en' },
      clock: fixedClock,
    });
    assert.equal(meta.options.creative, 0.9);
    assert.equal(meta.options.count, 10);
    assert.equal(meta.options.lang, 'en');
  });
});

describe('normalizeCampaignList', () => {
  it('should handle null/undefined input', () => {
    const result = normalizeCampaignList(null);
    assert.ok(result.updatedAt);
    assert.deepEqual(result.campaigns, []);
  });

  it('should pass through valid campaigns', () => {
    const input = {
      updatedAt: '2026-01-01T00:00:00Z',
      campaigns: [{ campaignId: 'camp_a' }, { campaignId: 'camp_b' }],
    };
    const result = normalizeCampaignList(input);
    assert.equal(result.campaigns.length, 2);
    assert.equal(result.updatedAt, '2026-01-01T00:00:00Z');
  });

  it('should filter out entries without campaignId', () => {
    const input = {
      campaigns: [{ campaignId: 'camp_a' }, { title: 'no id' }, null, {}],
    };
    const result = normalizeCampaignList(input);
    assert.equal(result.campaigns.length, 1);
  });

  it('should handle missing campaigns key', () => {
    const result = normalizeCampaignList({ updatedAt: '...' });
    assert.deepEqual(result.campaigns, []);
  });
});

describe('removeCampaign', () => {
  const container = {
    updatedAt: '2026-01-01T00:00:00Z',
    campaigns: [
      { campaignId: 'camp_a', topicTag: 'A' },
      { campaignId: 'camp_b', topicTag: 'B' },
      { campaignId: 'camp_c', topicTag: 'C' },
    ],
  };

  it('should remove an existing campaign and return it', () => {
    const { container: next, removed } = removeCampaign(container, 'camp_b', fixedClock);
    assert.equal(next.campaigns.length, 2);
    assert.ok(!next.campaigns.find(c => c.campaignId === 'camp_b'));
    assert.deepEqual(removed, { campaignId: 'camp_b', topicTag: 'B' });
    assert.equal(next.updatedAt, fixedClock.now());
  });

  it('should return null removed when campaignId not found', () => {
    const { container: next, removed } = removeCampaign(container, 'camp_nonexistent', fixedClock);
    assert.equal(next.campaigns.length, 3);
    assert.equal(removed, null);
  });

  it('should not mutate the original container', () => {
    const before = JSON.parse(JSON.stringify(container));
    removeCampaign(container, 'camp_a', fixedClock);
    assert.deepEqual(container, before);
  });

  it('should handle empty container', () => {
    const { container: next, removed } = removeCampaign(null, 'camp_x', fixedClock);
    assert.deepEqual(next.campaigns, []);
    assert.equal(removed, null);
  });
});
