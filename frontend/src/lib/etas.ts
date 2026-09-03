import { getApiBase, getToken } from "@/lib/auth";

export type EtaEntry = {
  id: number;
  project_id: number;
  user_id: number;
  amount: number;
  created_at: string;
  project_name?: string;
  user_name?: string;
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

export async function fetchEtas(): Promise<EtaEntry[]> {
  const data = await authFetch<{ etas: EtaEntry[] }>("/api/etas");
  return data.etas;
}

export async function createEta(input: {
  project_id: number;
  amount: number;
}): Promise<EtaEntry> {
  const data = await authFetch<{ eta: EtaEntry }>("/api/etas", {
    method: "POST",
    body: JSON.stringify({
      project_id: input.project_id,
      amount: input.amount,
    }),
  });
  return data.eta;
}
