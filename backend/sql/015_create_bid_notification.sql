-- Notifications for same sub-team members when a new bid is inserted.
CREATE TABLE IF NOT EXISTS bid_notification (
  id SERIAL PRIMARY KEY,
  bid_id INTEGER NOT NULL REFERENCES bid (id) ON DELETE CASCADE,
  recipient_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  actor_user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bid_notification_recipient_unread_idx
  ON bid_notification (recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS bid_notification_bid_id_idx
  ON bid_notification (bid_id);

-- When a bid row is inserted, notify every other member of the same sub team.
CREATE OR REPLACE FUNCTION notify_sub_team_on_bid_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO bid_notification (bid_id, recipient_user_id, actor_user_id)
  SELECT
    NEW.id,
    member_id,
    NEW.user_id
  FROM sub_team st
  CROSS JOIN LATERAL unnest(COALESCE(st.user_ids, '{}'::integer[])) AS member_id
  WHERE NEW.user_id = ANY(COALESCE(st.user_ids, '{}'::integer[]))
    AND member_id IS DISTINCT FROM NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bid_after_insert_notify_sub_team ON bid;

CREATE TRIGGER bid_after_insert_notify_sub_team
AFTER INSERT ON bid
FOR EACH ROW
EXECUTE PROCEDURE notify_sub_team_on_bid_insert();
