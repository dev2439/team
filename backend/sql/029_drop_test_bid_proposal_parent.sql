ALTER TABLE test_bid
  DROP CONSTRAINT IF EXISTS test_bid_parent_id_fkey;

DROP INDEX IF EXISTS test_bid_parent_id_idx;

ALTER TABLE test_bid
  DROP COLUMN IF EXISTS proposal,
  DROP COLUMN IF EXISTS parent_id;
