export function groupBy(items, keyOf) {
  const out = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

export function countBy(items, keyOf) {
  const out = new Map();
  for (const item of items) out.set(keyOf(item), (out.get(keyOf(item)) ?? 0) + 1);
  return out;
}
