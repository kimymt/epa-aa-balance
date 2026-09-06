-- Admission history is separate from legacy request_log. Denials are not stored.
CREATE TABLE IF NOT EXISTS rate_reservations (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  units INTEGER NOT NULL CHECK (units > 0),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reservation_ip ON rate_reservations(endpoint, ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_reservation_global ON rate_reservations(endpoint, created_at);
CREATE INDEX IF NOT EXISTS idx_reservation_expiry ON rate_reservations(created_at);
CREATE INDEX IF NOT EXISTS idx_request_log_expiry ON request_log(created_at);
