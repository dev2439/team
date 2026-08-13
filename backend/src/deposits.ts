import { query } from "./db.ts";
import type { Deposit } from "./types/deposit.ts";

type DepositRow = {
  id: number;
  user_id: number;
  project_name: string;
  amount: number;
  created_at: Date | string;
};

export type DepositCreateInput = {
  userId: number;
  projectName: string;
  amount: number;
};

function mapRow(row: DepositRow): Deposit {
  return {
    id: row.id,
    user_id: row.user_id,
    project_name: row.project_name,
    amount: Number(row.amount),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

export async function createDeposit(
  input: DepositCreateInput,
): Promise<Deposit> {
  const { rows } = await query<DepositRow>(
    `INSERT INTO deposit (user_id, project_name, amount)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, project_name, amount, created_at`,
    [input.userId, input.projectName, input.amount],
  );
  return mapRow(rows[0]!);
}

export async function listDeposits(): Promise<Deposit[]> {
  const { rows } = await query<DepositRow>(
    `SELECT id, user_id, project_name, amount, created_at
     FROM deposit
     ORDER BY created_at ASC, id ASC`,
  );
  return rows.map(mapRow);
}
