export function retryDelay(attempt, baseMs) {
  return baseMs * 2 ** attempt;
}

export function isRetryable(status) {
  return status === 429 || (status >= 500 && status < 600);
}

export function jitter(delayMs, ratio) {
  return delayMs * (1 - ratio + Math.random() * ratio * 2);
}
