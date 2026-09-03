-- Ensure bid_test exists with the current schema (url + image + created_at).
CREATE TABLE IF NOT EXISTS bid_test (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  image TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bid_test_created_at_idx ON bid_test (created_at DESC);

-- Drop leftover test_bid table if it was created by earlier migrations.
DROP TABLE IF EXISTS test_bid;
