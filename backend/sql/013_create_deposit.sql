CREATE TABLE IF NOT EXISTS deposit (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES project (id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deposit_created_at_idx ON deposit (created_at DESC);
CREATE INDEX IF NOT EXISTS deposit_user_id_idx ON deposit (user_id);
CREATE INDEX IF NOT EXISTS deposit_project_id_idx ON deposit (project_id);
