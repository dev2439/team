CREATE TABLE IF NOT EXISTS deposit (
  id SERIAL PRIMARY KEY,
  project_name TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deposit_created_at_idx ON deposit (created_at DESC);
