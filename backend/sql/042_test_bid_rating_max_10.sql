-- Raise star ratings cap from 4 to 10.
ALTER TABLE test_bid_rating
  DROP CONSTRAINT IF EXISTS test_bid_rating_rating_check;

ALTER TABLE test_bid_rating
  ADD CONSTRAINT test_bid_rating_rating_check
  CHECK (rating IS NULL OR (rating >= 1 AND rating <= 10));
