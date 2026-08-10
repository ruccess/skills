const test = require('node:test');
const assert = require('node:assert');
const { orderTotal, normalizeStatus } = require('./index');

test('orderTotal adds tax to the line item subtotal', () => {
  assert.strictEqual(orderTotal([{ price: 1000, quantity: 2 }]), 2200);
});

test('normalizeStatus trims and lowercases', () => {
  assert.strictEqual(normalizeStatus('  PAID '), 'paid');
});
