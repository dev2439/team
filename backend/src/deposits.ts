import { query } from "./db.ts";
import type { Deposit } from "./types/deposit.ts";

type DepositRow = {
  id: number;
  user_id: number;
  project_id: number | null;
  amount: number;
  created_at: Date | string;
  project_name?: string | null;
};

export type DepositCreateInput = {
  userId: number;
  projectId: number | null;
  amount: number;
};

function mapRow(row: DepositRow): Deposit {
  const projectId =
    row.project_id == null ? null : Number(row.project_id) || null;
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: projectId,
    project_name:
      projectId == null
        ? "Bid"
        : String(row.project_name ?? "").trim() || `Project #${projectId}`,
    amount: Number(row.amount),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

async function loadDepositById(id: number): Promise<Deposit> {
  const { rows } = await query<DepositRow>(
    `SELECT d.id, d.user_id, d.project_id, d.amount, d.created_at,
            p.name AS project_name
     FROM deposit d
     LEFT JOIN project p ON p.id = d.project_id
     WHERE d.id = $1`,
    [id],
  );
  return mapRow(rows[0]!);
}

export async function createDeposit(
  input: DepositCreateInput,
): Promise<Deposit> {
  const { rows } = await query<DepositRow>(
    `INSERT INTO deposit (user_id, project_id, amount)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, project_id, amount, created_at`,
    [input.userId, input.projectId, input.amount],
  );
  return loadDepositById(rows[0]!.id);
}

export async function listDeposits(): Promise<Deposit[]> {
  const { rows } = await query<DepositRow>(
    `SELECT d.id, d.user_id, d.project_id, d.amount, d.created_at,
            p.name AS project_name
     FROM deposit d
     LEFT JOIN project p ON p.id = d.project_id
     ORDER BY d.created_at ASC, d.id ASC`,
  );
  return rows.map(mapRow);
}

export async function projectOwnedByUser(
  projectId: number,
  userId: number,
): Promise<boolean> {
  const { rows } = await query<{ id: number }>(
    `SELECT id FROM project WHERE id = $1 AND user_id = $2`,
    [projectId, userId],
  );
  return rows.length > 0;
}
