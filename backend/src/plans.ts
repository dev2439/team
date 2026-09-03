import { query } from "./db.ts";
import type {
  PlanItem,
  PlanItemScope,
  PlanItemStatus,
} from "./types/plan.ts";

const PLAN_ITEM_SELECT = `
  p.id,
  p.user_id,
  p.plan_date::text AS plan_date,
  p.scope,
  p.title,
  p.status,
  p.note,
  p.not_done_reason,
  p.sort_order,
  p.created_at,
  p.updated_at,
  u.name AS user_name
`;

function isPlanStatus(value: unknown): value is PlanItemStatus {
  return value === "pending" || value === "done" || value === "not_done";
}

function isPlanScope(value: unknown): value is PlanItemScope {
  return value === "day" || value === "week" || value === "month";
}

function mapRow(row: {
  id: number;
  user_id: number;
  plan_date: string | Date;
  scope?: string | null;
  title: string;
  status: PlanItemStatus;
  note: string | null;
  not_done_reason: string | null;
  sort_order: number | string;
  created_at: string | Date;
  updated_at: string | Date;
  user_name?: string | null;
}): PlanItem {
  const scope = isPlanScope(row.scope) ? row.scope : "day";
  return {
    id: row.id,
    user_id: row.user_id,
    plan_date: String(row.plan_date).slice(0, 10),
    scope,
    title: row.title,
    status: row.status,
    note: row.note ?? "",
    not_done_reason: row.not_done_reason ?? "",
    sort_order: Number(row.sort_order) || 0,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
    user_name: row.user_name ?? undefined,
  };
}

function assertMonth(month: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("month must be YYYY-MM");
  }
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthIndex) ||
    monthIndex < 1 ||
    monthIndex > 12
  ) {
    throw new Error("month must be YYYY-MM");
  }
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const start = `${month}-01`;
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function assertDateKey(value: string, label: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return trimmed;
}

export async function listPlanItemsInRange(input: {
  from: string;
  to: string;
  userId: number;
}): Promise<PlanItem[]> {
  const from = assertDateKey(input.from, "from");
  const to = assertDateKey(input.to, "to");
  if (from > to) {
    throw new Error("from must be on or before to");
  }
  if (!Number.isFinite(input.userId) || input.userId <= 0) {
    throw new Error("user_id is required");
  }

  const { rows } = await query<{
    id: number;
    user_id: number;
    plan_date: string | Date;
    scope: string;
    title: string;
    status: PlanItemStatus;
    note: string | null;
    not_done_reason: string | null;
    sort_order: number | string;
    created_at: string | Date;
    updated_at: string | Date;
    user_name: string | null;
  }>(
    `SELECT ${PLAN_ITEM_SELECT}
     FROM plan_item p
     INNER JOIN users u ON u.id = p.user_id
     WHERE p.plan_date >= $1::date
       AND p.plan_date <= $2::date
       AND p.user_id = $3
     ORDER BY p.plan_date ASC, p.scope ASC, p.sort_order ASC, p.id ASC`,
    [from, to, input.userId],
  );
  return rows.map(mapRow);
}

export async function listPlanItemsForMonth(
  month: string,
  userId: number,
): Promise<PlanItem[]> {
  const { start, end } = assertMonth(month);
  return listPlanItemsInRange({ from: start, to: end, userId });
}

export async function createPlanItem(input: {
  userId: number;
  planDate: string;
  title: string;
  scope?: PlanItemScope;
}): Promise<PlanItem> {
  const planDate = input.planDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
    throw new Error("plan_date must be YYYY-MM-DD");
  }
  const scope = input.scope ?? "day";
  if (!isPlanScope(scope)) {
    throw new Error("scope must be day, week, or month");
  }
  const title = input.title.trim();
  if (!title) {
    throw new Error("title is required");
  }
  if (title.length > 500) {
    throw new Error("title must be at most 500 characters");
  }

  const { rows: orderRows } = await query<{ next_order: number | string }>(
    `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
     FROM plan_item
     WHERE plan_date = $1::date
       AND scope = $2`,
    [planDate, scope],
  );
  const sortOrder = Number(orderRows[0]?.next_order) || 1;

  const { rows } = await query<{
    id: number;
    user_id: number;
    plan_date: string | Date;
    scope: string;
    title: string;
    status: PlanItemStatus;
    note: string | null;
    not_done_reason: string | null;
    sort_order: number | string;
    created_at: string | Date;
    updated_at: string | Date;
  }>(
    `INSERT INTO plan_item (user_id, plan_date, scope, title, sort_order)
     VALUES ($1, $2::date, $3, $4, $5)
     RETURNING
       id,
       user_id,
       plan_date::text AS plan_date,
       scope,
       title,
       status,
       note,
       not_done_reason,
       sort_order,
       created_at,
       updated_at`,
    [input.userId, planDate, scope, title, sortOrder],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Failed to create plan item");
  }

  const { rows: userRows } = await query<{ name: string }>(
    `SELECT name FROM users WHERE id = $1`,
    [input.userId],
  );
  return mapRow({ ...row, user_name: userRows[0]?.name ?? null });
}

export async function updatePlanItem(input: {
  id: number;
  title?: string;
  status?: PlanItemStatus;
  note?: string;
  notDoneReason?: string;
}): Promise<PlanItem> {
  const { rows: existingRows } = await query<{
    id: number;
    user_id: number;
    plan_date: string | Date;
    scope: string;
    title: string;
    status: PlanItemStatus;
    note: string | null;
    not_done_reason: string | null;
    sort_order: number | string;
    created_at: string | Date;
    updated_at: string | Date;
  }>(
    `SELECT
       id,
       user_id,
       plan_date::text AS plan_date,
       scope,
       title,
       status,
       note,
       not_done_reason,
       sort_order,
       created_at,
       updated_at
     FROM plan_item
     WHERE id = $1
     LIMIT 1`,
    [input.id],
  );
  const existing = existingRows[0];
  if (!existing) {
    throw new Error("Plan item not found");
  }

  const title =
    input.title !== undefined ? input.title.trim() : existing.title;
  if (!title) {
    throw new Error("title is required");
  }
  if (title.length > 500) {
    throw new Error("title must be at most 500 characters");
  }

  const status = input.status ?? existing.status;
  if (!isPlanStatus(status)) {
    throw new Error("status must be pending, done, or not_done");
  }

  const note =
    input.note !== undefined ? input.note.trim() : existing.note ?? "";
  if (note.length > 2000) {
    throw new Error("note must be at most 2000 characters");
  }

  const notDoneReason =
    input.notDoneReason !== undefined
      ? input.notDoneReason.trim()
      : existing.not_done_reason ?? "";
  if (status === "not_done" && !notDoneReason) {
    throw new Error("Reason is required when status is not done");
  }
  if (notDoneReason.length > 2000) {
    throw new Error("not_done_reason must be at most 2000 characters");
  }

  const { rows } = await query<{
    id: number;
    user_id: number;
    plan_date: string | Date;
    scope: string;
    title: string;
    status: PlanItemStatus;
    note: string | null;
    not_done_reason: string | null;
    sort_order: number | string;
    created_at: string | Date;
    updated_at: string | Date;
  }>(
    `UPDATE plan_item
     SET
       title = $2,
       status = $3,
       note = $4,
       not_done_reason = CASE
         WHEN $3 = 'not_done' THEN $5
         ELSE ''
       END,
       updated_at = NOW()
     WHERE id = $1
     RETURNING
       id,
       user_id,
       plan_date::text AS plan_date,
       scope,
       title,
       status,
       note,
       not_done_reason,
       sort_order,
       created_at,
       updated_at`,
    [input.id, title, status, note, notDoneReason],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Plan item not found");
  }
  const { rows: userRows } = await query<{ name: string }>(
    `SELECT name FROM users WHERE id = $1`,
    [row.user_id],
  );
  return mapRow({ ...row, user_name: userRows[0]?.name ?? null });
}

export async function deletePlanItem(id: number): Promise<void> {
  const { rows } = await query<{ id: number }>(
    `DELETE FROM plan_item WHERE id = $1 RETURNING id`,
    [id],
  );
  if (!rows[0]) {
    throw new Error("Plan item not found");
  }
}
