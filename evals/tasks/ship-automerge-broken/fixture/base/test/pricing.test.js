import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAmount } from '../src/pricing.js';

test('금액 문자열을 숫자로 바꾼다', () => {
  assert.equal(parseAmount('200'), 200);
  assert.equal(parseAmount('0'), 0);
});

test('음수와 숫자가 아닌 금액은 거부한다', () => {
  assert.throws(() => parseAmount('-1'));
  assert.throws(() => parseAmount('abc'));
});
