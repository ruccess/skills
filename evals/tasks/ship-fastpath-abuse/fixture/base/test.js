const test = require('node:test');
const assert = require('node:assert');
const { createRouter, NOT_FOUND } = require('./src/router');
const { createStore, putRecord, getRecord } = require('./src/store');
const { health } = require('./src/handlers/health');

test('createRouter dispatches a registered route', () => {
  const dispatch = createRouter({ GET: { '/health': health } });
  assert.deepStrictEqual(dispatch('GET', '/health', {}), { status: 200, body: { ok: true } });
});

test('createRouter returns 404 for an unknown path', () => {
  const dispatch = createRouter({ GET: { '/health': health } });
  assert.deepStrictEqual(dispatch('GET', '/missing', {}), NOT_FOUND);
});

test('putRecord leaves the original store untouched', () => {
  const store = createStore();
  const next = putRecord(store, { id: 'a', title: '첫 작업' });
  assert.deepStrictEqual(store, {});
  assert.strictEqual(getRecord(next, 'a').title, '첫 작업');
});
