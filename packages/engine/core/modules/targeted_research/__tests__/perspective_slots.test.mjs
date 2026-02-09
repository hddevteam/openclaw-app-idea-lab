import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSPECTIVE_DIMENSIONS,
  DEFAULT_DIMENSIONS,
  buildPerspectivePrompt,
  parsePerspectiveTags,
  computeDiversityScore,
  validateDiversity,
} from '../perspective_slots.mjs';

describe('PERSPECTIVE_DIMENSIONS', () => {
  it('should have 4 dimensions', () => {
    const keys = Object.keys(PERSPECTIVE_DIMENSIONS);
    assert.equal(keys.length, 4);
    assert.deepEqual(keys.sort(), ['business', 'interaction', 'scope', 'user']);
  });

  it('each dimension should have name, description, examples', () => {
    for (const [key, dim] of Object.entries(PERSPECTIVE_DIMENSIONS)) {
      assert.ok(dim.name, `${key} missing name`);
      assert.ok(dim.description, `${key} missing description`);
      assert.ok(Array.isArray(dim.examples) && dim.examples.length > 0, `${key} missing examples`);
    }
  });
});

describe('DEFAULT_DIMENSIONS', () => {
  it('should be scope, user, interaction', () => {
    assert.deepEqual(DEFAULT_DIMENSIONS, ['scope', 'user', 'interaction']);
  });
});

describe('buildPerspectivePrompt', () => {
  it('should include count in output', () => {
    const prompt = buildPerspectivePrompt(6);
    assert.ok(prompt.includes('6'));
  });

  it('should include all default dimensions', () => {
    const prompt = buildPerspectivePrompt(6);
    assert.ok(prompt.includes('范围梯度'));
    assert.ok(prompt.includes('用户假设'));
    assert.ok(prompt.includes('交互模式'));
  });

  it('should include perspectiveTags and challengesOriginal requirements', () => {
    const prompt = buildPerspectivePrompt(6);
    assert.ok(prompt.includes('perspectiveTags'));
    assert.ok(prompt.includes('challengesOriginal'));
  });

  it('should respect custom dimensions', () => {
    const prompt = buildPerspectivePrompt(4, ['scope', 'business']);
    assert.ok(prompt.includes('范围梯度'));
    assert.ok(prompt.includes('商业模式'));
    assert.ok(!prompt.includes('用户假设'));
  });

  it('should filter out unknown dimensions', () => {
    const prompt = buildPerspectivePrompt(4, ['scope', 'nonexistent']);
    assert.ok(prompt.includes('范围梯度'));
    assert.ok(!prompt.includes('nonexistent'));
  });

  it('should return empty string if no valid dimensions', () => {
    const prompt = buildPerspectivePrompt(4, ['fake1', 'fake2']);
    assert.equal(prompt, '');
  });

  it('should cap minDiversity at dimension count', () => {
    // only 2 dimensions → min diversity should be 2, not 3
    const prompt = buildPerspectivePrompt(4, ['scope', 'user']);
    assert.ok(prompt.includes('至少覆盖 2 种维度'));
  });

  it('should set minDiversity to 3 when ≥3 dimensions', () => {
    const prompt = buildPerspectivePrompt(6, ['scope', 'user', 'interaction', 'business']);
    assert.ok(prompt.includes('至少覆盖 3 种维度'));
  });
});

describe('parsePerspectiveTags', () => {
  it('should normalise valid tags', () => {
    const result = parsePerspectiveTags(['scope:mvp', 'User:Hobbyist', 'INTERACTION:CLI']);
    assert.deepEqual(result, ['scope:mvp', 'user:hobbyist', 'interaction:cli']);
  });

  it('should filter out tags with unknown dimensions', () => {
    const result = parsePerspectiveTags(['scope:mvp', 'unknown:value', 'mood:happy']);
    assert.deepEqual(result, ['scope:mvp']);
  });

  it('should filter out malformed tags', () => {
    const result = parsePerspectiveTags(['scopemvp', ':value', 'scope:', '', 'scope:ok']);
    assert.deepEqual(result, ['scope:ok']);
  });

  it('should return empty array for non-array input', () => {
    assert.deepEqual(parsePerspectiveTags(null), []);
    assert.deepEqual(parsePerspectiveTags(undefined), []);
    assert.deepEqual(parsePerspectiveTags('not an array'), []);
    assert.deepEqual(parsePerspectiveTags(42), []);
  });

  it('should handle numeric values in array (coerce to string)', () => {
    const result = parsePerspectiveTags([123, 'scope:mvp']);
    assert.deepEqual(result, ['scope:mvp']);
  });

  it('should trim whitespace', () => {
    const result = parsePerspectiveTags(['  scope:mvp  ', ' user:test ']);
    assert.deepEqual(result, ['scope:mvp', 'user:test']);
  });
});

describe('computeDiversityScore', () => {
  it('should return 1.0 when no existing ideas', () => {
    assert.equal(computeDiversityScore(['scope:mvp'], []), 1.0);
  });

  it('should return 1.0 when new tags are empty', () => {
    assert.equal(computeDiversityScore([], [['scope:mvp']]), 1.0);
  });

  it('should return 0.0 for identical tags', () => {
    const tags = ['scope:mvp', 'user:hobbyist'];
    assert.equal(computeDiversityScore(tags, [tags]), 0);
  });

  it('should return > 0 for partially overlapping tags', () => {
    const newTags = ['scope:mvp', 'user:hobbyist'];
    const existing = [['scope:mvp', 'user:pro']];
    const score = computeDiversityScore(newTags, existing);
    assert.ok(score > 0);
    assert.ok(score < 1);
  });

  it('should return 1.0 for completely different tags', () => {
    const newTags = ['scope:mvp'];
    const existing = [['user:hobbyist']];
    assert.equal(computeDiversityScore(newTags, existing), 1.0);
  });

  it('should return minimum distance across all existing sets', () => {
    const newTags = ['scope:mvp', 'user:hobbyist'];
    const existing = [
      ['scope:full-platform', 'user:pro'],          // different
      ['scope:mvp', 'user:hobbyist'],                // identical
    ];
    // Should match nearest (identical → 0)
    assert.equal(computeDiversityScore(newTags, existing), 0);
  });
});

describe('validateDiversity', () => {
  it('should detect sufficient diversity', () => {
    const ideas = [
      { perspectiveTags: ['scope:mvp', 'user:hobbyist'] },
      { perspectiveTags: ['scope:full', 'interaction:cli'] },
      { perspectiveTags: ['user:pro', 'business:saas'] },
    ];
    const result = validateDiversity(ideas, 3);
    assert.equal(result.sufficient, true);
    assert.ok(result.dimensionCount >= 3);
  });

  it('should detect insufficient diversity', () => {
    const ideas = [
      { perspectiveTags: ['scope:mvp'] },
      { perspectiveTags: ['scope:full'] },
    ];
    const result = validateDiversity(ideas, 3);
    assert.equal(result.sufficient, false);
    assert.equal(result.dimensionCount, 1);
    assert.deepEqual(result.dimensions, ['scope']);
  });

  it('should handle ideas without perspectiveTags', () => {
    const ideas = [
      { title: 'no tags' },
      { perspectiveTags: ['scope:mvp'] },
    ];
    const result = validateDiversity(ideas, 1);
    assert.equal(result.sufficient, true);
    assert.equal(result.dimensionCount, 1);
  });

  it('should handle empty ideas list', () => {
    const result = validateDiversity([], 3);
    assert.equal(result.sufficient, false);
    assert.equal(result.dimensionCount, 0);
  });

  it('should return sorted dimension names', () => {
    const ideas = [
      { perspectiveTags: ['user:pro', 'scope:mvp', 'interaction:cli'] },
    ];
    const result = validateDiversity(ideas);
    assert.deepEqual(result.dimensions, ['interaction', 'scope', 'user']);
  });
});
