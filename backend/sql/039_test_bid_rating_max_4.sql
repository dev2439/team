-- Cap star ratings at 4 (was 5).
UPDATE test_bid_rating
SET rating = 4
WHERE rating IS NOT NULL
  AND rating > 4;

ALTER TABLE test_bid_rating
  DROP CONSTRAINT IF EXISTS test_bid_rating_rating_check;

ALTER TABLE test_bid_rating
  ADD CONSTRAINT test_bid_rating_rating_check
  CHECK (rating IS NULL OR (rating >= 1 AND rating <= 4));
