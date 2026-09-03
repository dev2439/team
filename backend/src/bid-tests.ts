import { query } from "./db.ts";
import type { BidTest } from "./types/bid-test.ts";

const BID_TEST_SELECT = "id, url, image, created_at";

export async function listBidTests(): Promise<BidTest[]> {
  const { rows } = await query<BidTest>(
    `SELECT ${BID_TEST_SELECT}
     FROM bid_test
     ORDER BY created_at DESC, id DESC`,
  );
  return rows;
}

export async function createBidTest(input: {
  url: string;
  image?: string | null;
}): Promise<BidTest> {
  const { rows } = await query<BidTest>(
    `INSERT INTO bid_test (url, image)
     VALUES ($1, $2)
     RETURNING ${BID_TEST_SELECT}`,
    [input.url, input.image ?? null],
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Failed to create bid test");
  }
  return row;
}
