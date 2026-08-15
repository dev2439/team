import { getApiBase, getToken } from "@/lib/auth";

export type UserRole = "Member" | "SubBoss" | "BigBoss" | "Tester";

export type ListedUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  balance: number;
  sub_team: string | null;
};

type UsersResponse = {
  users: ListedUser[];
  sub_teams: string[];
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

export async function fetchUsers(): Promise<{
  users: ListedUser[];
  sub_teams: string[];
}> {
  return authFetch<UsersResponse>("/api/users");
}

export async function updateUser(
  userId: number,
  input: { role?: UserRole; sub_team?: string | null },
): Promise<ListedUser> {
  const data = await authFetch<{ user: ListedUser }>(`/api/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return data.user;
}
