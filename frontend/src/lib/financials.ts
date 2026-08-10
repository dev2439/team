import { getApiBase, getToken } from "@/lib/auth";

export type FinancialType = "in" | "ums" | "out";

export type FinancialEntry = {
  id: number;
  user_id: number;
  amount: number;
  type: FinancialType | string;
  note: string;
  created_at: string;
  day: string;
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

export async function fetchFinancialRange(
  from: string,
  to: string,
): Promise<FinancialEntry[]> {
  const params = new URLSearchParams({ from, to });
  const data = await authFetch<{ financial: FinancialEntry[] }>(
    `/api/financial?${params.toString()}`,
  );
  return data.financial;
}

export async function saveFinancial(input: {
  user_id: number;
  amount: number;
  type: FinancialType;
  note: string;
  day: string;
}): Promise<FinancialEntry> {
  const data = await authFetch<{ financial: FinancialEntry }>(
    "/api/financial",
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
  return data.financial;
}
