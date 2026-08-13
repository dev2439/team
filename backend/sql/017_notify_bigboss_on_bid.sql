-- Also notify BigBoss users when a new bid is inserted.
CREATE OR REPLACE FUNCTION notify_sub_team_on_bid_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Same sub-team members (excluding the actor)
  INSERT INTO bid_notification (bid_id, recipient_user_id, actor_user_id)
  SELECT
    NEW.id,
    member_id,
    NEW.user_id
  FROM sub_team st
  CROSS JOIN LATERAL unnest(COALESCE(st.user_ids, '{}'::integer[])) AS member_id
  WHERE NEW.user_id = ANY(COALESCE(st.user_ids, '{}'::integer[]))
    AND member_id IS DISTINCT FROM NEW.user_id;

  -- All BigBoss users (excluding the actor if they are a BigBoss)
  INSERT INTO bid_notification (bid_id, recipient_user_id, actor_user_id)
  SELECT
    NEW.id,
    u.id,
    NEW.user_id
  FROM users u
  WHERE u.role = 'BigBoss'
    AND u.id IS DISTINCT FROM NEW.user_id
    AND NOT EXISTS (
      SELECT 1
      FROM bid_notification n
      WHERE n.bid_id = NEW.id
        AND n.recipient_user_id = u.id
    );

  RETURN NEW;
END;
$$;
