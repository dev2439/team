CREATE TABLE IF NOT EXISTS project (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_created_at_idx ON project (created_at DESC);
CREATE INDEX IF NOT EXISTS project_user_id_idx ON project (user_id);
