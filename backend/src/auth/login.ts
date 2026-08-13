import { query } from "../db.ts";
import type { User, UserRole } from "../types/user.ts";
import { hashPassword, verifyPassword } from "./password.ts";

export type PublicUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  balance: number;
};

export type ListedUser = PublicUser & {
  sub_team: string | null;
};

type UserRow = {
  id: number;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  balance: number;
};

type SubTeamRow = {
  id: number;
  name: string;
  user_ids: number[] | null;
};

function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    balance: Number(user.balance) || 0,
  };
}

export async function loginWithEmailPassword(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const normalizedEmail = email.trim().toLowerCase();

  const { rows } = await query<UserRow>(
    `SELECT id, name, email, password, role, balance
     FROM users
     WHERE lower(email) = $1
     LIMIT 1`,
    [normalizedEmail],
  );

  const user = rows[0];
  if (!user) return null;

  const valid = await verifyPassword(password, user.password);
  if (!valid) return null;

  return toPublicUser(user);
}

export async function getUserById(id: number): Promise<PublicUser | null> {
  const { rows } = await query<UserRow>(
    `SELECT id, name, email, password, role, balance
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id],
  );

  const user = rows[0];
  return user ? toPublicUser(user) : null;
}

export async function changePassword(input: {
  userId: number;
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const currentPassword = input.currentPassword;
  const newPassword = input.newPassword;

  if (!currentPassword || !newPassword) {
    return { ok: false, error: "Current and new password are required" };
  }

  if (newPassword.length < 3) {
    return { ok: false, error: "New password must be at least 3 characters" };
  }

  if (currentPassword === newPassword) {
    return {
      ok: false,
      error: "New password must be different from the current password",
    };
  }

  const { rows } = await query<UserRow>(
    `SELECT id, name, email, password, role, balance
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [input.userId],
  );

  const user = rows[0];
  if (!user) {
    return { ok: false, error: "User not found" };
  }

  const valid = await verifyPassword(currentPassword, user.password);
  if (!valid) {
    return { ok: false, error: "Current password is incorrect" };
  }

  const hashed = await hashPassword(newPassword);
  await query(`UPDATE users SET password = $1 WHERE id = $2`, [
    hashed,
    input.userId,
  ]);

  return { ok: true };
}

export async function listUsers(): Promise<ListedUser[]> {
  const [{ rows: users }, { rows: teams }] = await Promise.all([
    query<UserRow>(
      `SELECT id, name, email, password, role, balance
       FROM users
       ORDER BY id ASC`,
    ),
    query<SubTeamRow>(
      `SELECT id, name, user_ids
       FROM sub_team
       ORDER BY id ASC`,
    ),
  ]);

  const teamByUserId = new Map<number, string>();
  for (const team of teams) {
    for (const userId of team.user_ids ?? []) {
      if (!teamByUserId.has(userId)) {
        teamByUserId.set(userId, team.name);
      }
    }
  }

  return users.map((user) => ({
    ...toPublicUser(user),
    sub_team: teamByUserId.get(user.id) ?? null,
  }));
}

export async function listSubTeamNames(): Promise<string[]> {
  const { rows } = await query<{ name: string }>(
    `SELECT name FROM sub_team ORDER BY id ASC`,
  );
  return rows.map((row) => row.name);
}

export async function updateListedUser(input: {
  userId: number;
  role?: UserRole;
  subTeam?: string | null;
}): Promise<ListedUser | null> {
  const existing = await getUserById(input.userId);
  if (!existing) return null;

  if (input.role !== undefined) {
    await query(`UPDATE users SET role = $1::user_role WHERE id = $2`, [
      input.role,
      input.userId,
    ]);
  }

  if (input.subTeam !== undefined) {
    // Remove this user from every sub_team.user_ids array first.
    await query(
      `UPDATE sub_team
       SET user_ids = array_remove(COALESCE(user_ids, '{}'::integer[]), $1::integer)`,
      [input.userId],
    );

    // Then add them to the newly selected sub team (if any).
    if (input.subTeam) {
      const { rows } = await query<{ id: number }>(
        `SELECT id FROM sub_team WHERE name = $1 LIMIT 1`,
        [input.subTeam],
      );
      if (!rows[0]) {
        throw new Error("Sub team not found");
      }

      await query(
        `UPDATE sub_team
         SET user_ids = COALESCE(user_ids, '{}'::integer[]) || $1::integer
         WHERE name = $2
           AND NOT ($1::integer = ANY(COALESCE(user_ids, '{}'::integer[])))`,
        [input.userId, input.subTeam],
      );
    }
  }

  const users = await listUsers();
  return users.find((user) => user.id === input.userId) ?? null;
}

export type { User };
