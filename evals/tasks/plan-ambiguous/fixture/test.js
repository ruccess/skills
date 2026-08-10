const test = require('node:test');
const assert = require('node:assert');
const { makeEvent, filterBySeverity } = require('./src/events');
const { createLog, append, recent } = require('./src/store');

test('makeEvent rejects an unknown severity', () => {
  assert.throws(() => makeEvent({ id: 'e1', kind: 'deploy', severity: 'fatal' }), /unknown severity/);
});

test('filterBySeverity keeps events at or above the floor', () => {
  const events = [
    makeEvent({ id: 'e1', kind: 'deploy', severity: 'info', at: 1 }),
    makeEvent({ id: 'e2', kind: 'outage', severity: 'critical', at: 2 }),
  ];
  assert.deepStrictEqual(filterBySeverity(events, 'warning').map((event) => event.id), ['e2']);
});

test('append leaves the original log untouched', () => {
  const log = createLog();
  const next = append(log, makeEvent({ id: 'e3', kind: 'deploy', at: 3 }));
  assert.strictEqual(log.events.length, 0);
  assert.deepStrictEqual(recent(next, 1)[0].id, 'e3');
});
