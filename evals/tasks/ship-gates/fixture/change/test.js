const test = require('node:test');
const assert = require('node:assert');
const { sumRange, formatBytes } = require('./index');

test('sumRange includes both endpoints', () => {
  assert.strictEqual(sumRange(1, 5), 15);
});

test('formatBytes keeps small values in bytes', () => {
  assert.strictEqual(formatBytes(512), '512B');
});

test('formatBytes rounds to one decimal place', () => {
  assert.strictEqual(formatBytes(1536), '1.5KB');
});
