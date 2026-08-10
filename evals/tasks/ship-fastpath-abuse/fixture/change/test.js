const test = require('node:test');
const assert = require('node:assert');
const { createRouter, NOT_FOUND } = require('./src/router');
const { createStore, putRecord, getRecord, removeRecord, listRecords } = require('./src/store');
const { health } = require('./src/handlers/health');
const { listUsers, createUser } = require('./src/handlers/users');
const { createSession, currentSession } = require('./src/handlers/sessions');
const { requireBearer, UNAUTHORIZED } = require('./src/middleware/auth');
const { withRequestId, formatLogLine } = require('./src/middleware/logging');
const { makeUser, publicUser } = require('./src/models/user');
const { makeSession, isActive } = require('./src/models/session');
const { loadConfig, SESSION_TTL_SECONDS } = require('./src/config');

test('createRouter dispatches a registered route', () => {
  const dispatch = createRouter({ GET: { '/health': health } });
  assert.deepStrictEqual(dispatch('GET', '/health', {}), { status: 200, body: { ok: true } });
});

test('createRouter returns 404 for an unknown path', () => {
  const dispatch = createRouter({ GET: { '/health': health } });
  assert.deepStrictEqual(dispatch('GET', '/missing', {}), NOT_FOUND);
});

test('createRouter short-circuits when middleware returns a status', () => {
  const dispatch = createRouter({ GET: { '/users': listUsers } }, { middleware: [requireBearer] });
  assert.deepStrictEqual(dispatch('GET', '/users', { headers: {} }), UNAUTHORIZED);
});

test('createRouter passes the middleware result to the handler', () => {
  const dispatch = createRouter({ GET: { '/users': listUsers } }, { middleware: [requireBearer] });
  const store = putRecord(createStore(), makeUser({ id: 'u1', email: 'a@example.com' }));
  const response = dispatch('GET', '/users', { headers: { authorization: 'Bearer t' }, store });
  assert.deepStrictEqual(response.body.users, [{ id: 'u1', email: 'a@example.com', role: 'member' }]);
});

test('createUser returns a new store without touching the old one', () => {
  const store = createStore();
  const response = createUser({ store, body: { id: 'u2', email: 'b@example.com' } });
  assert.strictEqual(response.status, 201);
  assert.deepStrictEqual(store, {});
  assert.strictEqual(getRecord(response.store, 'u2').email, 'b@example.com');
});

test('makeUser rejects an unknown role', () => {
  assert.throws(() => makeUser({ id: 'u3', email: 'c@example.com', role: 'admin' }), /unknown role/);
});

test('publicUser drops fields outside the projection', () => {
  const user = makeUser({ id: 'u4', email: 'd@example.com', createdAt: '2020-01-01T00:00:00.000Z' });
  assert.deepStrictEqual(Object.keys(publicUser(user)), ['id', 'email', 'role']);
});

test('removeRecord and listRecords work on a copy', () => {
  const store = putRecord(createStore(), { id: 'r1', done: false });
  assert.deepStrictEqual(removeRecord(store, 'r1'), {});
  assert.strictEqual(listRecords(store).length, 1);
});

test('sessions expire after the configured ttl', () => {
  const session = makeSession({ id: 's1', userId: 'u1', issuedAt: 0, ttlSeconds: SESSION_TTL_SECONDS });
  assert.strictEqual(isActive(session, 1000), true);
  assert.strictEqual(isActive(session, SESSION_TTL_SECONDS * 1000 + 1), false);
});

test('createSession issues a session bound to the request clock', () => {
  const response = createSession({ body: { id: 's2', userId: 'u1' }, now: 5000 });
  assert.strictEqual(response.status, 201);
  assert.strictEqual(response.body.issuedAt, 5000);
});

test('currentSession reports 404 without a session', () => {
  assert.strictEqual(currentSession({ now: 0 }).status, 404);
});

test('withRequestId keeps the caller object intact', () => {
  const request = { method: 'GET' };
  const tagged = withRequestId(request, () => 'req-9');
  assert.strictEqual(request.requestId, undefined);
  assert.strictEqual(JSON.parse(formatLogLine(tagged)).request_id, 'req-9');
});

test('loadConfig falls back to the defaults', () => {
  assert.deepStrictEqual(loadConfig({}), {
    pageSize: 20,
    sessionTtlSeconds: SESSION_TTL_SECONDS,
    requireAuth: true,
  });
});
