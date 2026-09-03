"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCurrentUser, type PublicUser } from "@/lib/auth";
import {
  addDaysToKey,
  addMinutesToDateTime,
  dateKeysForPeriod,
  estDateTimeParts,
  formatDayLabel,
  formatEventPeriod,
  formatMonthDay,
  formatMonthTitle,
  getPlanWeeksFromTarget,
  minutesFromMidnight,
  monthGridDays,
  monthKeyOfDate,
  parseMonthKey,
  todayKey,
  uniqueMonthKeys,
  type CalendarWeek,
} from "@/lib/calendar-weeks";
import {
  createEventRequest,
  deleteEventRequest,
  fetchEventsInRange,
  updateEventRequest,
  type CalendarEvent,
} from "@/lib/events";
import { fetchTarget, type Target } from "@/lib/targets";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_PX = 52;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 18;

const EVENT_COLORS = [
  "border-sky-200 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-900/70 dark:text-sky-100",
  "border-violet-200 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-900/70 dark:text-violet-100",
  "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/70 dark:text-amber-100",
  "border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-100",
  "border-rose-200 bg-rose-100 text-rose-900 dark:border-rose-700 dark:bg-rose-900/70 dark:text-rose-100",
  "border-indigo-200 bg-indigo-100 text-indigo-900 dark:border-indigo-700 dark:bg-indigo-900/70 dark:text-indigo-100",
  "border-teal-200 bg-teal-100 text-teal-900 dark:border-teal-700 dark:bg-teal-900/70 dark:text-teal-100",
  "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-900 dark:border-fuchsia-700 dark:bg-fuchsia-900/70 dark:text-fuchsia-100",
] as const;

type CalendarView = "month" | "week";

type EventDraft = {
  id: number | null;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  title: string;
  note: string;
};

type LaidOutEvent = {
  event: CalendarEvent;
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
};

function eventColor(userId: number): string {
  return EVENT_COLORS[Math.abs(userId) % EVENT_COLORS.length]!;
}

function eventEndsAt(event: CalendarEvent): string {
  if (event.ends_at) return event.ends_at;
  const start = estDateTimeParts(event.starts_at);
  const end = addMinutesToDateTime(start.date, start.time, 60);
  return `${end.date}T${end.time}:00`;
}

function eventDateKeys(event: CalendarEvent): string[] {
  return dateKeysForPeriod(event.starts_at, eventEndsAt(event));
}

function naiveStamp(date: string, time: string): string {
  return `${date}T${time}`;
}

function eventNaiveStart(event: CalendarEvent): string {
  const parts = estDateTimeParts(event.starts_at);
  return naiveStamp(parts.date, parts.time);
}

function eventNaiveEnd(event: CalendarEvent): string {
  const parts = estDateTimeParts(eventEndsAt(event));
  return naiveStamp(parts.date, parts.time);
}

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function canEditEvent(user: PublicUser | null, event: CalendarEvent): boolean {
  if (!user) return false;
  return user.id === event.user_id || user.role === "BigBoss";
}

function groupEventsByDate(
  events: CalendarEvent[],
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    for (const key of eventDateKeys(event)) {
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }
  return map;
}

function overlappingIds(events: CalendarEvent[]): Set<number> {
  const ids = new Set<number>();
  for (let i = 0; i < events.length; i += 1) {
    const a = events[i]!;
    for (let j = i + 1; j < events.length; j += 1) {
      const b = events[j]!;
      if (
        rangesOverlap(
          eventNaiveStart(a),
          eventNaiveEnd(a),
          eventNaiveStart(b),
          eventNaiveEnd(b),
        )
      ) {
        ids.add(a.id);
        ids.add(b.id);
      }
    }
  }
  return ids;
}

function clipEventToDay(
  event: CalendarEvent,
  date: string,
): { startMin: number; endMin: number } | null {
  const start = estDateTimeParts(event.starts_at);
  const end = estDateTimeParts(eventEndsAt(event));
  if (end.date < date || start.date > date) return null;
  if (end.date === date && end.time === "00:00" && start.date < date) {
    return null;
  }

  const startMin = start.date < date ? 0 : minutesFromMidnight(event.starts_at);
  let endMin =
    end.date > date ? 24 * 60 : minutesFromMidnight(eventEndsAt(event));
  if (endMin <= startMin) endMin = startMin + 15;
  return { startMin, endMin };
}

function layoutDayEvents(
  events: CalendarEvent[],
  date: string,
): LaidOutEvent[] {
  const clipped = events
    .map((event) => {
      const span = clipEventToDay(event, date);
      return span ? { event, ...span } : null;
    })
    .filter((row): row is { event: CalendarEvent; startMin: number; endMin: number } =>
      row != null,
    )
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const laneEnds: number[] = [];
  const withCol = clipped.map((row) => {
    let col = laneEnds.findIndex((end) => end <= row.startMin);
    if (col === -1) {
      laneEnds.push(row.endMin);
      col = laneEnds.length - 1;
    } else {
      laneEnds[col] = row.endMin;
    }
    return { ...row, col };
  });

  return withCol.map((row) => {
    let cols = 1;
    for (const other of withCol) {
      if (other.event.id === row.event.id) continue;
      if (other.startMin < row.endMin && row.startMin < other.endMin) {
        cols = Math.max(cols, other.col + 1, row.col + 1);
      }
    }
    return { ...row, cols: Math.max(cols, row.col + 1) };
  });
}

function visibleHourRange(
  events: CalendarEvent[],
  days: string[],
): { startHour: number; endHour: number } {
  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;
  for (const date of days) {
    for (const event of events) {
      const span = clipEventToDay(event, date);
      if (!span) continue;
      startHour = Math.min(startHour, Math.floor(span.startMin / 60));
      endHour = Math.max(endHour, Math.ceil(span.endMin / 60));
    }
  }
  startHour = Math.max(0, Math.min(startHour, 22));
  endHour = Math.max(startHour + 1, Math.min(endHour, 24));
  return { startHour, endHour };
}

function formatHourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function EventChip({
  event,
  overlaps,
  compact = false,
  onClick,
}: {
  event: CalendarEvent;
  overlaps: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(click) => {
        click.stopPropagation();
        onClick();
      }}
      title={`${event.title} · ${event.user_name} · ${formatEventPeriod(event.starts_at, eventEndsAt(event))}`}
      className={`flex w-full min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-left ${eventColor(event.user_id)} ${
        overlaps ? "ring-2 ring-rose-400 dark:ring-rose-500" : ""
      }`}
    >
      <span className="shrink-0 text-[10px] font-semibold tabular-nums">
        {formatEventPeriod(event.starts_at, eventEndsAt(event))}
      </span>
      <span
        className={`min-w-0 truncate font-medium ${compact ? "text-[11px]" : "text-xs"}`}
      >
        {event.title}
      </span>
    </button>
  );
}

function WeekTimeline({
  week,
  today,
  eventsByDate,
  overlapIds,
  onCreate,
  onOpen,
}: {
  week: CalendarWeek;
  today: string;
  eventsByDate: Map<string, CalendarEvent[]>;
  overlapIds: Set<number>;
  onCreate: (date: string, time: string) => void;
  onOpen: (event: CalendarEvent) => void;
}) {
  const weekEvents = week.days.flatMap((date) => eventsByDate.get(date) ?? []);
  const { startHour, endHour } = visibleHourRange(weekEvents, week.days);
  const hours = Array.from(
    { length: endHour - startHour },
    (_, index) => startHour + index,
  );
  const visibleStart = startHour * 60;
  const visibleMinutes = (endHour - startHour) * 60;
  const totalHeight = hours.length * HOUR_PX;
  const now = new Date();
  const nowParts = estDateTimeParts(now);
  const nowMin = minutesFromMidnight(now);

  return (
    <div className="overflow-x-auto p-3 sm:p-4">
      <div
        className="grid min-w-[64rem]"
        style={{ gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))" }}
      >
        <div className="sticky left-0 z-10 bg-white dark:bg-slate-900" />
        {week.days.map((date) => {
          const isToday = date === today;
          return (
            <div
              key={`head-${date}`}
              className={`border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700 ${
                isToday ? "bg-sky-50 dark:bg-sky-950/30" : ""
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {formatDayLabel(date).split(",")[0]}
              </p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {formatMonthDay(date)}
              </p>
              <button
                type="button"
                onClick={() => onCreate(date, `${pad2(startHour)}:00`)}
                className="mt-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                Add
              </button>
            </div>
          );
        })}

        <div className="relative">
          {hours.map((hour) => (
            <div
              key={hour}
              className="pr-2 text-right text-[10px] font-medium tabular-nums text-slate-400 dark:text-slate-500"
              style={{ height: HOUR_PX }}
            >
              <span className="-translate-y-1.5 block">{formatHourLabel(hour)}</span>
            </div>
          ))}
        </div>

        {week.days.map((date) => {
          const isToday = date === today;
          const laidOut = layoutDayEvents(eventsByDate.get(date) ?? [], date);
          const showNow = isToday && nowMin >= visibleStart && nowMin <= endHour * 60;

          return (
            <div
              key={`col-${date}`}
              className={`relative border-l border-slate-200 dark:border-slate-700 ${
                isToday ? "bg-sky-50/50 dark:bg-sky-950/20" : "bg-white dark:bg-slate-900"
              }`}
              style={{ height: totalHeight }}
            >
              {hours.map((hour) => (
                <button
                  key={`${date}-${hour}`}
                  type="button"
                  aria-label={`Add event at ${formatHourLabel(hour)}`}
                  onClick={() => onCreate(date, `${pad2(hour)}:00`)}
                  className="absolute inset-x-0 border-t border-slate-100 hover:bg-sky-50/80 dark:border-slate-800 dark:hover:bg-sky-950/40"
                  style={{
                    top: (hour - startHour) * HOUR_PX,
                    height: HOUR_PX,
                  }}
                />
              ))}

              {showNow ? (
                <div
                  className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-rose-500"
                  style={{
                    top: ((nowMin - visibleStart) / visibleMinutes) * totalHeight,
                  }}
                >
                  <span className="absolute -left-0.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500" />
                </div>
              ) : null}

              {laidOut.map((row) => {
                const top = Math.max(
                  0,
                  ((row.startMin - visibleStart) / visibleMinutes) * totalHeight,
                );
                const bottom = Math.min(
                  totalHeight,
                  ((row.endMin - visibleStart) / visibleMinutes) * totalHeight,
                );
                const height = Math.max(22, bottom - top);
                const widthPct = 100 / row.cols;
                const leftPct = row.col * widthPct;
                const overlaps = overlapIds.has(row.event.id);
                return (
                  <button
                    key={row.event.id}
                    type="button"
                    onClick={() => onOpen(row.event)}
                    title={`${row.event.title} · ${row.event.user_name} · ${formatEventPeriod(row.event.starts_at, eventEndsAt(row.event))}`}
                    className={`absolute z-10 overflow-hidden rounded-md border px-1.5 py-1 text-left shadow-sm ${eventColor(row.event.user_id)} ${
                      overlaps ? "ring-2 ring-rose-400 dark:ring-rose-500" : ""
                    }`}
                    style={{
                      top,
                      height,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                    }}
                  >
                    <p className="truncate text-[11px] font-semibold leading-tight">
                      {row.event.title}
                    </p>
                    <p className="truncate text-[10px] font-medium tabular-nums opacity-80">
                      {formatEventPeriod(row.event.starts_at, eventEndsAt(row.event))}
                    </p>
                    {height > 44 ? (
                      <p className="truncate text-[10px] opacity-70">
                        {row.event.user_name}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventModal({
  draft,
  event,
  overlaps,
  currentUser,
  saving,
  error,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  draft: EventDraft;
  event: CalendarEvent | null;
  overlaps: CalendarEvent[];
  currentUser: PublicUser | null;
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<EventDraft>) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const isNew = draft.id == null;
  const editable = isNew || (event != null && canEditEvent(currentUser, event));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {isNew ? "Add event" : editable ? "Edit event" : "Event"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Set a start and end so overlaps show on the timeline. Everyone is
              notified 30 minutes before it starts.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              Title
            </span>
            <input
              value={draft.title}
              disabled={!editable}
              onChange={(change) => onChange({ title: change.target.value })}
              placeholder="Team standup, client call…"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-600 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                Start date
              </span>
              <input
                type="date"
                value={draft.startDate}
                disabled={!editable}
                onChange={(change) =>
                  onChange({ startDate: change.target.value })
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-400 disabled:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                Start time (ET)
              </span>
              <input
                type="time"
                value={draft.startTime}
                disabled={!editable}
                onChange={(change) =>
                  onChange({ startTime: change.target.value })
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-400 disabled:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                End date
              </span>
              <input
                type="date"
                value={draft.endDate}
                disabled={!editable}
                onChange={(change) => onChange({ endDate: change.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-400 disabled:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                End time (ET)
              </span>
              <input
                type="time"
                value={draft.endTime}
                disabled={!editable}
                onChange={(change) => onChange({ endTime: change.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-400 disabled:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
          </div>

          {overlaps.length > 0 ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-800 dark:bg-rose-950/40">
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                Overlaps {overlaps.length} event{overlaps.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {overlaps.slice(0, 5).map((item) => (
                  <li
                    key={item.id}
                    className="text-xs text-rose-800 dark:text-rose-200"
                  >
                    {item.user_name} · {item.title} ·{" "}
                    {formatEventPeriod(item.starts_at, eventEndsAt(item))}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No overlap with other events in this period.
            </p>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              Detailed note
            </span>
            <textarea
              value={draft.note}
              disabled={!editable}
              onChange={(change) => onChange({ note: change.target.value })}
              placeholder="Agenda, links, who should join…"
              rows={5}
              className="resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-600 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800"
            />
          </label>

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          {!isNew && editable ? (
            <button
              type="button"
              disabled={saving}
              onClick={onDelete}
              className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {editable ? "Cancel" : "Close"}
            </button>
            {editable ? (
              <button
                type="button"
                disabled={saving}
                onClick={onSave}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {saving ? "Saving…" : isNew ? "Add event" : "Save"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EventPage() {
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [view, setView] = useState<CalendarView>("week");
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [weekIndex, setWeekIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const weeks = useMemo(() => getPlanWeeksFromTarget(target), [target]);
  const monthKeys = useMemo(() => uniqueMonthKeys(weeks), [weeks]);
  const today = todayKey();

  const rangeLabel = useMemo(() => {
    if (weeks.length === 0) return null;
    const first = weeks[0]!;
    const last = weeks[weeks.length - 1]!;
    return `${formatMonthDay(first.key)} – ${formatMonthDay(last.endKey)} (${weeks.length} week${weeks.length === 1 ? "" : "s"})`;
  }, [weeks]);

  const inPlanDays = useMemo(() => {
    const set = new Set<string>();
    for (const week of weeks) {
      for (const day of week.days) set.add(day);
    }
    return set;
  }, [weeks]);

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const overlapIds = useMemo(() => overlappingIds(events), [events]);

  const selectedMonth = monthKey ?? monthKeys[0] ?? monthKeyOfDate(today);
  const { year, month } = parseMonthKey(selectedMonth);
  const monthDays = useMemo(() => monthGridDays(year, month), [year, month]);
  const selectedWeek: CalendarWeek | null = weeks[weekIndex] ?? weeks[0] ?? null;

  const authors = useMemo(() => {
    const map = new Map<number, string>();
    for (const event of events) {
      map.set(event.user_id, event.user_name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [events]);

  const draftOverlaps = useMemo(() => {
    if (!draft) return [];
    const start = naiveStamp(draft.startDate, draft.startTime);
    const end = naiveStamp(draft.endDate, draft.endTime);
    if (!start || !end || end <= start) return [];
    return events.filter((item) => {
      if (draft.id != null && item.id === draft.id) return false;
      return rangesOverlap(start, end, eventNaiveStart(item), eventNaiveEnd(item));
    });
  }, [draft, events]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await fetchCurrentUser();
        if (!cancelled) setCurrentUser(user);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load user");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadData = useCallback(async () => {
    if (currentUser == null) return;
    setLoading(true);
    try {
      const nextTarget = await fetchTarget();
      setTarget(nextTarget);
      const nextWeeks = getPlanWeeksFromTarget(nextTarget);
      const todayDate = todayKey();

      if (nextWeeks.length === 0) {
        setEvents([]);
        setMonthKey(monthKeyOfDate(todayDate));
        setWeekIndex(0);
      } else {
        const from = nextWeeks[0]!.key;
        const to = nextWeeks[nextWeeks.length - 1]!.endKey;
        const extraFrom = addDaysToKey(from, -7);
        const extraTo = addDaysToKey(to, 7);
        const rows = await fetchEventsInRange({
          from: extraFrom,
          to: extraTo,
        });
        setEvents(rows);

        const nextMonthKeys = uniqueMonthKeys(nextWeeks);
        const todayMonth = monthKeyOfDate(todayDate);
        setMonthKey(
          nextMonthKeys.includes(todayMonth)
            ? todayMonth
            : (nextMonthKeys[0] ?? todayMonth),
        );
        const currentWeekIndex = nextWeeks.findIndex((week) =>
          week.days.includes(todayDate),
        );
        setWeekIndex(currentWeekIndex >= 0 ? currentWeekIndex : 0);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openCreate(date: string, time = "09:00") {
    const end = addMinutesToDateTime(date, time, 60);
    setFormError(null);
    setDraft({
      id: null,
      startDate: date,
      startTime: time,
      endDate: end.date,
      endTime: end.time,
      title: "",
      note: "",
    });
  }

  function openEvent(event: CalendarEvent) {
    const start = estDateTimeParts(event.starts_at);
    const end = estDateTimeParts(eventEndsAt(event));
    setFormError(null);
    setDraft({
      id: event.id,
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
      title: event.title,
      note: event.note,
    });
  }

  function patchDraft(patch: Partial<EventDraft>) {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      const start = naiveStamp(next.startDate, next.startTime);
      const end = naiveStamp(next.endDate, next.endTime);
      if (end <= start) {
        const bumped = addMinutesToDateTime(next.startDate, next.startTime, 60);
        next.endDate = bumped.date;
        next.endTime = bumped.time;
      }
      return next;
    });
  }

  const editingEvent =
    draft?.id != null
      ? (events.find((item) => item.id === draft.id) ?? null)
      : null;

  async function saveDraft() {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) {
      setFormError("Title is required");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate)) {
      setFormError("Start date is required");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(draft.startTime)) {
      setFormError("Start time is required");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.endDate)) {
      setFormError("End date is required");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(draft.endTime)) {
      setFormError("End time is required");
      return;
    }
    const startsAt = naiveStamp(draft.startDate, draft.startTime);
    const endsAt = naiveStamp(draft.endDate, draft.endTime);
    if (endsAt <= startsAt) {
      setFormError("End must be after start");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (draft.id == null) {
        const created = await createEventRequest({
          title,
          note: draft.note,
          startsAt,
          endsAt,
        });
        setEvents((current) =>
          [...current, created].sort((a, b) =>
            a.starts_at.localeCompare(b.starts_at),
          ),
        );
      } else {
        const updated = await updateEventRequest({
          id: draft.id,
          title,
          note: draft.note,
          startsAt,
          endsAt,
        });
        setEvents((current) =>
          current
            .map((item) => (item.id === updated.id ? updated : item))
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
        );
      }
      setDraft(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save event");
    } finally {
      setSaving(false);
    }
  }

  async function removeDraft() {
    if (!draft?.id) return;
    setSaving(true);
    setFormError(null);
    try {
      await deleteEventRequest(draft.id);
      setEvents((current) => current.filter((item) => item.id !== draft.id));
      setDraft(null);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to delete event",
      );
    } finally {
      setSaving(false);
    }
  }

  const monthIndex = monthKeys.indexOf(selectedMonth);

  const calendarBoard = (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-900">
            {(["week", "month"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  view === option
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {option === "week" ? "Timeline" : "Monthly"}
              </button>
            ))}
          </div>
        </div>

        {view === "month" ? (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={monthIndex <= 0}
              onClick={() => {
                if (monthIndex > 0) setMonthKey(monthKeys[monthIndex - 1]!);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
            >
              ←
            </button>
            <p className="min-w-[10rem] text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
              {formatMonthTitle(year, month)}
            </p>
            <button
              type="button"
              disabled={monthIndex < 0 || monthIndex >= monthKeys.length - 1}
              onClick={() => {
                if (monthIndex >= 0 && monthIndex < monthKeys.length - 1) {
                  setMonthKey(monthKeys[monthIndex + 1]!);
                }
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
            >
              →
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={weekIndex <= 0}
              onClick={() => setWeekIndex((current) => Math.max(0, current - 1))}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
            >
              ←
            </button>
            <p className="min-w-[12rem] text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
              {selectedWeek
                ? `${selectedWeek.label} · ${formatMonthDay(selectedWeek.key)} – ${formatMonthDay(selectedWeek.endKey)}`
                : "No weeks"}
            </p>
            <button
              type="button"
              disabled={weekIndex >= weeks.length - 1}
              onClick={() =>
                setWeekIndex((current) =>
                  Math.min(weeks.length - 1, current + 1),
                )
              }
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
            >
              →
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => openCreate(today)}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Add event
        </button>
      </div>

      {loading ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          Loading calendar…
        </p>
      ) : weeks.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          No target week range set. Ask BigBoss to set Financial plan weeks
          first.
        </p>
      ) : view === "month" ? (
        <div className="p-3 sm:p-4">
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="bg-slate-50 px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              >
                {label}
              </div>
            ))}
            {monthDays.map((date) => {
              const inMonth = monthKeyOfDate(date) === selectedMonth;
              const inPlan = inPlanDays.has(date);
              const isToday = date === today;
              const dayEvents = eventsByDate.get(date) ?? [];
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => openCreate(date)}
                  className={`flex min-h-[7.5rem] flex-col items-stretch gap-1 bg-white p-1.5 text-left transition hover:bg-sky-50/70 dark:bg-slate-900 dark:hover:bg-sky-950/30 ${
                    inMonth ? "" : "opacity-45"
                  } ${inPlan ? "" : "bg-slate-50/80 dark:bg-slate-950/40"} ${
                    isToday ? "ring-2 ring-inset ring-sky-400" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        isToday
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {Number(date.slice(8))}
                    </span>
                    {inPlan ? (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        +
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                    {dayEvents.slice(0, 3).map((event) => (
                      <EventChip
                        key={event.id}
                        event={event}
                        overlaps={overlapIds.has(event.id)}
                        compact
                        onClick={() => openEvent(event)}
                      />
                    ))}
                    {dayEvents.length > 3 ? (
                      <span className="px-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                        +{dayEvents.length - 3} more
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : selectedWeek ? (
        <WeekTimeline
          week={selectedWeek}
          today={today}
          eventsByDate={eventsByDate}
          overlapIds={overlapIds}
          onCreate={openCreate}
          onOpen={openEvent}
        />
      ) : null}

      {authors.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
          {authors.map(([userId, name]) => (
            <span
              key={userId}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${eventColor(userId)}`}
            >
              {name}
            </span>
          ))}
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Rose ring = overlapping period
          </span>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Event
        </h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Add events with a start–end period. The weekly timeline shows who
          overlaps. Everyone is notified 30 minutes before an event starts.
        </p>
        {rangeLabel ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {rangeLabel}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {calendarBoard}

      {draft ? (
        <EventModal
          draft={draft}
          event={editingEvent}
          overlaps={draftOverlaps}
          currentUser={currentUser}
          saving={saving}
          error={formError}
          onChange={patchDraft}
          onClose={() => setDraft(null)}
          onSave={() => {
            void saveDraft();
          }}
          onDelete={() => {
            void removeDraft();
          }}
        />
      ) : null}
    </div>
  );
}
