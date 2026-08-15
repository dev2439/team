import { getApiBase, getToken } from "@/lib/auth";

export type SubTeamMember = {
  id: number;
  name: string;
  email: string;
  role: "Member" | "SubBoss" | "BigBoss" | "Tester";
  balance: number;
};

export type SubTeam = {
  id: number;
  name: string;
  user_ids: number[];
  members: SubTeamMember[];
};

type SubTeamsResponse = {
  sub_teams: SubTeam[];
};

type ErrorResponse = {
  error: string;
};

export async function fetchSubTeams(): Promise<SubTeam[]> {
  const token = getToken();
  if (!token) {
    throw new Error("Not signed in");
  }

  const res = await fetch(`${getApiBase()}/api/sub-teams`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = (await res.json()) as SubTeamsResponse | ErrorResponse;

  if (!res.ok) {
    throw new Error(
      data && typeof data === "object" && "error" in data
        ? data.error
        : "Failed to load sub teams",
    );
  }

  if (!("sub_teams" in data)) {
    throw new Error("Unexpected sub teams response");
  }

  return data.sub_teams;
}
