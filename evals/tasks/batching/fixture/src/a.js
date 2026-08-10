export function parseDuration(text) {
  const match = /^(\d+)(ms|s|m|h)$/.exec(text.trim());
  return match ? { value: Number(match[1]), unit: match[2] } : null;
}

export function formatDuration({ value, unit }) {
  return `${value}${unit}`;
}
