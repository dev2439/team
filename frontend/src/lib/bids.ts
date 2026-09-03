import { fetchWithTimeout, getApiBase, getToken } from "@/lib/auth";

const BIDS_TIMEOUT_MS = 12_000;

export type Bid = {
  id: number;
  user_id: number;
  url: string;
  proposal: string;
  image: string | null;
  created_at: string;
  user_name?: string;
};

export type TeamBid = Bid & {
  user_name: string;
  sub_team_id: number | null;
  sub_team_name: string | null;
};

export type BidDayMemberCount = {
  user_id: number;
  user_name: string;
  count: number;
};

export type BidDay = {
  date: string;
  count: number;
  members?: BidDayMemberCount[];
};

type BidsResponse = {
  bids: Bid[];
};

type BidDaysResponse = {
  days: BidDay[];
};

type TeamBidsResponse = {
  bids: TeamBid[];
};

type BidResponse = {
  bid: Bid;
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
      BIDS_TIMEOUT_MS,
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw err;
  }

  const data = (await res.json()) as T | ErrorResponse;

  if (!res.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Request failed";
    throw new Error(message);
  }

  return data as T;
}

export async function fetchBidDays(): Promise<BidDay[]> {
  const data = await authFetch<BidDaysResponse>("/api/bids/days");
  return data.days;
}

export async function fetchBids(input: { date: string }): Promise<Bid[]> {
  const params = new URLSearchParams({ date: input.date });
  const data = await authFetch<BidsResponse>(`/api/bids?${params.toString()}`);
  return data.bids;
}

export async function fetchTeamBidDays(): Promise<BidDay[]> {
  const data = await authFetch<BidDaysResponse>("/api/team-bids/days");
  return data.days;
}

export async function fetchTeamBids(input?: {
  date: string;
}): Promise<TeamBid[]> {
  const params = new URLSearchParams();
  if (input?.date) {
    params.set("date", input.date);
  }
  const query = params.toString();
  const data = await authFetch<TeamBidsResponse>(
    `/api/team-bids${query ? `?${query}` : ""}`,
  );
  return data.bids;
}

export async function createBidRequest(input: {
  url: string;
  proposal: string;
  image?: string | null;
}): Promise<Bid> {
  const data = await authFetch<BidResponse>("/api/bids", {
    method: "POST",
    body: JSON.stringify({
      url: input.url,
      proposal: input.proposal,
      image: input.image ?? null,
    }),
  });
  return data.bid;
}

export async function fetchFreelancerBidDays(): Promise<BidDay[]> {
  const data = await authFetch<BidDaysResponse>("/api/freelancer-bids/days");
  return data.days;
}

export async function fetchFreelancerBids(input: {
  date: string;
}): Promise<Bid[]> {
  const params = new URLSearchParams({ date: input.date });
  const data = await authFetch<BidsResponse>(
    `/api/freelancer-bids?${params.toString()}`,
  );
  return data.bids;
}

export async function createFreelancerBidRequest(input: {
  url: string;
  proposal: string;
  image?: string | null;
}): Promise<Bid> {
  const data = await authFetch<BidResponse>("/api/freelancer-bids", {
    method: "POST",
    body: JSON.stringify({
      url: input.url,
      proposal: input.proposal,
      image: input.image ?? null,
    }),
  });
  return data.bid;
}

export async function fetchTeamFreelancerBidDays(): Promise<BidDay[]> {
  const data = await authFetch<BidDaysResponse>(
    "/api/team-freelancer-bids/days",
  );
  return data.days;
}

export async function fetchTeamFreelancerBids(input?: {
  date: string;
}): Promise<TeamBid[]> {
  const params = new URLSearchParams();
  if (input?.date) {
    params.set("date", input.date);
  }
  const query = params.toString();
  const data = await authFetch<TeamBidsResponse>(
    `/api/team-freelancer-bids${query ? `?${query}` : ""}`,
  );
  return data.bids;
}
