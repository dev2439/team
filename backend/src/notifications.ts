import { query } from "./db.ts";
import type {
  BidNotification,
  NotificationKind,
} from "./types/notification.ts";

type NotificationRow = {
  id: number;
  kind: NotificationKind;
  bid_id: number | null;
  bid_test_id: number | null;
  event_id: number | null;
  recipient_user_id: number;
  actor_user_id: number;
  actor_name: string | null;
  bid_url: string | null;
  event_title: string | null;
  read_at: Date | string | null;
  created_at: Date | string;
};

function mapRow(row: NotificationRow): BidNotification {
  return {
    id: row.id,
    kind: row.kind,
    bid_id: row.bid_id,
    bid_test_id: row.bid_test_id,
    event_id: row.event_id,
    recipient_user_id: row.recipient_user_id,
    actor_user_id: row.actor_user_id,
    actor_name: row.actor_name ?? "Teammate",
    bid_url: row.bid_url ?? "",
    event_title: row.event_title ?? "",
    read_at:
      row.read_at == null
        ? null
        : row.read_at instanceof Date
          ? row.read_at.toISOString()
          : String(row.read_at),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

export async function listUnreadBidNotifications(
  recipientUserId: number,
): Promise<BidNotification[]> {
  const { rows } = await query<NotificationRow>(
    `SELECT * FROM (
       SELECT
         n.id,
         'bid'::text AS kind,
         n.bid_id,
         NULL::integer AS bid_test_id,
         NULL::integer AS event_id,
         n.recipient_user_id,
         n.actor_user_id,
         u.name AS actor_name,
         b.url AS bid_url,
         NULL::text AS event_title,
         n.read_at,
         n.created_at
       FROM bid_notification n
       JOIN users u ON u.id = n.actor_user_id
       JOIN bid b ON b.id = n.bid_id
       WHERE n.recipient_user_id = $1
         AND n.read_at IS NULL

       UNION ALL

       SELECT
         n.id,
         'bid_test'::text AS kind,
         NULL::integer AS bid_id,
         n.bid_test_id,
         NULL::integer AS event_id,
         n.recipient_user_id,
         n.actor_user_id,
         u.name AS actor_name,
         bt.url AS bid_url,
         NULL::text AS event_title,
         n.read_at,
         n.created_at
       FROM bid_test_notification n
       JOIN users u ON u.id = n.actor_user_id
       JOIN bid_test bt ON bt.id = n.bid_test_id
       WHERE n.recipient_user_id = $1
         AND n.read_at IS NULL

       UNION ALL

       SELECT
         n.id,
         'event'::text AS kind,
         NULL::integer AS bid_id,
         NULL::integer AS bid_test_id,
         n.event_id,
         n.recipient_user_id,
         n.actor_user_id,
         u.name AS actor_name,
         ''::text AS bid_url,
         e.title AS event_title,
         n.read_at,
         n.created_at
       FROM event_notification n
       JOIN users u ON u.id = n.actor_user_id
       JOIN calendar_event e ON e.id = n.event_id
       WHERE n.recipient_user_id = $1
         AND n.read_at IS NULL

       UNION ALL

       SELECT
         n.id,
         'birthday'::text AS kind,
         NULL::integer AS bid_id,
         NULL::integer AS bid_test_id,
         NULL::integer AS event_id,
         n.recipient_user_id,
         n.actor_user_id,
         u.name AS actor_name,
         ''::text AS bid_url,
         NULL::text AS event_title,
         n.read_at,
         n.created_at
       FROM birthday_notification n
       JOIN users u ON u.id = n.actor_user_id
       WHERE n.recipient_user_id = $1
         AND n.read_at IS NULL
     ) AS combined
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    [recipientUserId],
  );
  return rows.map(mapRow);
}

export async function createBidTestNotifications(input: {
  bidTestId: number;
  actorUserId: number;
}): Promise<void> {
  await query(
    `INSERT INTO bid_test_notification (bid_test_id, recipient_user_id, actor_user_id)
     SELECT $1, u.id, $2
     FROM users u
     WHERE u.id IS DISTINCT FROM $2
       AND u.role IN ('Member', 'SubBoss', 'Tester')`,
    [input.bidTestId, input.actorUserId],
  );
}

export type NotificationReadItem = {
  id: number;
  kind: NotificationKind;
};

export async function markBidNotificationsRead(
  recipientUserId: number,
  items?: NotificationReadItem[],
): Promise<number> {
  if (items && items.length > 0) {
    const bidIds = items
      .filter((item) => item.kind === "bid")
      .map((item) => item.id);
    const bidTestIds = items
      .filter((item) => item.kind === "bid_test")
      .map((item) => item.id);
    const eventIds = items
      .filter((item) => item.kind === "event")
      .map((item) => item.id);
    const birthdayIds = items
      .filter((item) => item.kind === "birthday")
      .map((item) => item.id);

    let updated = 0;

    if (bidIds.length > 0) {
      const { rowCount } = await query(
        `UPDATE bid_notification
         SET read_at = NOW()
         WHERE recipient_user_id = $1
           AND read_at IS NULL
           AND id = ANY($2::integer[])`,
        [recipientUserId, bidIds],
      );
      updated += rowCount ?? 0;
    }

    if (bidTestIds.length > 0) {
      const { rowCount } = await query(
        `UPDATE bid_test_notification
         SET read_at = NOW()
         WHERE recipient_user_id = $1
           AND read_at IS NULL
           AND id = ANY($2::integer[])`,
        [recipientUserId, bidTestIds],
      );
      updated += rowCount ?? 0;
    }

    if (eventIds.length > 0) {
      const { rowCount } = await query(
        `UPDATE event_notification
         SET read_at = NOW()
         WHERE recipient_user_id = $1
           AND read_at IS NULL
           AND id = ANY($2::integer[])`,
        [recipientUserId, eventIds],
      );
      updated += rowCount ?? 0;
    }

    if (birthdayIds.length > 0) {
      const { rowCount } = await query(
        `UPDATE birthday_notification
         SET read_at = NOW()
         WHERE recipient_user_id = $1
           AND read_at IS NULL
           AND id = ANY($2::integer[])`,
        [recipientUserId, birthdayIds],
      );
      updated += rowCount ?? 0;
    }

    return updated;
  }

  const bidResult = await query(
    `UPDATE bid_notification
     SET read_at = NOW()
     WHERE recipient_user_id = $1
       AND read_at IS NULL`,
    [recipientUserId],
  );
  const bidTestResult = await query(
    `UPDATE bid_test_notification
     SET read_at = NOW()
     WHERE recipient_user_id = $1
       AND read_at IS NULL`,
    [recipientUserId],
  );
  const eventResult = await query(
    `UPDATE event_notification
     SET read_at = NOW()
     WHERE recipient_user_id = $1
       AND read_at IS NULL`,
    [recipientUserId],
  );
  const birthdayResult = await query(
    `UPDATE birthday_notification
     SET read_at = NOW()
     WHERE recipient_user_id = $1
       AND read_at IS NULL`,
    [recipientUserId],
  );
  return (
    (bidResult.rowCount ?? 0) +
    (bidTestResult.rowCount ?? 0) +
    (eventResult.rowCount ?? 0) +
    (birthdayResult.rowCount ?? 0)
  );
}
