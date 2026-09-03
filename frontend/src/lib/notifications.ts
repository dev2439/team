import { fetchWithTimeout, getApiBase, getToken } from "@/lib/auth";

const NOTIFICATIONS_TIMEOUT_MS = 8_000;

export type NotificationKind = "bid" | "bid_test" | "event" | "birthday";

export type BidNotification = {
  id: number;
  kind: NotificationKind;
  bid_id: number | null;
  bid_test_id: number | null;
  event_id: number | null;
  recipient_user_id: number;
  actor_user_id: number;
  actor_name: string;
  bid_url: string;
  event_title: string;
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

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${getApiBase()}${path}`,
      {
        ...init,
        headers,
      },
      NOTIFICATIONS_TIMEOUT_MS,
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

export async function fetchUnreadBidNotifications(): Promise<NotificationsResponse> {
  return authFetch<NotificationsResponse>("/api/notifications");
}

export async function markBidNotificationsRead(
  items?: Array<{ id: number; kind: NotificationKind }>,
): Promise<void> {
  await authFetch<{ ok: boolean }>("/api/notifications/read", {
    method: "POST",
    body: JSON.stringify(items ? { items } : {}),
  });
}

export function notificationKey(item: {
  id: number;
  kind: NotificationKind;
}): string {
  return `${item.kind}:${item.id}`;
}

export function alertPathForNotification(
  item: BidNotification,
  role: string,
): string {
  if (item.kind === "bid_test") {
    return "/dashboard/test-bid";
  }
  if (item.kind === "event") {
    return "/dashboard/event";
  }
  if (item.kind === "birthday") {
    return "/dashboard/settings";
  }
  return role === "BigBoss" ? "/dashboard/team-bid" : "/dashboard/bid";
}
