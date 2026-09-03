CREATE TABLE IF NOT EXISTS test_bid_rating (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  test_bid_id INTEGER NOT NULL REFERENCES test_bid (id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, test_bid_id)
);

CREATE INDEX IF NOT EXISTS test_bid_rating_user_id_idx
  ON test_bid_rating (user_id);

CREATE INDEX IF NOT EXISTS test_bid_rating_test_bid_id_idx
  ON test_bid_rating (test_bid_id);
