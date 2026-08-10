CREATE TABLE IF NOT EXISTS financial (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS financial_user_id_idx ON financial (user_id);
CREATE INDEX IF NOT EXISTS financial_created_at_idx ON financial (created_at DESC);
CREATE INDEX IF NOT EXISTS financial_type_idx ON financial (type);
