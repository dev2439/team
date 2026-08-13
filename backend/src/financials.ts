import { query } from "./db.ts";
import type { Financial } from "./types/financial.ts";

type FinancialRow = {
  id: number;
  user_id: number;
  amount: number;
  type: string;
  created_at: Date | string;
  day: string;
};

export type FinancialUpsertInput = {
  userId: number;
  amount: number;
  type: string;
  day: string;
};

export function isFinancialType(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 200;
}

function mapRow(row: FinancialRow): Financial & { day: string } {
  return {
    id: row.id,
    user_id: row.user_id,
    amount: Number(row.amount),
    type: row.type,
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
    `SELECT id, user_id, amount, type, created_at,
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
     VALUES ($1, $2, $3, '', $4::date, $4::date)
     ON CONFLICT (user_id, type, day)
     DO UPDATE SET
       amount = EXCLUDED.amount
     RETURNING id, user_id, amount, type, created_at,
               to_char(day, 'YYYY-MM-DD') AS day`,
    [input.userId, input.amount, input.type, input.day],
  );
  return mapRow(rows[0]!);
}
