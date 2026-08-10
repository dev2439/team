import { query } from "./db.ts";
import type { Target } from "./types/target.ts";

type TargetRow = {
  id: number;
  month: number;
  week: number;
  sub1: number;
  sub2: number;
  created_at: Date | string;
};

export type TargetInput = {
  month: number;
  week: number;
  sub1: number;
  sub2: number;
};

function mapRow(row: TargetRow): Target {
  return {
    id: row.id,
    month: Number(row.month),
    week: Number(row.week),
    sub1: Number(row.sub1),
    sub2: Number(row.sub2),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

export async function getTarget(): Promise<Target | null> {
  const { rows } = await query<TargetRow>(
    `SELECT id, month, week, sub1, sub2, created_at
     FROM target
     ORDER BY id ASC
     LIMIT 1`,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Keep exactly one row: update it if present, otherwise insert. */
export async function upsertTarget(input: TargetInput): Promise<Target> {
  const existing = await getTarget();

  if (existing) {
    const { rows } = await query<TargetRow>(
      `UPDATE target
       SET month = $1, week = $2, sub1 = $3, sub2 = $4
       WHERE id = $5
       RETURNING id, month, week, sub1, sub2, created_at`,
      [input.month, input.week, input.sub1, input.sub2, existing.id],
    );

    await query(`DELETE FROM target WHERE id <> $1`, [existing.id]);

    return mapRow(rows[0]!);
  }

  const { rows } = await query<TargetRow>(
    `INSERT INTO target (month, week, sub1, sub2)
     VALUES ($1, $2, $3, $4)
     RETURNING id, month, week, sub1, sub2, created_at`,
    [input.month, input.week, input.sub1, input.sub2],
  );

  return mapRow(rows[0]!);
}
