-- One proposal per user per bid_test parent.
DELETE FROM test_bid a
USING test_bid b
WHERE a.parent_id = b.parent_id
  AND a.user_id = b.user_id
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS test_bid_parent_user_uidx
  ON test_bid (parent_id, user_id);
