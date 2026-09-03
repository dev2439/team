CREATE TABLE IF NOT EXISTS test_bid (
  id SERIAL PRIMARY KEY,
  proposal TEXT NOT NULL,
  parent_id INTEGER NOT NULL REFERENCES bid_test (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS test_bid_parent_id_idx ON test_bid (parent_id);
CREATE INDEX IF NOT EXISTS test_bid_created_at_idx ON test_bid (created_at DESC);
