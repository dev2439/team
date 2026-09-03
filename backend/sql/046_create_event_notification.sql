-- Notify every user when a calendar event's start time arrives.
CREATE TABLE IF NOT EXISTS event_notification (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES calendar_event (id) ON DELETE CASCADE,
  recipient_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  actor_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_notification_recipient_unread_idx
  ON event_notification (recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS event_notification_event_id_idx
  ON event_notification (event_id);
