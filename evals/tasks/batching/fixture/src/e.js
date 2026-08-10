export function pick(source, keys) {
  return Object.fromEntries(keys.filter((k) => k in source).map((k) => [k, source[k]]));
}

export function omit(source, keys) {
  const drop = new Set(keys);
  return Object.fromEntries(Object.entries(source).filter(([k]) => !drop.has(k)));
}
