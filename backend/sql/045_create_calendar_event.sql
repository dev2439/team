-- Team calendar events. starts_at is the moment everyone is notified.
CREATE TABLE IF NOT EXISTS calendar_event (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  notified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calendar_event_starts_at_idx
  ON calendar_event (starts_at);

CREATE INDEX IF NOT EXISTS calendar_event_user_id_idx
  ON calendar_event (user_id);

CREATE INDEX IF NOT EXISTS calendar_event_due_notify_idx
  ON calendar_event (starts_at)
  WHERE notified_at IS NULL;
