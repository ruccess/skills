/** Parse a CLI amount argument into a non-negative number. */
export function parseAmount(raw) {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`잘못된 금액: ${raw}`);
  return amount;
}
