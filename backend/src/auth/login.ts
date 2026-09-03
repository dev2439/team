import { query } from "../db.ts";
import type { User, UserRole } from "../types/user.ts";
import { hashPassword, verifyPassword } from "./password.ts";

export type PublicUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  balance: number;
  phone: string;
  job_title: string;
  location: string;
  bio: string;
  birthday: string | null;
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
  phone?: string | null;
  job_title?: string | null;
  location?: string | null;
  bio?: string | null;
  birthday?: Date | string | null;
};

type SubTeamRow = {
  id: number;
  name: string;
  user_ids: number[] | null;
};

const PROFILE_SELECT = `
  id, name, email, password, role, balance,
  phone, job_title, location, bio, birthday::text AS birthday
`;

function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    balance: Number(user.balance) || 0,
    phone: user.phone ?? "",
    job_title: user.job_title ?? "",
    location: user.location ?? "",
    bio: user.bio ?? "",
    birthday:
      user.birthday == null
        ? null
        : user.birthday instanceof Date
          ? user.birthday.toISOString().slice(0, 10)
          : String(user.birthday).slice(0, 10),
  };
}

export async function loginWithEmailPassword(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const normalizedEmail = email.trim().toLowerCase();

  const { rows } = await query<UserRow>(
    `SELECT ${PROFILE_SELECT}
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
    `SELECT ${PROFILE_SELECT}
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
    `SELECT ${PROFILE_SELECT}
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

function assertLength(value: string, label: string, max: number): string {
  if (value.length > max) {
    throw new Error(`${label} must be at most ${max} characters`);
  }
  return value;
}

function parseBirthday(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("birthday must be YYYY-MM-DD");
  }
  const [yearRaw, monthRaw, dayRaw] = trimmed.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("birthday must be a valid date");
  }
  return trimmed;
}

export async function updateProfile(input: {
  userId: number;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  location?: string;
  bio?: string;
  birthday?: string | null;
}): Promise<PublicUser> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("name is required");
  }
  assertLength(name, "name", 100);

  const email = input.email.trim().toLowerCase();
  if (!email) {
    throw new Error("email is required");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("email must be a valid email address");
  }
  assertLength(email, "email", 200);

  const existing = await getUserById(input.userId);
  if (!existing) {
    throw new Error("User not found");
  }

  const phone = assertLength(
    (input.phone !== undefined ? input.phone : existing.phone).trim(),
    "phone",
    40,
  );
  const jobTitle = assertLength(
    (input.jobTitle ?? "").trim(),
    "job_title",
    120,
  );
  const location = assertLength(
    (input.location !== undefined ? input.location : existing.location).trim(),
    "location",
    120,
  );
  const bio = assertLength((input.bio ?? "").trim(), "bio", 2000);
  const birthday = parseBirthday(input.birthday);

  const { rows: taken } = await query<{ id: number }>(
    `SELECT id FROM users
     WHERE lower(email) = $1
       AND id <> $2
     LIMIT 1`,
    [email, input.userId],
  );
  if (taken[0]) {
    throw new Error("email is already in use");
  }

  const { rows } = await query<UserRow>(
    `UPDATE users
     SET
       name = $2,
       email = $3,
       phone = $4,
       job_title = $5,
       location = $6,
       bio = $7,
       birthday = $8
     WHERE id = $1
     RETURNING ${PROFILE_SELECT}`,
    [input.userId, name, email, phone, jobTitle, location, bio, birthday],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("User not found");
  }
  return toPublicUser(row);
}

export type { User };
