import { getApiBase, getToken } from "@/lib/auth";

export type Bid = {
  id: number;
  user_id: number;
  url: string;
  proposal: string;
  created_at: string;
  user_name?: string;
};

type BidsResponse = {
  bids: Bid[];
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

  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers,
  });

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

export async function fetchBids(): Promise<Bid[]> {
  const data = await authFetch<BidsResponse>("/api/bids");
  return data.bids;
}

export async function createBidRequest(input: {
  url: string;
  proposal: string;
}): Promise<Bid> {
  const data = await authFetch<BidResponse>("/api/bids", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.bid;
}
