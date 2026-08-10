import { getApiBase, getToken } from "@/lib/auth";

export type Target = {
  id: number;
  month: number;
  week: number;
  sub1: number;
  sub2: number;
  created_at: string;
};

type TargetResponse = {
  target: Target | null;
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

export async function fetchTarget(): Promise<Target | null> {
  const data = await authFetch<TargetResponse>("/api/targets");
  return data.target;
}

export async function saveTarget(input: {
  month: number;
  week: number;
  sub1: number;
  sub2: number;
}): Promise<Target> {
  const data = await authFetch<{ target: Target }>("/api/targets", {
    method: "PUT",
    body: JSON.stringify({ target: input }),
  });
  return data.target;
}
