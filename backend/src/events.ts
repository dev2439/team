import { query } from "./db.ts";
import type { CalendarEvent } from "./types/event.ts";

type EventRow = {
  id: number;
  user_id: number;
  user_name: string | null;
  title: string;
  note: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  notified_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const EVENT_SELECT = `
  e.id,
  e.user_id,
  u.name AS user_name,
  e.title,
  e.note,
  e.starts_at,
  e.ends_at,
  e.notified_at,
  e.created_at,
  e.updated_at
`;

const EVENT_RETURNING = `
  id,
  user_id,
  title,
  note,
  starts_at,
  ends_at,
  notified_at,
  created_at,
  updated_at
`;

const EST_ZONE = "America/New_York";
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAIVE_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const TITLE_MAX = 200;
const NOTE_MAX = 4000;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapRow(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name ?? "Teammate",
    title: row.title,
    note: row.note ?? "",
    starts_at: toIso(row.starts_at),
    ends_at: toIso(row.ends_at),
    notified_at: row.notified_at == null ? null : toIso(row.notified_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function assertDateKey(value: string, label: string): string {
  const trimmed = value.trim();
  if (!DATE_KEY_RE.test(trimmed)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return trimmed;
}

function assertTitle(value: string): string {
  const title = value.trim();
  if (!title) {
    throw new Error("title is required");
  }
  if (title.length > TITLE_MAX) {
    throw new Error(`title must be at most ${TITLE_MAX} characters`);
  }
  return title;
}

function assertNote(value: string): string {
  const note = value.trim();
  if (note.length > NOTE_MAX) {
    throw new Error(`note must be at most ${NOTE_MAX} characters`);
  }
  return note;
}

/** Naive "YYYY-MM-DDTHH:MM" is Eastern Time. ISO with offset is used as-is. */
async function parseEventDateTime(raw: string, label: string): Promise<Date> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }

  if (NAIVE_DATE_TIME_RE.test(trimmed)) {
    const normalized = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
    const { rows } = await query<{ value: Date | string }>(
      `SELECT $1::timestamp AT TIME ZONE $2 AS value`,
      [normalized.replace("T", " "), EST_ZONE],
    );
    const value = rows[0]?.value;
    if (value == null) {
      throw new Error(`${label} must be a valid date and time`);
    }
    return value instanceof Date ? value : new Date(value);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid date and time`);
  }
  return parsed;
}

export async function listEventsInRange(input: {
  from: string;
  to: string;
}): Promise<CalendarEvent[]> {
  const from = assertDateKey(input.from, "from");
  const to = assertDateKey(input.to, "to");
  if (from > to) {
    throw new Error("from must be on or before to");
  }

  const { rows } = await query<EventRow>(
    `SELECT ${EVENT_SELECT}
     FROM calendar_event e
     INNER JOIN users u ON u.id = e.user_id
     WHERE e.ends_at > ($1::timestamp AT TIME ZONE $3)
       AND e.starts_at < (($2::date + 1)::timestamp AT TIME ZONE $3)
     ORDER BY e.starts_at ASC, e.id ASC`,
    [from, to, EST_ZONE],
  );
  return rows.map(mapRow);
}

export async function getEventById(id: number): Promise<CalendarEvent | null> {
  const { rows } = await query<EventRow>(
    `SELECT ${EVENT_SELECT}
     FROM calendar_event e
     INNER JOIN users u ON u.id = e.user_id
     WHERE e.id = $1
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
}

export async function createEvent(input: {
  userId: number;
  title: string;
  note?: string;
  startsAt: string;
  endsAt: string;
}): Promise<CalendarEvent> {
  const title = assertTitle(input.title);
  const note = assertNote(input.note ?? "");
  const startsAt = await parseEventDateTime(input.startsAt, "starts_at");
  const endsAt = await parseEventDateTime(input.endsAt, "ends_at");
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("ends_at must be after starts_at");
  }

  const { rows } = await query<EventRow>(
    `INSERT INTO calendar_event (user_id, title, note, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${EVENT_RETURNING}`,
    [input.userId, title, note, startsAt.toISOString(), endsAt.toISOString()],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to create event");
  }

  const { rows: userRows } = await query<{ name: string }>(
    `SELECT name FROM users WHERE id = $1`,
    [input.userId],
  );
  return mapRow({ ...row, user_name: userRows[0]?.name ?? null });
}

export async function updateEvent(input: {
  id: number;
  title?: string;
  note?: string;
  startsAt?: string;
  endsAt?: string;
}): Promise<CalendarEvent> {
  const existing = await getEventById(input.id);
  if (!existing) {
    throw new Error("Event not found");
  }

  const title =
    input.title !== undefined ? assertTitle(input.title) : existing.title;
  const note = input.note !== undefined ? assertNote(input.note) : existing.note;
  const startsAt =
    input.startsAt !== undefined
      ? await parseEventDateTime(input.startsAt, "starts_at")
      : new Date(existing.starts_at);
  const endsAt =
    input.endsAt !== undefined
      ? await parseEventDateTime(input.endsAt, "ends_at")
      : new Date(existing.ends_at);
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("ends_at must be after starts_at");
  }

  const startsChanged =
    startsAt.getTime() !== new Date(existing.starts_at).getTime();

  const { rows } = await query<EventRow>(
    `UPDATE calendar_event
     SET
       title = $2,
       note = $3,
       starts_at = $4,
       ends_at = $5,
       notified_at = CASE
         WHEN $6 THEN NULL
         ELSE notified_at
       END,
       updated_at = NOW()
     WHERE id = $1
     RETURNING ${EVENT_RETURNING}`,
    [
      input.id,
      title,
      note,
      startsAt.toISOString(),
      endsAt.toISOString(),
      startsChanged,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Event not found");
  }

  if (startsChanged) {
    await query(
      `DELETE FROM event_notification
       WHERE event_id = $1
         AND read_at IS NULL`,
      [input.id],
    );
  }

  return mapRow({ ...row, user_name: existing.user_name });
}

export async function deleteEvent(id: number): Promise<void> {
  const { rows } = await query<{ id: number }>(
    `DELETE FROM calendar_event WHERE id = $1 RETURNING id`,
    [id],
  );
  if (!rows[0]) {
    throw new Error("Event not found");
  }
}

/** Create notifications for every user 30 minutes before an event starts. */
export async function notifyDueEvents(): Promise<number> {
  const { rowCount } = await query(
    `WITH due AS (
       UPDATE calendar_event
       SET notified_at = NOW()
       WHERE notified_at IS NULL
         AND starts_at <= NOW() + INTERVAL '30 minutes'
       RETURNING id, user_id
     )
     INSERT INTO event_notification (event_id, recipient_user_id, actor_user_id)
     SELECT due.id, u.id, due.user_id
     FROM due
     CROSS JOIN users u`,
  );
  return rowCount ?? 0;
}
