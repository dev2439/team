"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchUsers, updateUser, type ListedUser } from "@/lib/users";

function formatBalance(value: number | undefined): string {
  const amount = Number(value) || 0;
  if (Number.isInteger(amount)) return String(amount);
  return String(Math.round(amount * 1000) / 1000);
}

const ROLE_OPTIONS = ["Member", "SubBoss", "BigBoss"] as const;

const selectClass =
  "w-full min-w-[9rem] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60";

export default function UsersPage() {
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [subTeams, setSubTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const next = await fetchUsers();
      setUsers(next.users);
      setSubTeams(
        next.sub_teams.length > 0
          ? next.sub_teams
          : ["Sub Team 7-1", "Sub Team 7-2"],
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function onRoleChange(userId: number, role: ListedUser["role"]) {
    setSaveError(null);
    setSavingId(userId);
    try {
      const updated = await updateUser(userId, { role });
      setUsers((current) =>
        current.map((user) => (user.id === userId ? updated : user)),
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSavingId(null);
    }
  }

  async function onSubTeamChange(userId: number, subTeam: string) {
    setSaveError(null);
    setSavingId(userId);
    try {
      const updated = await updateUser(userId, {
        sub_team: subTeam === "" ? null : subTeam,
      });
      setUsers((current) =>
        current.map((user) => (user.id === userId ? updated : user)),
      );
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to update sub team",
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Users
        </h1>
        <p className="mt-1 text-slate-600">
          View and update team members, sub teams, and roles.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading users…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-slate-500">No users found.</p>
      ) : (
        <div className="space-y-3">
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    ID
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Name
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Email
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Sub Team
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Role
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-slate-200 last:border-b-0"
                  >
                    <td className="px-3 py-2.5 tabular-nums text-slate-600">
                      {user.id}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      {user.name}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{user.email}</td>
                    <td className="px-3 py-2">
                      <select
                        className={selectClass}
                        value={user.sub_team ?? ""}
                        disabled={savingId === user.id}
                        onChange={(event) =>
                          void onSubTeamChange(user.id, event.target.value)
                        }
                      >
                        <option value="">None</option>
                        {subTeams.map((team) => (
                          <option key={team} value={team}>
                            {team}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className={selectClass}
                        value={user.role}
                        disabled={savingId === user.id}
                        onChange={(event) =>
                          void onRoleChange(
                            user.id,
                            event.target.value as ListedUser["role"],
                          )
                        }
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-800">
                      {formatBalance(user.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
