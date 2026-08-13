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

export type TeamReportEntry = {
  date: string;
  user_id: number;
  user_name: string;
  sub_team_id: number | null;
  sub_team_name: string | null;
  working_time: number;
  bid: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
};

export type SubTeamWeekDayTotals = {
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

export type SubTeamWeekMemberDay = {
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

export type SubTeamWeekMemberTotals = {
  user_id: number;
  user_name: string;
  working_time: number;
  bid: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
  days: SubTeamWeekMemberDay[];
};

export type SubTeamWeekReports = {
  sub_team_name: string | null;
  days: SubTeamWeekDayTotals[];
  members: SubTeamWeekMemberTotals[];
  today: WeekDayKey;
};

type WeekResponse = {
  days: WeekDayReport[];
  today: WeekDayKey;
};

type TeamReportsResponse = {
  reports: TeamReportEntry[];
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

export async function fetchSubTeamWeekReports(): Promise<SubTeamWeekReports> {
  return authFetch<SubTeamWeekReports>("/api/reports/sub-team-week");
}

export async function fetchTeamReports(): Promise<TeamReportEntry[]> {
  const data = await authFetch<TeamReportsResponse>("/api/team-reports");
  return data.reports;
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

export async function saveDayReport(input: {
  date: string;
  working_time: number;
  message: number;
  call: number;
  offer: number;
  accounts: number;
}) {
  return authFetch<{ report: unknown }>("/api/reports/day", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
