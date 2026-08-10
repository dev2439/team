import { query } from "./db.ts";
import type { Bid } from "./types/bid.ts";

export type BidWithUser = Bid & {
  user_name: string;
};

async function getSubTeamUserIds(userId: number): Promise<number[]> {
  const { rows } = await query<{ user_ids: number[] | null }>(
    `SELECT user_ids
     FROM sub_team
     WHERE $1 = ANY(COALESCE(user_ids, '{}'::integer[]))
     ORDER BY id ASC
     LIMIT 1`,
    [userId],
  );

  const ids = rows[0]?.user_ids ?? [];
  if (ids.length > 0) return ids;
  return [userId];
}

export async function listBidsForUser(userId: number): Promise<Bid[]> {
  const { rows } = await query<Bid>(
    `SELECT id, user_id, url, proposal, created_at
     FROM bid
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return rows;
}

export async function listBidsForSubTeam(
  userId: number,
): Promise<BidWithUser[]> {
  const memberIds = await getSubTeamUserIds(userId);

  const { rows } = await query<BidWithUser>(
    `SELECT b.id, b.user_id, b.url, b.proposal, b.created_at, u.name AS user_name
     FROM bid b
     INNER JOIN users u ON u.id = b.user_id
     WHERE b.user_id = ANY($1::integer[])
     ORDER BY b.created_at DESC, b.id DESC`,
    [memberIds],
  );

  return rows;
}

export async function createBid(input: {
  userId: number;
  url: string;
  proposal: string;
}): Promise<BidWithUser> {
  const { rows } = await query<BidWithUser>(
    `INSERT INTO bid (user_id, url, proposal)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, url, proposal, created_at`,
    [input.userId, input.url, input.proposal],
  );

  const bid = rows[0];
  if (!bid) {
    throw new Error("Failed to create bid");
  }

  const { rows: users } = await query<{ name: string }>(
    `SELECT name FROM users WHERE id = $1 LIMIT 1`,
    [input.userId],
  );

  return {
    ...bid,
    user_name: users[0]?.name ?? "Unknown",
  };
}
