import { query } from "./db.ts";
import {
  assertBidDateKey,
  type BidDaySummary,
  type BidWithUser,
  type TeamBid,
} from "./bids.ts";
import type { Bid } from "./types/bid.ts";

const FREELANCER_BID_SELECT = `id, user_id, url, proposal, image, created_at`;
const EST_TIMEZONE = "America/New_York";

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

export async function listFreelancerBidDaysForSubTeam(
  userId: number,
): Promise<BidDaySummary[]> {
  const memberIds = await getSubTeamUserIds(userId);

  const { rows } = await query<{
    date: string;
    user_id: number;
    user_name: string;
    count: string | number;
  }>(
    `SELECT to_char(
       (b.created_at AT TIME ZONE $2)::date,
       'YYYY-MM-DD'
     ) AS date,
     b.user_id,
     u.name AS user_name,
     COUNT(*)::int AS count
     FROM freelancer_bid b
     INNER JOIN users u ON u.id = b.user_id
     WHERE b.user_id = ANY($1::integer[])
     GROUP BY 1, b.user_id, u.name
     ORDER BY 1 DESC, 4 DESC, u.name ASC`,
    [memberIds, EST_TIMEZONE],
  );

  return aggregateFreelancerBidDaySummaries(rows);
}

function aggregateFreelancerBidDaySummaries(
  rows: {
    date: string;
    user_id: number;
    user_name: string;
    count: string | number;
  }[],
): BidDaySummary[] {
  const days: BidDaySummary[] = [];
  const indexByDate = new Map<string, BidDaySummary>();

  for (const row of rows) {
    const date = String(row.date).slice(0, 10);
    const member = {
      user_id: Number(row.user_id),
      user_name: row.user_name,
      count: Number(row.count) || 0,
    };
    const existing = indexByDate.get(date);
    if (existing) {
      existing.count += member.count;
      existing.members = [...(existing.members ?? []), member];
    } else {
      const next: BidDaySummary = {
        date,
        count: member.count,
        members: [member],
      };
      indexByDate.set(date, next);
      days.push(next);
    }
  }

  return days;
}

export async function listFreelancerBidsForSubTeam(
  userId: number,
  date: string,
): Promise<BidWithUser[]> {
  const memberIds = await getSubTeamUserIds(userId);
  const day = assertBidDateKey(date);

  const { rows } = await query<BidWithUser>(
    `SELECT b.id, b.user_id, b.url, b.proposal, b.image, b.created_at, u.name AS user_name
     FROM freelancer_bid b
     INNER JOIN users u ON u.id = b.user_id
     WHERE b.user_id = ANY($1::integer[])
       AND b.created_at >= ($2::date)::timestamp AT TIME ZONE $3
       AND b.created_at < (($2::date + 1))::timestamp AT TIME ZONE $3
     ORDER BY b.created_at DESC, b.id DESC`,
    [memberIds, day, EST_TIMEZONE],
  );

  return rows;
}

export async function createFreelancerBid(input: {
  userId: number;
  url: string;
  proposal: string;
  image?: string | null;
}): Promise<BidWithUser> {
  const { rows } = await query<Bid>(
    `INSERT INTO freelancer_bid (user_id, url, proposal, image)
     VALUES ($1, $2, $3, $4)
     RETURNING ${FREELANCER_BID_SELECT}`,
    [input.userId, input.url, input.proposal, input.image ?? null],
  );

  const bid = rows[0];
  if (!bid) {
    throw new Error("Failed to create freelancer bid");
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

const TEAM_FREELANCER_BID_SELECT = `
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
`;

export async function listTeamFreelancerBidDays(): Promise<BidDaySummary[]> {
  const { rows } = await query<{ date: string; count: string | number }>(
    `SELECT to_char(
       (b.created_at AT TIME ZONE $1)::date,
       'YYYY-MM-DD'
     ) AS date,
     COUNT(*)::int AS count
     FROM freelancer_bid b
     GROUP BY 1
     ORDER BY 1 DESC`,
    [EST_TIMEZONE],
  );

  return rows.map((row) => ({
    date: String(row.date).slice(0, 10),
    count: Number(row.count) || 0,
  }));
}

export async function listTeamFreelancerBids(
  date?: string,
): Promise<TeamBid[]> {
  if (date) {
    const day = assertBidDateKey(date);
    const { rows } = await query<TeamBid>(
      `SELECT ${TEAM_FREELANCER_BID_SELECT}
       FROM freelancer_bid b
       INNER JOIN users u ON u.id = b.user_id
       WHERE b.created_at >= ($1::date)::timestamp AT TIME ZONE $2
         AND b.created_at < (($1::date + 1))::timestamp AT TIME ZONE $2
       ORDER BY b.created_at DESC, b.id DESC`,
      [day, EST_TIMEZONE],
    );
    return rows;
  }

  const { rows } = await query<TeamBid>(
    `SELECT ${TEAM_FREELANCER_BID_SELECT}
     FROM freelancer_bid b
     INNER JOIN users u ON u.id = b.user_id
     ORDER BY b.created_at DESC, b.id DESC`,
  );

  return rows;
}
