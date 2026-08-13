import { query } from "./db.ts";
import type { Bid } from "./types/bid.ts";

export type BidWithUser = Bid & {
  user_name: string;
};

export type TeamBid = BidWithUser & {
  sub_team_id: number | null;
  sub_team_name: string | null;
};

const BID_SELECT = `id, user_id, url, proposal, image, created_at`;

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
    `SELECT ${BID_SELECT}
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
    `SELECT b.id, b.user_id, b.url, b.proposal, b.image, b.created_at, u.name AS user_name
     FROM bid b
     INNER JOIN users u ON u.id = b.user_id
     WHERE b.user_id = ANY($1::integer[])
     ORDER BY b.created_at DESC, b.id DESC`,
    [memberIds],
  );

  return rows;
}

export async function listTeamBids(): Promise<TeamBid[]> {
  const { rows } = await query<TeamBid>(
    `SELECT
       b.id,
       b.user_id,
       b.url,
       b.proposal,
       b.image,
       b.created_at,
       u.name AS user_name,
       (
         SELECT st.id
         FROM sub_team st
         WHERE b.user_id = ANY(COALESCE(st.user_ids, '{}'::integer[]))
         ORDER BY st.id ASC
         LIMIT 1
       ) AS sub_team_id,
       (
         SELECT st.name
         FROM sub_team st
         WHERE b.user_id = ANY(COALESCE(st.user_ids, '{}'::integer[]))
         ORDER BY st.id ASC
         LIMIT 1
       ) AS sub_team_name
     FROM bid b
     INNER JOIN users u ON u.id = b.user_id
     ORDER BY b.created_at DESC, b.id DESC`,
  );

  return rows;
}

export async function createBid(input: {
  userId: number;
  url: string;
  proposal: string;
  image?: string | null;
}): Promise<BidWithUser> {
  const { rows } = await query<BidWithUser>(
    `INSERT INTO bid (user_id, url, proposal, image)
     VALUES ($1, $2, $3, $4)
     RETURNING ${BID_SELECT}`,
    [input.userId, input.url, input.proposal, input.image ?? null],
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
