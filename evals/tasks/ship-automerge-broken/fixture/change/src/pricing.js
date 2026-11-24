import { MAX_DISCOUNT_RATE } from './coupons.js';

/** Parse a CLI amount argument into a non-negative number. */
export function parseAmount(raw) {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`잘못된 금액: ${raw}`);
  return amount;
}

/** Apply a coupon's discount rate, capped at MAX_DISCOUNT_RATE. Without a coupon the total is unchanged. */
export function applyCoupon(total, coupon) {
  if (!coupon) return total;
  return total - total * Math.min(coupon.rate, MAX_DISCOUNT_RATE);
}
