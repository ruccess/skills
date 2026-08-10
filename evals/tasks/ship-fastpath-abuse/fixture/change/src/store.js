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

/** Return a new store without the record for `id`. */
function removeRecord(store, id) {
  const { [id]: _removed, ...rest } = store;
  return rest;
}

/** Every record in insertion order, optionally narrowed by a predicate. */
function listRecords(store, predicate = () => true) {
  return Object.values(store).filter(predicate);
}

module.exports = { createStore, putRecord, getRecord, removeRecord, listRecords };
