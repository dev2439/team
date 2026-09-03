ALTER TABLE test_bid
  ADD COLUMN IF NOT EXISTS user_id INTEGER;

UPDATE test_bid
SET user_id = (
  SELECT id FROM users ORDER BY id ASC LIMIT 1
)
WHERE user_id IS NULL;

ALTER TABLE test_bid
  ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'test_bid_user_id_fkey'
  ) THEN
    ALTER TABLE test_bid
      ADD CONSTRAINT test_bid_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS test_bid_user_id_idx ON test_bid (user_id);
