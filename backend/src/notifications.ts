import { query } from "./db.ts";
import type { BidNotification } from "./types/notification.ts";

type BidNotificationRow = {
  id: number;
  bid_id: number;
  recipient_user_id: number;
  actor_user_id: number;
  actor_name: string | null;
  bid_url: string | null;
  read_at: Date | string | null;
  created_at: Date | string;
};

function mapRow(row: BidNotificationRow): BidNotification {
  return {
    id: row.id,
    bid_id: row.bid_id,
    recipient_user_id: row.recipient_user_id,
    actor_user_id: row.actor_user_id,
    actor_name: row.actor_name ?? "Teammate",
    bid_url: row.bid_url ?? "",
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
  const { rows } = await query<BidNotificationRow>(
    `SELECT
       n.id,
       n.bid_id,
       n.recipient_user_id,
       n.actor_user_id,
       u.name AS actor_name,
       b.url AS bid_url,
       n.read_at,
       n.created_at
     FROM bid_notification n
     JOIN users u ON u.id = n.actor_user_id
     JOIN bid b ON b.id = n.bid_id
     WHERE n.recipient_user_id = $1
       AND n.read_at IS NULL
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT 50`,
    [recipientUserId],
  );
  return rows.map(mapRow);
}

export async function markBidNotificationsRead(
  recipientUserId: number,
  notificationIds?: number[],
): Promise<number> {
  if (notificationIds && notificationIds.length > 0) {
    const { rowCount } = await query(
      `UPDATE bid_notification
       SET read_at = NOW()
       WHERE recipient_user_id = $1
         AND read_at IS NULL
         AND id = ANY($2::integer[])`,
      [recipientUserId, notificationIds],
    );
    return rowCount ?? 0;
  }

  const { rowCount } = await query(
    `UPDATE bid_notification
     SET read_at = NOW()
     WHERE recipient_user_id = $1
       AND read_at IS NULL`,
    [recipientUserId],
  );
  return rowCount ?? 0;
}
