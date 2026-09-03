-- Proposal is optional for bid tests (URL + image only).
ALTER TABLE test_bid
  ALTER COLUMN proposal DROP NOT NULL;
