CREATE TABLE IF NOT EXISTS freelancer_bid (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  proposal TEXT NOT NULL,
  image TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS freelancer_bid_user_id_idx ON freelancer_bid (user_id);
CREATE INDEX IF NOT EXISTS freelancer_bid_created_at_idx ON freelancer_bid (created_at DESC);
