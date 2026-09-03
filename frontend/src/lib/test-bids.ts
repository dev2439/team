import { fetchWithTimeout, getApiBase, getToken } from "@/lib/auth";

const TEST_BIDS_TIMEOUT_MS = 15_000;

export type TestBid = {
  id: number;
  url: string;
  image: string | null;
  user_id?: number | null;
  created_at: string;
  has_proposal: boolean;
  /**
   * When true, Member / SubBoss / Tester can see the proposal list on Test Result.
   * BigBoss always sees proposals. Default false.
   */
  results_visible: boolean;
};

type ErrorResponse = {
  error: string;
};

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new Error("Not signed in");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${getApiBase()}${path}`,
      {
        ...init,
        headers,
      },
      TEST_BIDS_TIMEOUT_MS,
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw err;
  }

  const data = (await res.json()) as T | ErrorResponse;

  if (!res.ok) {
    throw new Error(
      data && typeof data === "object" && "error" in data
        ? data.error
        : "Request failed",
    );
  }

  return data as T;
}

export async function fetchTestBids(): Promise<TestBid[]> {
  const data = await authFetch<{ test_bids: TestBid[] }>("/api/test-bids");
  return data.test_bids;
}

export async function createTestBidRequest(input: {
  url: string;
  image: string;
}): Promise<TestBid> {
  const data = await authFetch<{ test_bid: TestBid }>("/api/test-bids", {
    method: "POST",
    body: JSON.stringify({
      url: input.url,
      image: input.image,
    }),
  });
  return data.test_bid;
}

export async function setTestBidResultsVisibleRequest(input: {
  testBidId: number;
  resultsVisible: boolean;
}): Promise<TestBid> {
  const data = await authFetch<{ test_bid: TestBid }>(
    `/api/test-bids/${input.testBidId}/results-visible`,
    {
      method: "POST",
      body: JSON.stringify({ results_visible: input.resultsVisible }),
    },
  );
  return data.test_bid;
}

export type TestBidProposal = {
  id: number;
  proposal: string;
  parent_id: number;
  user_id: number;
  created_at: string;
};

export type TestBidProposalResult = TestBidProposal & {
  user_name: string;
  parent_url: string;
  parent_image: string | null;
  /** bid_test.created_at for the parent job. */
  parent_created_at: string;
  is_favorited: boolean;
  /** How many users favorited this proposal. */
  favorites_received: number;
  my_rating: number | null;
  my_rating_comment: string | null;
  viewed_at: string | null;
  view_order: number | null;
  bid_speed: number;
  avg_rating: number;
  ranking_score: number;
  /**
   * Average of each viewer's personal view_order for this proposal within the
   * parent bid_test. Lower is better. Null when nobody has viewed it.
   */
  view_score: number | null;
};

export type TestBidRating = {
  id: number;
  user_id: number;
  test_bid_id: number;
  rating: number | null;
  comment: string | null;
  viewed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchTestBidProposal(
  parentId: number,
): Promise<TestBidProposal | null> {
  const data = await authFetch<{ proposal: TestBidProposal | null }>(
    `/api/test-bids/${parentId}/proposals`,
  );
  return data.proposal;
}

export async function fetchTestBidProposals(): Promise<{
  proposals: TestBidProposalResult[];
}> {
  return authFetch<{
    proposals: TestBidProposalResult[];
  }>("/api/test-bid-proposals");
}

export async function toggleTestBidFavoriteRequest(
  testBidId: number,
): Promise<{
  favorited: boolean;
  favorite_count: number;
  parent_id: number;
}> {
  return authFetch<{
    favorited: boolean;
    favorite_count: number;
    parent_id: number;
  }>(`/api/test-bid-proposals/${testBidId}/favorite`, {
    method: "POST",
  });
}

export async function saveTestBidRatingRequest(input: {
  testBidId: number;
  rating: number;
  comment: string;
}): Promise<TestBidRating> {
  const data = await authFetch<{ rating: TestBidRating }>(
    `/api/test-bid-proposals/${input.testBidId}/rating`,
    {
      method: "POST",
      body: JSON.stringify({
        rating: input.rating,
        comment: input.comment,
      }),
    },
  );
  return data.rating;
}

export async function recordTestBidViewRequest(
  testBidId: number,
): Promise<{ viewed_at: string | null; view_order: number | null }> {
  return authFetch<{ viewed_at: string | null; view_order: number | null }>(
    `/api/test-bid-proposals/${testBidId}/view`,
    { method: "POST" },
  );
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

export type TestBidViewer = {
  user_id: number;
  user_name: string;
  viewed_at: string;
  view_order: number;
};

export async function fetchTestBidViewers(
  testBidId: number,
): Promise<TestBidViewer[]> {
  const data = await authFetch<{ viewers: TestBidViewer[] }>(
    `/api/test-bid-proposals/${testBidId}/viewers`,
  );
  return data.viewers;
}

export async function fetchTestBidRatings(
  testBidId: number,
): Promise<TestBidRatingListItem[]> {
  const data = await authFetch<{ ratings: TestBidRatingListItem[] }>(
    `/api/test-bid-proposals/${testBidId}/rating`,
  );
  return data.ratings;
}

export async function createTestBidProposalRequest(input: {
  parentId: number;
  proposal: string;
}): Promise<TestBidProposal> {
  const data = await authFetch<{ proposal: TestBidProposal }>(
    `/api/test-bids/${input.parentId}/proposals`,
    {
      method: "POST",
      body: JSON.stringify({ proposal: input.proposal }),
    },
  );
  return data.proposal;
}
