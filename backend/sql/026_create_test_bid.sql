CREATE TABLE IF NOT EXISTS test_bid (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  proposal TEXT NOT NULL,
  image TEXT NULL,
  parent_id INTEGER NULL REFERENCES test_bid (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS test_bid_parent_id_idx ON test_bid (parent_id);
CREATE INDEX IF NOT EXISTS test_bid_created_at_idx ON test_bid (created_at DESC);
