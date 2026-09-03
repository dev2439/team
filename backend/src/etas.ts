import { query } from "./db.ts";
import type { EtaEntry } from "./types/eta.ts";

type EtaRow = {
  id: number;
  project_id: number;
  user_id: number;
  amount: number;
  created_at: Date | string;
  project_name?: string;
  user_name?: string;
};

export type EtaCreateInput = {
  projectId: number;
  userId: number;
  amount: number;
};

function mapRow(row: EtaRow): EtaEntry {
  return {
    id: row.id,
    project_id: row.project_id,
    user_id: row.user_id,
    amount: Number(row.amount) || 0,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    project_name: row.project_name,
    user_name: row.user_name,
  };
}

export async function upsertEta(input: EtaCreateInput): Promise<EtaEntry> {
  const { rows } = await query<EtaRow>(
    `INSERT INTO eta (project_id, user_id, amount)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, project_id)
     DO UPDATE SET amount = EXCLUDED.amount
     RETURNING id, project_id, user_id, amount, created_at`,
    [input.projectId, input.userId, input.amount],
  );

  const saved = mapRow(rows[0]!);
  const { rows: named } = await query<EtaRow>(
    `SELECT e.id, e.project_id, e.user_id, e.amount, e.created_at,
            p.name AS project_name, u.name AS user_name
     FROM eta e
     JOIN project p ON p.id = e.project_id
     JOIN users u ON u.id = e.user_id
     WHERE e.id = $1`,
    [saved.id],
  );

  return named[0] ? mapRow(named[0]) : saved;
}

export async function listEtas(): Promise<EtaEntry[]> {
  const { rows } = await query<EtaRow>(
    `SELECT e.id, e.project_id, e.user_id, e.amount, e.created_at,
            p.name AS project_name, u.name AS user_name
     FROM eta e
     JOIN project p ON p.id = e.project_id
     JOIN users u ON u.id = e.user_id
     ORDER BY e.created_at DESC, e.id DESC`,
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
