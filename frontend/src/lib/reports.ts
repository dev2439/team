import { getApiBase, getToken } from "@/lib/auth";

export type WeekDayKey =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export type WeekDayReport = {
  day: WeekDayKey;
  date: string;
  working_time: number;
  bid: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
  is_today: boolean;
};

type WeekResponse = {
  days: WeekDayReport[];
  today: WeekDayKey;
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

export async function fetchWeekReports(): Promise<WeekResponse> {
  return authFetch<WeekResponse>("/api/reports/week");
}

export async function saveTodayReport(input: {
  working_time: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
}) {
  return authFetch<{ report: unknown }>("/api/reports/today", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
