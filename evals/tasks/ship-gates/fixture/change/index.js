/** Sum every integer from `from` to `to`, inclusive on both ends. */
function sumRange(from, to) {
  let total = 0;
  for (let i = from; i < to; i += 1) {
    total += i;
  }
  return total;
}

/** Format a byte count as a short human-readable string. */
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded}${units[unitIndex]}`;
}

module.exports = { sumRange, formatBytes };
