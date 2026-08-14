import { getApiBase, getToken } from "@/lib/auth";

export type Deposit = {
  id: number;
  user_id: number;
  project_id: number | null;
  /** Resolved project name, or "Bid" when project_id is null. */
  project_name: string;
  amount: number;
  created_at: string;
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
    throw new Error(
      data && typeof data === "object" && "error" in data
        ? data.error
        : "Request failed",
    );
  }

  return data as T;
}

export async function fetchDeposits(): Promise<Deposit[]> {
  const data = await authFetch<{ deposits: Deposit[] }>("/api/deposits");
  return data.deposits;
}

export async function createDeposit(input: {
  project_id: number;
  amount: number;
  user_id?: number;
}): Promise<Deposit> {
  const body: {
    project_id: number;
    amount: number;
    user_id?: number;
  } = {
    project_id: input.project_id,
    amount: input.amount,
  };

  if (input.user_id != null) {
    const userId = Math.trunc(Number(input.user_id));
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new Error("Invalid user_id");
    }
    body.user_id = userId;
  }

  const data = await authFetch<{ deposit: Deposit }>("/api/deposits", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (
    body.user_id != null &&
    Number(data.deposit.user_id) !== body.user_id
  ) {
    throw new Error("Deposit was not saved for the selected user");
  }

  return data.deposit;
}

/** Save a Bid deposit for a specific member (Financial page). */
export async function createBidDepositForUser(input: {
  user_id: number;
  amount: number;
}): Promise<Deposit> {
  const userId = Math.trunc(Number(input.user_id));
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error("Invalid user_id");
  }

  const data = await authFetch<{ deposit: Deposit }>("/api/deposits/bid", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      amount: input.amount,
    }),
  });

  if (Number(data.deposit.user_id) !== userId) {
    throw new Error("Deposit was not saved for the selected user");
  }

  return data.deposit;
}
