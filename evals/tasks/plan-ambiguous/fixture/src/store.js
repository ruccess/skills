/** An empty event log. Entries are never mutated in place. */
function createLog() {
  return { events: [] };
}

/** Return a new log with `event` appended. */
function append(log, event) {
  return { ...log, events: [...log.events, { ...event }] };
}

/** The most recent `count` events, newest last. */
function recent(log, count) {
  return log.events.slice(-count);
}

module.exports = { createLog, append, recent };
