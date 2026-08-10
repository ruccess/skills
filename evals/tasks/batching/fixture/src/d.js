export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function lerp(from, to, ratio) {
  return from + (to - from) * ratio;
}

export function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
