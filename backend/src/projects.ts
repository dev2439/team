import { query } from "./db.ts";
import type { Project } from "./types/project.ts";

type ProjectRow = {
  id: number;
  user_id: number;
  name: string;
  created_at: Date | string;
};

export type ProjectCreateInput = {
  userId: number;
  name: string;
};

function mapRow(row: ProjectRow): Project {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

export async function createProject(
  input: ProjectCreateInput,
): Promise<Project> {
  const { rows } = await query<ProjectRow>(
    `INSERT INTO project (user_id, name)
     VALUES ($1, $2)
     RETURNING id, user_id, name, created_at`,
    [input.userId, input.name],
  );
  return mapRow(rows[0]!);
}

export async function listProjects(): Promise<Project[]> {
  const { rows } = await query<ProjectRow>(
    `SELECT id, user_id, name, created_at
     FROM project
     ORDER BY created_at DESC, id DESC`,
  );
  return rows.map(mapRow);
}

export async function listProjectsForUser(userId: number): Promise<Project[]> {
  const { rows } = await query<ProjectRow>(
    `SELECT id, user_id, name, created_at
     FROM project
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return rows.map(mapRow);
}

export async function deleteProjectForUser(
  projectId: number,
  userId: number,
): Promise<boolean> {
  const { rows } = await query<{ id: number }>(
    `DELETE FROM project
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [projectId, userId],
  );
  return rows.length > 0;
}
