-- Track who submitted each bid_test (for notifications / audit).
ALTER TABLE bid_test
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bid_test_user_id_idx ON bid_test (user_id);
