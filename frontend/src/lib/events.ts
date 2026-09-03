import { getApiBase, getToken } from "@/lib/auth";

export type CalendarEvent = {
  id: number;
  user_id: number;
  user_name: string;
  title: string;
  note: string;
  starts_at: string;
  ends_at: string;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
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

export async function fetchEventsInRange(input: {
  from: string;
  to: string;
}): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    from: input.from,
    to: input.to,
  });
  const data = await authFetch<{ events: CalendarEvent[] }>(
    `/api/events?${params.toString()}`,
  );
  return data.events;
}

export async function createEventRequest(input: {
  title: string;
  note?: string;
  startsAt: string;
  endsAt: string;
}): Promise<CalendarEvent> {
  const data = await authFetch<{ event: CalendarEvent }>("/api/events", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      note: input.note ?? "",
      starts_at: input.startsAt,
      ends_at: input.endsAt,
    }),
  });
  return data.event;
}

export async function updateEventRequest(input: {
  id: number;
  title?: string;
  note?: string;
  startsAt?: string;
  endsAt?: string;
}): Promise<CalendarEvent> {
  const data = await authFetch<{ event: CalendarEvent }>(
    `/api/events/${input.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        title: input.title,
        note: input.note,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
      }),
    },
  );
  return data.event;
}

export async function deleteEventRequest(id: number): Promise<void> {
  await authFetch<{ ok: boolean }>(`/api/events/${id}`, {
    method: "DELETE",
  });
}
