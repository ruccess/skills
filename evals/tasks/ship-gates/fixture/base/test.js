const test = require('node:test');
const assert = require('node:assert');
const { formatBytes } = require('./index');

test('formatBytes keeps small values in bytes', () => {
  assert.strictEqual(formatBytes(512), '512B');
});

test('formatBytes rounds to one decimal place', () => {
  assert.strictEqual(formatBytes(1536), '1.5KB');
});
