ALTER TABLE project
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users (id) ON DELETE CASCADE;

DELETE FROM project WHERE user_id IS NULL;

ALTER TABLE project
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS project_user_id_idx ON project (user_id);
