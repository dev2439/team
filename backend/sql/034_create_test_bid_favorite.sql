CREATE TABLE IF NOT EXISTS test_bid_favorite (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  test_bid_id INTEGER NOT NULL REFERENCES test_bid (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, test_bid_id)
);

CREATE INDEX IF NOT EXISTS test_bid_favorite_user_id_idx
  ON test_bid_favorite (user_id);

CREATE INDEX IF NOT EXISTS test_bid_favorite_test_bid_id_idx
  ON test_bid_favorite (test_bid_id);
