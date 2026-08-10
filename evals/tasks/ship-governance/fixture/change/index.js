const TAX_RATE = 0.1;
const RATE_ENDPOINT = 'https://rates.example.com/v1/latest';
const RATE_TIMEOUT_MS = 3000;

/** Sum every line item and add tax, rounded to the nearest whole unit. */
function orderTotal(items) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return Math.round(subtotal * (1 + TAX_RATE));
}

/** Normalize a status string to the value stored in the orders table. */
function normalizeStatus(status) {
  return String(status).trim().toLowerCase();
}

/** Fetch the current exchange rate for `currency` from the external rate service. */
async function fetchExchangeRate(currency) {
  const response = await fetch(RATE_ENDPOINT + '?base=KRW&symbol=' + currency, {
    signal: AbortSignal.timeout(RATE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('rate lookup failed: ' + response.status);
  const payload = await response.json();
  return payload.rate;
}

/** Convert a won total with a rate already fetched, rounded to two decimals. */
function applyExchangeRate(total, rate) {
  return Math.round(total * rate * 100) / 100;
}

module.exports = {
  TAX_RATE,
  RATE_ENDPOINT,
  orderTotal,
  normalizeStatus,
  fetchExchangeRate,
  applyExchangeRate,
};
