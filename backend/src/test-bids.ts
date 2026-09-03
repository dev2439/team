import { query } from "./db.ts";
import type {
  TestBid,
  TestBidFavorite,
  TestBidProposal,
  TestBidProposalResult,
  TestBidRating,
} from "./types/test-bid.ts";

const BID_TEST_SELECT = "id, url, image, user_id, created_at, results_visible";
const TEST_BID_PROPOSAL_SELECT = "id, proposal, parent_id, user_id, created_at";
const TEST_BID_FAVORITE_SELECT = "id, user_id, test_bid_id, created_at";

function mapTestBid(
  row: TestBid & { has_proposal?: boolean; results_visible?: boolean },
): TestBid {
  return {
    id: row.id,
    url: row.url,
    image: row.image,
    user_id: row.user_id,
    created_at: row.created_at,
    has_proposal: Boolean(row.has_proposal),
    results_visible: Boolean(row.results_visible),
  };
}

export async function listTestBids(userId?: number): Promise<TestBid[]> {
  const { rows } = await query<TestBid & { has_proposal: boolean }>(
    userId != null
      ? `SELECT
           bt.id,
           bt.url,
           bt.image,
           bt.user_id,
           bt.created_at,
           bt.results_visible,
           EXISTS (
             SELECT 1
             FROM test_bid tb
             WHERE tb.parent_id = bt.id
               AND tb.user_id = $1
           ) AS has_proposal
         FROM bid_test bt
         ORDER BY bt.created_at DESC, bt.id DESC`
      : `SELECT
           bt.id,
           bt.url,
           bt.image,
           bt.user_id,
           bt.created_at,
           bt.results_visible,
           EXISTS (
             SELECT 1
             FROM test_bid tb
             WHERE tb.parent_id = bt.id
           ) AS has_proposal
         FROM bid_test bt
         ORDER BY bt.created_at DESC, bt.id DESC`,
    userId != null ? [userId] : [],
  );

  return rows.map(mapTestBid);
}

export async function createTestBid(input: {
  url: string;
  image?: string | null;
  userId: number;
}): Promise<TestBid> {
  const { rows } = await query<TestBid>(
    `INSERT INTO bid_test (url, image, user_id)
     VALUES ($1, $2, $3)
     RETURNING ${BID_TEST_SELECT}`,
    [input.url, input.image ?? null, input.userId],
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Failed to create test bid");
  }
  return mapTestBid({ ...row, has_proposal: false });
}

export async function getTestBidById(id: number): Promise<TestBid | null> {
  const { rows } = await query<TestBid & { has_proposal: boolean }>(
    `SELECT
       bt.id,
       bt.url,
       bt.image,
       bt.user_id,
       bt.created_at,
       bt.results_visible,
       EXISTS (
         SELECT 1
         FROM test_bid tb
         WHERE tb.parent_id = bt.id
       ) AS has_proposal
     FROM bid_test bt
     WHERE bt.id = $1
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return mapTestBid(row);
}

export async function setTestBidResultsVisible(input: {
  id: number;
  resultsVisible: boolean;
}): Promise<TestBid> {
  const { rows } = await query<TestBid & { has_proposal: boolean }>(
    `UPDATE bid_test bt
     SET results_visible = $2
     WHERE bt.id = $1
     RETURNING
       bt.id,
       bt.url,
       bt.image,
       bt.user_id,
       bt.created_at,
       bt.results_visible,
       EXISTS (
         SELECT 1
         FROM test_bid tb
         WHERE tb.parent_id = bt.id
       ) AS has_proposal`,
    [input.id, input.resultsVisible],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Test bid not found");
  }
  return mapTestBid(row);
}

export async function createTestBidProposal(input: {
  parentId: number;
  userId: number;
  proposal: string;
}): Promise<TestBidProposal> {
  const parent = await getTestBidById(input.parentId);
  if (!parent) {
    throw new Error("Parent test bid not found");
  }
  if (input.proposal.length > 5000) {
    throw new Error("Proposal must be at most 5000 characters");
  }

  const { rows } = await query<TestBidProposal>(
    `INSERT INTO test_bid (proposal, parent_id, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (parent_id, user_id)
     DO UPDATE SET
       proposal = EXCLUDED.proposal,
       created_at = NOW()
     RETURNING ${TEST_BID_PROPOSAL_SELECT}`,
    [input.proposal, input.parentId, input.userId],
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Failed to create proposal");
  }
  return row;
}

export async function getProposalForParentAndUser(
  parentId: number,
  userId: number,
): Promise<TestBidProposal | null> {
  const { rows } = await query<TestBidProposal>(
    `SELECT ${TEST_BID_PROPOSAL_SELECT}
     FROM test_bid
     WHERE parent_id = $1
       AND user_id = $2
     LIMIT 1`,
    [parentId, userId],
  );
  return rows[0] ?? null;
}

export async function listTestBidProposals(
  viewerUserId: number,
  options?: { includeHiddenResults?: boolean },
): Promise<TestBidProposalResult[]> {
  const includeHidden = Boolean(options?.includeHiddenResults);
  const { rows } = await query<{
    id: number;
    proposal: string;
    parent_id: number;
    user_id: number;
    created_at: string;
    user_name: string;
    parent_url: string;
    parent_image: string | null;
    parent_created_at: Date | string;
    is_favorited: boolean;
    favorites_received: number | string;
    my_rating: number | null;
    my_rating_comment: string | null;
    viewed_at: Date | string | null;
    view_order: number | string | null;
    bid_speed: number | string;
    avg_rating: number | string | null;
    view_score: number | string | null;
  }>(
    `SELECT
       tb.id,
       tb.proposal,
       tb.parent_id,
       tb.user_id,
       tb.created_at,
       u.name AS user_name,
       bt.url AS parent_url,
       bt.image AS parent_image,
       bt.created_at AS parent_created_at,
       EXISTS (
         SELECT 1
         FROM test_bid_favorite f
         WHERE f.test_bid_id = tb.id
           AND f.user_id = $1
       ) AS is_favorited,
       (
         SELECT COUNT(*)::integer
         FROM test_bid_favorite f
         WHERE f.test_bid_id = tb.id
       ) AS favorites_received,
       r.rating AS my_rating,
       r.comment AS my_rating_comment,
       r.viewed_at AS viewed_at,
       CASE
         WHEN r.viewed_at IS NULL THEN NULL
         ELSE (
           -- Signed-in user's open order among proposals in this bid_test
           SELECT COUNT(*)::integer + 1
           FROM test_bid_rating r2
           INNER JOIN test_bid tb2 ON tb2.id = r2.test_bid_id
           WHERE r2.user_id = $1
             AND tb2.parent_id = bt.id
             AND r2.viewed_at IS NOT NULL
             AND (
               r2.viewed_at < r.viewed_at
               OR (
                 r2.viewed_at = r.viewed_at
                 AND r2.test_bid_id < tb.id
               )
             )
         )
       END AS view_order,
       GREATEST(
         0,
         5.5 - (
           ROW_NUMBER() OVER (
             PARTITION BY tb.parent_id
             ORDER BY tb.created_at ASC, tb.id ASC
           ) * 0.5
         )
       ) AS bid_speed,
       (
         SELECT COALESCE(
           SUM(tr.rating)::float8 / NULLIF(COUNT(tr.rating), 0),
           0
         )
         FROM test_bid_rating tr
         WHERE tr.test_bid_id = tb.id
           AND tr.rating IS NOT NULL
       ) AS avg_rating,
       (
         SELECT AVG(vo.view_order)::float8
         FROM (
           SELECT
             r3.test_bid_id,
             ROW_NUMBER() OVER (
               PARTITION BY r3.user_id
               ORDER BY r3.viewed_at ASC, r3.test_bid_id ASC
             ) AS view_order
           FROM test_bid_rating r3
           INNER JOIN test_bid tb3 ON tb3.id = r3.test_bid_id
           WHERE tb3.parent_id = bt.id
             AND r3.viewed_at IS NOT NULL
         ) vo
         WHERE vo.test_bid_id = tb.id
       ) AS view_score
     FROM test_bid tb
     INNER JOIN users u ON u.id = tb.user_id
     INNER JOIN bid_test bt ON bt.id = tb.parent_id
     LEFT JOIN test_bid_rating r
       ON r.test_bid_id = tb.id
      AND r.user_id = $1
     WHERE (
       $2::boolean
       OR bt.results_visible
       OR tb.user_id = $1
     )
     ORDER BY tb.created_at DESC, tb.id DESC`,
    [viewerUserId, includeHidden],
  );

  return rows.map((row) => {
    const bidSpeed = Math.max(0, Number(row.bid_speed) || 0);
    const avgRating =
      row.avg_rating == null || Number.isNaN(Number(row.avg_rating))
        ? 0
        : Number(row.avg_rating);
    const rankingScore = (0 * bidSpeed + 10 * avgRating) / 10;
    const viewedAt =
      row.viewed_at == null
        ? null
        : row.viewed_at instanceof Date
          ? row.viewed_at.toISOString()
          : String(row.viewed_at);
    const viewOrder =
      row.view_order == null || Number.isNaN(Number(row.view_order))
        ? null
        : Number(row.view_order);
    const viewScore =
      row.view_score == null || Number.isNaN(Number(row.view_score))
        ? null
        : Number(row.view_score);
    const parentCreatedAt =
      row.parent_created_at instanceof Date
        ? row.parent_created_at.toISOString()
        : String(row.parent_created_at);

    return {
      id: row.id,
      proposal: row.proposal,
      parent_id: row.parent_id,
      user_id: row.user_id,
      created_at: row.created_at,
      user_name: row.user_name,
      parent_url: row.parent_url,
      parent_image: row.parent_image,
      parent_created_at: parentCreatedAt,
      is_favorited: Boolean(row.is_favorited),
      favorites_received: Math.max(0, Number(row.favorites_received) || 0),
      my_rating:
        row.my_rating == null || Number.isNaN(Number(row.my_rating))
          ? null
          : Number(row.my_rating),
      my_rating_comment: row.my_rating_comment ?? null,
      viewed_at: viewedAt,
      view_order: viewOrder,
      bid_speed: bidSpeed,
      avg_rating: avgRating,
      ranking_score: rankingScore,
      view_score: viewScore,
    };
  });
}

export async function countFavoritesForUserAndParent(
  userId: number,
  parentId: number,
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM test_bid_favorite f
     INNER JOIN test_bid tb ON tb.id = f.test_bid_id
     WHERE f.user_id = $1
       AND tb.parent_id = $2`,
    [userId, parentId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function toggleTestBidFavorite(input: {
  userId: number;
  testBidId: number;
}): Promise<{
  favorited: boolean;
  favorite_count: number;
  parent_id: number;
}> {
  const { rows: proposalRows } = await query<{
    id: number;
    parent_id: number;
    user_id: number;
  }>(
    `SELECT id, parent_id, user_id FROM test_bid WHERE id = $1 LIMIT 1`,
    [input.testBidId],
  );
  const proposal = proposalRows[0];
  if (!proposal) {
    throw new Error("Proposal not found");
  }

  if (proposal.user_id === input.userId) {
    throw new Error("You cannot favorite your own proposal");
  }

  const { rows: existing } = await query<{ id: number }>(
    `SELECT id
     FROM test_bid_favorite
     WHERE user_id = $1
       AND test_bid_id = $2
     LIMIT 1`,
    [input.userId, input.testBidId],
  );

  if (existing[0]) {
    await query(`DELETE FROM test_bid_favorite WHERE id = $1`, [existing[0].id]);
    const favoriteCount = await countFavoritesForUserAndParent(
      input.userId,
      proposal.parent_id,
    );
    return {
      favorited: false,
      favorite_count: favoriteCount,
      parent_id: proposal.parent_id,
    };
  }

  await query<TestBidFavorite>(
    `INSERT INTO test_bid_favorite (user_id, test_bid_id)
     VALUES ($1, $2)
     RETURNING ${TEST_BID_FAVORITE_SELECT}`,
    [input.userId, input.testBidId],
  );

  const favoriteCount = await countFavoritesForUserAndParent(
    input.userId,
    proposal.parent_id,
  );
  return {
    favorited: true,
    favorite_count: favoriteCount,
    parent_id: proposal.parent_id,
  };
}

export async function upsertTestBidRating(input: {
  userId: number;
  testBidId: number;
  rating: number;
  comment: string;
}): Promise<TestBidRating> {
  const rating = Math.trunc(input.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 10) {
    throw new Error("Rating must be an integer from 1 to 10");
  }

  const comment = input.comment.trim();
  if (!comment) {
    throw new Error("Comment is required when rating");
  }

  const { rows: proposalRows } = await query<{
    id: number;
    user_id: number;
  }>(`SELECT id, user_id FROM test_bid WHERE id = $1 LIMIT 1`, [
    input.testBidId,
  ]);
  const proposal = proposalRows[0];
  if (!proposal) {
    throw new Error("Proposal not found");
  }

  if (proposal.user_id === input.userId) {
    throw new Error("You cannot rate your own proposal");
  }

  // Find existing row for this signed-in user + proposal.
  const { rows: existingRows } = await query<{ id: number }>(
    `SELECT id
     FROM test_bid_rating
     WHERE user_id = $1
       AND test_bid_id = $2
     LIMIT 1`,
    [input.userId, input.testBidId],
  );

  let rows: TestBidRating[];
  if (existingRows[0]) {
    // Same user + test_bid already has a row (e.g. from View more) → update rating/comment.
    const updated = await query<TestBidRating>(
      `UPDATE test_bid_rating
       SET rating = $1,
           comment = $2,
           updated_at = NOW()
       WHERE user_id = $3
         AND test_bid_id = $4
       RETURNING id, user_id, test_bid_id, rating, comment, viewed_at, created_at, updated_at`,
      [rating, comment, input.userId, input.testBidId],
    );
    rows = updated.rows;
  } else {
    // No prior view/rating row → insert new.
    const inserted = await query<TestBidRating>(
      `INSERT INTO test_bid_rating (user_id, test_bid_id, rating, comment, viewed_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, user_id, test_bid_id, rating, comment, viewed_at, created_at, updated_at`,
      [input.userId, input.testBidId, rating, comment],
    );
    rows = inserted.rows;
  }

  const row = rows[0];
  if (!row) {
    throw new Error("Failed to save rating");
  }
  return {
    ...row,
    rating: row.rating == null ? null : Number(row.rating),
    viewed_at:
      row.viewed_at == null
        ? null
        : row.viewed_at instanceof Date
          ? row.viewed_at.toISOString()
          : String(row.viewed_at),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

/** Save View more time for signed-in user + proposal (first click only). */
export async function recordTestBidView(input: {
  userId: number;
  testBidId: number;
}): Promise<{ viewed_at: string | null; view_order: number | null }> {
  const { rows: proposalRows } = await query<{
    id: number;
    user_id: number;
  }>(`SELECT id, user_id FROM test_bid WHERE id = $1 LIMIT 1`, [
    input.testBidId,
  ]);
  const proposal = proposalRows[0];
  if (!proposal) {
    throw new Error("Proposal not found");
  }

  // Do not record view time on the viewer's own proposal.
  if (proposal.user_id === input.userId) {
    return { viewed_at: null, view_order: null };
  }

  const { rows: existingRows } = await query<{
    id: number;
    viewed_at: Date | string | null;
  }>(
    `SELECT id, viewed_at
     FROM test_bid_rating
     WHERE user_id = $1
       AND test_bid_id = $2
     LIMIT 1`,
    [input.userId, input.testBidId],
  );

  let viewedAt: Date | string | null | undefined;

  if (existingRows[0]) {
    if (existingRows[0].viewed_at != null) {
      viewedAt = existingRows[0].viewed_at;
    } else {
      const updated = await query<{ viewed_at: Date | string }>(
        `UPDATE test_bid_rating
         SET viewed_at = NOW(),
             updated_at = NOW()
         WHERE user_id = $1
           AND test_bid_id = $2
         RETURNING viewed_at`,
        [input.userId, input.testBidId],
      );
      viewedAt = updated.rows[0]?.viewed_at;
    }
  } else {
    const inserted = await query<{ viewed_at: Date | string }>(
      `INSERT INTO test_bid_rating (user_id, test_bid_id, viewed_at)
       VALUES ($1, $2, NOW())
       RETURNING viewed_at`,
      [input.userId, input.testBidId],
    );
    viewedAt = inserted.rows[0]?.viewed_at;
  }

  if (viewedAt == null) {
    throw new Error("Failed to record view");
  }

  const viewedAtIso =
    viewedAt instanceof Date ? viewedAt.toISOString() : String(viewedAt);

  const { rows: orderRows } = await query<{ view_order: string }>(
    `SELECT (COUNT(*)::integer + 1)::text AS view_order
     FROM test_bid_rating r2
     INNER JOIN test_bid tb2 ON tb2.id = r2.test_bid_id
     INNER JOIN test_bid tb1 ON tb1.id = $1
     WHERE r2.user_id = $3
       AND tb2.parent_id = tb1.parent_id
       AND r2.viewed_at IS NOT NULL
       AND (
         r2.viewed_at < $2::timestamptz
         OR (
           r2.viewed_at = $2::timestamptz
           AND r2.test_bid_id < $1
         )
       )`,
    [input.testBidId, viewedAtIso, input.userId],
  );

  return {
    viewed_at: viewedAtIso,
    view_order: Number(orderRows[0]?.view_order ?? 1),
  };
}

export type TestBidViewer = {
  user_id: number;
  user_name: string;
  viewed_at: string;
  /** This user's open-order for this proposal within the parent bid_test. */
  view_order: number;
};

/**
 * Users who opened this proposal, each with their personal view_order
 * among all proposals under the same bid_test (not ranked vs each other).
 */
export async function listTestBidViewers(
  testBidId: number,
): Promise<TestBidViewer[]> {
  const { rows } = await query<{
    user_id: number;
    user_name: string;
    viewed_at: Date | string;
    view_order: number | string;
  }>(
    `WITH target AS (
       SELECT id, parent_id
       FROM test_bid
       WHERE id = $1
     ),
     ranked AS (
       SELECT
         r.user_id,
         u.name AS user_name,
         r.test_bid_id,
         r.viewed_at,
         ROW_NUMBER() OVER (
           PARTITION BY r.user_id
           ORDER BY r.viewed_at ASC, r.test_bid_id ASC
         ) AS view_order
       FROM test_bid_rating r
       INNER JOIN test_bid tb ON tb.id = r.test_bid_id
       INNER JOIN target t ON t.parent_id = tb.parent_id
       INNER JOIN users u ON u.id = r.user_id
       WHERE r.viewed_at IS NOT NULL
     )
     SELECT user_id, user_name, viewed_at, view_order
     FROM ranked
     WHERE test_bid_id = $1
     ORDER BY user_name ASC, user_id ASC`,
    [testBidId],
  );

  return rows.map((row) => ({
    user_id: Number(row.user_id),
    user_name: row.user_name || "Unknown",
    viewed_at:
      row.viewed_at instanceof Date
        ? row.viewed_at.toISOString()
        : String(row.viewed_at),
    view_order: Number(row.view_order),
  }));
}

export type TestBidRatingListItem = {
  id: number;
  rating: number;
  comment: string;
  user_id: number;
  user_name: string;
  created_at: string;
  updated_at: string;
};

export async function listRatingsForProposal(
  testBidId: number,
): Promise<TestBidRatingListItem[]> {
  const { rows } = await query<TestBidRatingListItem>(
    `SELECT
       r.id,
       r.rating,
       r.comment,
       r.user_id,
       u.name AS user_name,
       r.created_at,
       r.updated_at
     FROM test_bid_rating r
     INNER JOIN users u ON u.id = r.user_id
     WHERE r.test_bid_id = $1
       AND r.rating IS NOT NULL
       AND r.comment IS NOT NULL
     ORDER BY r.created_at DESC, r.id DESC`,
    [testBidId],
  );
  return rows.map((row) => ({
    ...row,
    rating: Number(row.rating),
    user_id: Number(row.user_id),
    user_name: row.user_name || "Unknown",
  }));
}
