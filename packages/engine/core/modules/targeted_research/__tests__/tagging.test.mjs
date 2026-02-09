import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tagIdea, tagIdeas, buildIdeaId, mergeIntoBacklog } from '../tagging.mjs';

const campaignMeta = {
  campaignId: 'camp_20260206T1200_a3f2',
  topicTag: '摄影师资产维护',
  originalAnchor: '针对独立摄影师的资产维护工具',
};

describe('tagIdea', () => {
  it('should inject campaign fields into an idea', () => {
    const raw = { id: 'idea1', title: 'EXIF 编辑器' };
    const tagged = tagIdea(raw, campaignMeta);

    assert.equal(tagged.id, 'idea1');
    assert.equal(tagged.title, 'EXIF 编辑器');
    assert.equal(tagged.campaignId, 'camp_20260206T1200_a3f2');
    assert.equal(tagged.topicTag, '摄影师资产维护');
    assert.equal(tagged.isTargeted, true);
    assert.equal(tagged.originalAnchor, '针对独立摄影师的资产维护工具');
  });

  it('should not mutate the original idea', () => {
    const raw = { id: 'idea1', title: 'test' };
    tagIdea(raw, campaignMeta);
    assert.equal(raw.campaignId, undefined);
    assert.equal(raw.isTargeted, undefined);
  });

  it('should overwrite existing campaign fields', () => {
    const raw = { id: 'idea1', campaignId: 'old', isTargeted: false };
    const tagged = tagIdea(raw, campaignMeta);
    assert.equal(tagged.campaignId, 'camp_20260206T1200_a3f2');
    assert.equal(tagged.isTargeted, true);
  });
});

describe('tagIdeas', () => {
  it('should tag all ideas in array', () => {
    const ideas = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ];
    const tagged = tagIdeas(ideas, campaignMeta);
    assert.equal(tagged.length, 2);
    for (const idea of tagged) {
      assert.equal(idea.campaignId, campaignMeta.campaignId);
      assert.equal(idea.isTargeted, true);
    }
  });

  it('should return empty array for empty input', () => {
    assert.deepEqual(tagIdeas([], campaignMeta), []);
  });
});

describe('buildIdeaId', () => {
  it('should produce campaignId_idea_000 format', () => {
    const id = buildIdeaId('camp_20260206T1200_a3f2', 0);
    assert.equal(id, 'camp_20260206T1200_a3f2_idea_000');
  });

  it('should zero-pad index to 3 digits', () => {
    assert.equal(buildIdeaId('camp_x', 5), 'camp_x_idea_005');
    assert.equal(buildIdeaId('camp_x', 42), 'camp_x_idea_042');
    assert.equal(buildIdeaId('camp_x', 100), 'camp_x_idea_100');
  });

  it('should be deterministic', () => {
    assert.equal(buildIdeaId('camp_a', 3), buildIdeaId('camp_a', 3));
  });
});

describe('mergeIntoBacklog', () => {
  it('should append new ideas after existing ones', () => {
    const existing = [{ id: 'a' }, { id: 'b' }];
    const newIdeas = [{ id: 'c' }, { id: 'd' }];
    const merged = mergeIntoBacklog(existing, newIdeas);
    assert.equal(merged.length, 4);
    assert.equal(merged[2].id, 'c');
    assert.equal(merged[3].id, 'd');
  });

  it('should skip duplicates (by id)', () => {
    const existing = [{ id: 'a', title: 'original' }];
    const newIdeas = [{ id: 'a', title: 'dupe' }, { id: 'b' }];
    const merged = mergeIntoBacklog(existing, newIdeas);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].title, 'original'); // kept original
    assert.equal(merged[1].id, 'b');
  });

  it('should handle empty existing list', () => {
    const merged = mergeIntoBacklog([], [{ id: 'x' }]);
    assert.equal(merged.length, 1);
  });

  it('should handle empty new list', () => {
    const merged = mergeIntoBacklog([{ id: 'x' }], []);
    assert.equal(merged.length, 1);
  });

  it('should not mutate input arrays', () => {
    const existing = [{ id: 'a' }];
    const newIdeas = [{ id: 'b' }];
    mergeIntoBacklog(existing, newIdeas);
    assert.equal(existing.length, 1);
    assert.equal(newIdeas.length, 1);
  });
});
