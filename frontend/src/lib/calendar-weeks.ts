import type { Target } from "@/lib/targets";

/** Same week math as Plan: Monday–Sunday in Eastern Time from Financial target. */
export const EST_TIMEZONE = "America/New_York";
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarWeek = {
  key: string;
  endKey: string;
  label: string;
  days: string[];
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateKeyFromParts(parts: {
  year: number;
  month: number;
  day: number;
}): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/** Calendar date in Eastern Time. Date-only keys are used as-is (no UTC shift). */
export function estDateParts(value: string | Date): {
  year: number;
  month: number;
  day: number;
} {
  if (typeof value === "string" && DATE_ONLY_RE.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return { year: year!, month: month!, day: day! };
  }

  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EST_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return { year: num("year"), month: num("month"), day: num("day") };
}

export function toEstDateKey(value: string | Date): string {
  return formatDateKeyFromParts(estDateParts(value));
}

export function todayKey(): string {
  return toEstDateKey(new Date());
}

export function dateKeyToUtcNoon(key: string): Date {
  const { year, month, day } = estDateParts(key);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function addDaysToKey(key: string, days: number): string {
  const date = dateKeyToUtcNoon(key);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Monday of the Eastern calendar week that contains `key`. */
export function mondayOfWeek(key: string): string {
  const jsDay = dateKeyToUtcNoon(key).getUTCDay();
  const offset = jsDay === 0 ? -6 : 1 - jsDay;
  return addDaysToKey(key, offset);
}

export function formatMonthDay(value: string | Date): string {
  const { month, day } = estDateParts(value);
  return `${month}/${day}`;
}

/** Same week count as Financial / Plan, aligned Monday–Sunday in Eastern Time. */
export function getPlanWeeksFromTarget(target: Target | null): CalendarWeek[] {
  if (!target) return [];

  const weekCount = Math.max(0, Math.trunc(Number(target.week) || 0));
  if (weekCount === 0) return [];

  const startKey = mondayOfWeek(toEstDateKey(target.created_at));

  return Array.from({ length: weekCount }, (_, index) => {
    const weekStartKey = addDaysToKey(startKey, index * 7);
    const weekEndKey = addDaysToKey(weekStartKey, 6);
    const days = Array.from({ length: 7 }, (__, offset) =>
      addDaysToKey(weekStartKey, offset),
    );

    return {
      key: weekStartKey,
      endKey: weekEndKey,
      label: `Week ${index + 1}`,
      days,
    };
  });
}

export function formatDayLabel(isoDate: string): string {
  return dateKeyToUtcNoon(isoDate).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatMonthTitle(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Mon–Sun grid covering a calendar month (includes leading/trailing days). */
export function monthGridDays(year: number, month: number): string[] {
  const firstKey = `${year}-${pad2(month)}-01`;
  const lastKey = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
  const start = mondayOfWeek(firstKey);
  const end = addDaysToKey(mondayOfWeek(lastKey), 6);
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDaysToKey(cursor, 1);
  }
  return days;
}

export function monthKeyOfDate(dateKey: string): string {
  const { year, month } = estDateParts(dateKey);
  return `${year}-${pad2(month)}`;
}

export function parseMonthKey(monthKey: string): { year: number; month: number } {
  const [year, month] = monthKey.split("-").map(Number);
  return { year: year!, month: month! };
}

export function uniqueMonthKeys(weeks: CalendarWeek[]): string[] {
  const keys = new Set<string>();
  for (const week of weeks) {
    for (const day of week.days) {
      keys.add(monthKeyOfDate(day));
    }
  }
  return [...keys].sort();
}

export function estDateTimeParts(value: string | Date): {
  date: string;
  time: string;
} {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hourRaw = pick("hour");
  const hour = hourRaw === "24" ? "00" : hourRaw;
  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    time: `${hour}:${pick("minute")}`,
  };
}

export function formatEventTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString("en-US", {
    timeZone: EST_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatEventDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("en-US", {
    timeZone: EST_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatEventPeriod(startsAt: string, endsAt: string): string {
  const start = estDateTimeParts(startsAt);
  const end = estDateTimeParts(endsAt);
  if (start.date === end.date) {
    return `${formatEventTime(startsAt)} – ${formatEventTime(endsAt)}`;
  }
  return `${formatEventDateTime(startsAt)} – ${formatEventDateTime(endsAt)}`;
}

export function minutesFromMidnight(value: string | Date): number {
  const { time } = estDateTimeParts(value);
  const [hour, minute] = time.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

export function addMinutesToDateTime(
  dateKey: string,
  time: string,
  minutes: number,
): { date: string; time: string } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(
    Date.UTC(year!, month! - 1, day!, hour ?? 0, (minute ?? 0) + minutes),
  );
  return {
    date: `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`,
    time: `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`,
  };
}

export function dateKeysForPeriod(startsAt: string, endsAt: string): string[] {
  const start = estDateTimeParts(startsAt);
  const end = estDateTimeParts(endsAt);
  const keys: string[] = [];
  let cursor = start.date;
  while (cursor <= end.date) {
    keys.push(cursor);
    cursor = addDaysToKey(cursor, 1);
    if (keys.length > 62) break;
  }
  if (end.time === "00:00" && keys.length > 1) {
    keys.pop();
  }
  return keys.length > 0 ? keys : [start.date];
}
