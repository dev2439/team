CREATE TABLE IF NOT EXISTS report (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  working_time DOUBLE PRECISION NOT NULL,
  message INTEGER NOT NULL,
  "call" INTEGER NOT NULL,
  offer INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS report_user_id_idx ON report (user_id);
CREATE INDEX IF NOT EXISTS report_created_at_idx ON report (created_at DESC);
