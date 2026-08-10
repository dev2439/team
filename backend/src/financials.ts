import { query } from "./db.ts";
import type { Financial } from "./types/financial.ts";

export const FINANCIAL_TYPES = ["in", "ums", "out"] as const;
export type FinancialType = (typeof FINANCIAL_TYPES)[number];

type FinancialRow = {
  id: number;
  user_id: number;
  amount: number;
  type: string;
  note: string;
  created_at: Date | string;
  day: string;
};

export type FinancialUpsertInput = {
  userId: number;
  amount: number;
  type: FinancialType;
  note: string;
  day: string;
};

export function isFinancialType(value: string): value is FinancialType {
  return (FINANCIAL_TYPES as readonly string[]).includes(value);
}

function mapRow(row: FinancialRow): Financial & { day: string } {
  return {
    id: row.id,
    user_id: row.user_id,
    amount: Number(row.amount),
    type: row.type,
    note: row.note ?? "",
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    day: row.day,
  };
}

export async function listFinancialInRange(input: {
  from: string;
  to: string;
}): Promise<Array<Financial & { day: string }>> {
  const { rows } = await query<FinancialRow>(
    `SELECT id, user_id, amount, type, note, created_at,
            to_char(day, 'YYYY-MM-DD') AS day
     FROM financial
     WHERE day >= $1::date
       AND day <= $2::date
     ORDER BY day ASC, id ASC`,
    [input.from, input.to],
  );
  return rows.map(mapRow);
}

export async function upsertFinancial(
  input: FinancialUpsertInput,
): Promise<Financial & { day: string }> {
  const { rows } = await query<FinancialRow>(
    `INSERT INTO financial (user_id, amount, type, note, created_at, day)
     VALUES ($1, $2, $3, $4, $5::date, $5::date)
     ON CONFLICT (user_id, type, day)
     DO UPDATE SET
       amount = EXCLUDED.amount,
       note = EXCLUDED.note
     RETURNING id, user_id, amount, type, note, created_at,
               to_char(day, 'YYYY-MM-DD') AS day`,
    [input.userId, input.amount, input.type, input.note, input.day],
  );
  return mapRow(rows[0]!);
}
