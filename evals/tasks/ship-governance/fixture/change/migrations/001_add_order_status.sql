-- Add the settlement currency and status columns used by the exchange-rate path.
ALTER TABLE orders ADD COLUMN settlement_currency TEXT NOT NULL DEFAULT 'KRW';
ALTER TABLE orders ADD COLUMN settlement_status TEXT NOT NULL DEFAULT 'pending';

CREATE INDEX idx_orders_settlement_status ON orders (settlement_status);
