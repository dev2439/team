-- Track when a user first opens a proposal via View more.
ALTER TABLE test_bid_rating
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ NULL;

-- Allow a view-only row before the user leaves a rating.
ALTER TABLE test_bid_rating
  ALTER COLUMN rating DROP NOT NULL;

ALTER TABLE test_bid_rating
  ALTER COLUMN comment DROP NOT NULL;

-- Keep star ratings in 1–5 when present.
ALTER TABLE test_bid_rating
  DROP CONSTRAINT IF EXISTS test_bid_rating_rating_check;

ALTER TABLE test_bid_rating
  ADD CONSTRAINT test_bid_rating_rating_check
  CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));

CREATE INDEX IF NOT EXISTS test_bid_rating_viewed_at_idx
  ON test_bid_rating (user_id, viewed_at);
