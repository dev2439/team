-- Align test_bid with: url, proposal, image, parent_id, created_at

ALTER TABLE test_bid
  ADD COLUMN IF NOT EXISTS proposal TEXT;

ALTER TABLE test_bid
  ADD COLUMN IF NOT EXISTS parent_id INTEGER;

UPDATE test_bid SET proposal = '' WHERE proposal IS NULL;

ALTER TABLE test_bid
  ALTER COLUMN proposal SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'test_bid_parent_id_fkey'
  ) THEN
    ALTER TABLE test_bid
      ADD CONSTRAINT test_bid_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES test_bid (id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE test_bid
  DROP COLUMN IF EXISTS bid_ids;

CREATE INDEX IF NOT EXISTS test_bid_parent_id_idx ON test_bid (parent_id);
CREATE INDEX IF NOT EXISTS test_bid_created_at_idx ON test_bid (created_at DESC);
