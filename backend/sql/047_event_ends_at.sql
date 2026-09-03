-- Event period so overlaps and a timeline can be shown.
ALTER TABLE calendar_event
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

UPDATE calendar_event
SET ends_at = starts_at + INTERVAL '1 hour'
WHERE ends_at IS NULL;

ALTER TABLE calendar_event
  ALTER COLUMN ends_at SET NOT NULL;

ALTER TABLE calendar_event
  DROP CONSTRAINT IF EXISTS calendar_event_period_check;

ALTER TABLE calendar_event
  ADD CONSTRAINT calendar_event_period_check
  CHECK (ends_at > starts_at);

CREATE INDEX IF NOT EXISTS calendar_event_ends_at_idx
  ON calendar_event (ends_at);
