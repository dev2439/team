-- Birthday (date of birth). Notifications fire when that month/day starts in JST.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birthday DATE NULL;

CREATE TABLE IF NOT EXISTS birthday_notification (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  recipient_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  actor_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT birthday_notification_user_recipient_year_unique
    UNIQUE (user_id, recipient_user_id, year)
);

CREATE INDEX IF NOT EXISTS birthday_notification_recipient_unread_idx
  ON birthday_notification (recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;
