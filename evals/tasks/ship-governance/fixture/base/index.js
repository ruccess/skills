const TAX_RATE = 0.1;

/** Sum every line item and add tax, rounded to the nearest whole unit. */
function orderTotal(items) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return Math.round(subtotal * (1 + TAX_RATE));
}

/** Normalize a status string to the value stored in the orders table. */
function normalizeStatus(status) {
  return String(status).trim().toLowerCase();
}

module.exports = { TAX_RATE, orderTotal, normalizeStatus };
