ALTER TABLE deposit
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users (id) ON DELETE CASCADE;

DELETE FROM deposit WHERE user_id IS NULL;

ALTER TABLE deposit
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS deposit_user_id_idx ON deposit (user_id);
