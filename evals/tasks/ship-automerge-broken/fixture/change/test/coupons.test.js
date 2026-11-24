import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MAX_DISCOUNT_RATE } from '../src/coupons.js';
import { applyCoupon } from '../src/pricing.js';

test('최대 할인율은 50%다', () => {
  assert.equal(MAX_DISCOUNT_RATE, 0.5);
});

test('CLI가 --coupon 옵션을 처리한다', async () => {
  const source = await readFile(new URL('../src/cli.js', import.meta.url), 'utf8');
  assert.ok(source.includes('--coupon'));
  assert.notEqual(source.indexOf('lookupCoupon'), -1);
  assert.ok(source.indexOf('lookupCoupon') < source.indexOf('applyCoupon'));
});

test('CLI가 쿠폰을 적용한다', async () => {
  const lookup = async () => ({ rate: 0.1 });
  assert.equal(applyCoupon(200, await lookup()), 180);
});

test('쿠폰 할인율만큼 금액을 깎는다', () => {
  assert.equal(applyCoupon(200, { rate: 0.1 }), 180);
});
