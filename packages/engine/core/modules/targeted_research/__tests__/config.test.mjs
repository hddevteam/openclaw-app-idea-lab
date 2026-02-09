import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTargetedConfig, parseCliArgs, DEFAULTS } from '../config.mjs';

describe('parseTargetedConfig', () => {
  it('should reject when topic is missing', () => {
    const result = parseTargetedConfig({});
    assert.equal(result.ok, false);
    assert.match(result.error, /topic/i);
  });

  it('should reject when topic is empty string', () => {
    const result = parseTargetedConfig({ topic: '   ' });
    assert.equal(result.ok, false);
  });

  it('should accept valid topic and fill defaults', () => {
    const result = parseTargetedConfig({ topic: '摄影师资产维护工具' });
    assert.equal(result.ok, true);
    assert.equal(result.value.topic, '摄影师资产维护工具');
    assert.equal(result.value.creative, DEFAULTS.creative);
    assert.equal(result.value.count, DEFAULTS.count);
    assert.deepEqual(result.value.searchLangs, DEFAULTS.searchLangs);
    assert.equal(result.value.contextTokenBudget, DEFAULTS.contextTokenBudget);
  });

  it('should clamp creative to [0, 1]', () => {
    assert.equal(parseTargetedConfig({ topic: 'x', creative: -0.5 }).value.creative, 0);
    assert.equal(parseTargetedConfig({ topic: 'x', creative: 2.0 }).value.creative, 1);
    assert.equal(parseTargetedConfig({ topic: 'x', creative: 0.8 }).value.creative, 0.8);
  });

  it('should clamp count to [3, 12]', () => {
    assert.equal(parseTargetedConfig({ topic: 'x', count: 1 }).value.count, 3);
    assert.equal(parseTargetedConfig({ topic: 'x', count: 50 }).value.count, 12);
    assert.equal(parseTargetedConfig({ topic: 'x', count: 8 }).value.count, 8);
  });

  it('should round count to integer', () => {
    assert.equal(parseTargetedConfig({ topic: 'x', count: 7.6 }).value.count, 8);
    assert.equal(parseTargetedConfig({ topic: 'x', count: 4.2 }).value.count, 4);
  });

  it('should use custom searchLangs when provided', () => {
    const result = parseTargetedConfig({ topic: 'x', searchLangs: ['en'] });
    assert.deepEqual(result.value.searchLangs, ['en']);
  });

  it('should not mutate DEFAULTS.searchLangs', () => {
    const result = parseTargetedConfig({ topic: 'x' });
    result.value.searchLangs.push('ja');
    assert.equal(DEFAULTS.searchLangs.length, 2);
  });

  it('should enforce minimum contextTokenBudget of 2000', () => {
    assert.equal(parseTargetedConfig({ topic: 'x', contextTokenBudget: 500 }).value.contextTokenBudget, 2000);
  });
});

describe('parseCliArgs', () => {
  it('should parse --key value pairs', () => {
    const result = parseCliArgs(['--topic', '摄影师工具', '--count', '8']);
    assert.equal(result.topic, '摄影师工具');
    assert.equal(result.count, '8');
  });

  it('should parse --key=value pairs', () => {
    const result = parseCliArgs(['--topic=摄影师工具', '--creative=0.7']);
    assert.equal(result.topic, '摄影师工具');
    assert.equal(result.creative, '0.7');
  });

  it('should handle boolean flags (--flag without value)', () => {
    const result = parseCliArgs(['--verbose', '--topic', 'x']);
    assert.equal(result.verbose, true);
    assert.equal(result.topic, 'x');
  });

  it('should skip non-flag arguments', () => {
    const result = parseCliArgs(['ignored', '--topic', 'x']);
    assert.equal(result.topic, 'x');
    assert.equal(Object.keys(result).length, 1);
  });

  it('should handle empty argv', () => {
    const result = parseCliArgs([]);
    assert.deepEqual(result, {});
  });
});
