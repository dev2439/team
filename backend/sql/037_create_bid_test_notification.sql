-- Notify all users except the submitter when a new bid_test is created.
CREATE TABLE IF NOT EXISTS bid_test_notification (
  id SERIAL PRIMARY KEY,
  bid_test_id INTEGER NOT NULL REFERENCES bid_test (id) ON DELETE CASCADE,
  recipient_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  actor_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bid_test_notification_recipient_unread_idx
  ON bid_test_notification (recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS bid_test_notification_bid_test_id_idx
  ON bid_test_notification (bid_test_id);
