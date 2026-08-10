import { query } from "./db.ts";
import type { SubTeam } from "./types/sub-team.ts";
import type { UserRole } from "./types/user.ts";

export type SubTeamMember = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  balance: number;
};

export type SubTeamWithMembers = SubTeam & {
  members: SubTeamMember[];
};

type SubTeamRow = {
  id: number;
  name: string;
  user_ids: number[] | null;
};

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  balance: number;
};

export async function listSubTeamsWithMembers(): Promise<SubTeamWithMembers[]> {
  const { rows: teams } = await query<SubTeamRow>(
    `SELECT id, name, user_ids
     FROM sub_team
     ORDER BY id ASC`,
  );

  const allUserIds = [
    ...new Set(teams.flatMap((team) => team.user_ids ?? [])),
  ];

  const usersById = new Map<number, SubTeamMember>();

  if (allUserIds.length > 0) {
    const { rows: users } = await query<UserRow>(
      `SELECT id, name, email, role, balance
       FROM users
       WHERE id = ANY($1::int[])`,
      [allUserIds],
    );

    for (const user of users) {
      usersById.set(user.id, {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        balance: Number(user.balance) || 0,
      });
    }
  }

  return teams.map((team) => {
    const userIds = team.user_ids ?? [];
    return {
      id: team.id,
      name: team.name,
      user_ids: userIds,
      members: userIds
        .map((id) => usersById.get(id))
        .filter((member): member is SubTeamMember => Boolean(member)),
    };
  });
}
