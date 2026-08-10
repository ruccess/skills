export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function flatten(groups) {
  return groups.reduce((acc, group) => acc.concat(group), []);
}

export function unique(items) {
  return [...new Set(items)];
}
