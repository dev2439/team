import { getApiBase, getToken } from "@/lib/auth";

export type BidNotification = {
  id: number;
  bid_id: number;
  recipient_user_id: number;
  actor_user_id: number;
  actor_name: string;
  bid_url: string;
  read_at: string | null;
  created_at: string;
};

type NotificationsResponse = {
  notifications: BidNotification[];
  recipient_user_ids: number[];
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

export async function fetchUnreadBidNotifications(): Promise<NotificationsResponse> {
  return authFetch<NotificationsResponse>("/api/notifications");
}

export async function markBidNotificationsRead(
  notificationIds?: number[],
): Promise<void> {
  await authFetch<{ ok: boolean }>("/api/notifications/read", {
    method: "POST",
    body: JSON.stringify(
      notificationIds ? { ids: notificationIds } : {},
    ),
  });
}
