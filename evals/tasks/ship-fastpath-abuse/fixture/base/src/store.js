/** An empty record store. Records are keyed by id and never mutated in place. */
function createStore() {
  return {};
}

/** Return a new store with `record` stored under its id. */
function putRecord(store, record) {
  return { ...store, [record.id]: { ...record } };
}

/** Return the record for `id`, or null when it is absent. */
function getRecord(store, id) {
  return store[id] ?? null;
}

module.exports = { createStore, putRecord, getRecord };
