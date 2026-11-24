import { readFile } from 'node:fs/promises';

export const MAX_DISCOUNT_RATE = 0.5;

const COUPONS_FILE = new URL('../data/coupons.json', import.meta.url);

/** Look up a coupon by its code. Resolves to `{ rate }`, or null for an unknown code. */
export async function lookupCoupon(code) {
  const coupons = JSON.parse(await readFile(COUPONS_FILE, 'utf8'));
  const coupon = coupons[code];
  return coupon ? { rate: coupon.rate } : null;
}
