"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchTeamReports, type TeamReportEntry } from "@/lib/reports";
import { fetchSubTeams, type SubTeam } from "@/lib/sub-teams";

function formatDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return dayKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMetric(value: number, isFloat = false): string {
  if (!Number.isFinite(value)) return "0";
  if (isFloat) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

type ColumnTeam = {
  id: number;
  name: string;
};

type DayGroup = {
  dayKey: string;
  entriesByTeamId: Map<number, TeamReportEntry[]>;
  unassigned: TeamReportEntry[];
};

const METRIC_COLUMNS = [
  { key: "working_time", label: "WT", float: true },
  { key: "bid", label: "Bid", float: false },
  { key: "message", label: "Msg", float: false },
  { key: "call", label: "Call", float: false },
  { key: "offer", label: "Offer", float: false },
  { key: "accounts", label: "Acc", float: false },
] as const;

function MemberReportTable({ entries }: { entries: TeamReportEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-slate-400">No reports this day.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Member
            </th>
            {METRIC_COLUMNS.map((column) => (
              <th
                key={column.key}
                className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={`${entry.user_id}-${entry.date}`}
              className="border-b border-slate-100 last:border-b-0"
            >
              <td className="truncate px-3 py-2.5 font-medium text-slate-900">
                {entry.user_name || `User ${entry.user_id}`}
              </td>
              {METRIC_COLUMNS.map((column) => (
                <td
                  key={column.key}
                  className="px-2 py-2.5 text-center tabular-nums text-slate-700"
                >
                  {formatMetric(entry[column.key], column.float)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TeamReportPage() {
  const [teams, setTeams] = useState<SubTeam[]>([]);
  const [reports, setReports] = useState<TeamReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [nextTeams, nextReports] = await Promise.all([
        fetchSubTeams(),
        fetchTeamReports(),
      ]);
      setTeams(nextTeams);
      setReports(nextReports);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load team reports",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const columnTeams = useMemo<ColumnTeam[]>(() => {
    if (teams.length > 0) {
      return teams.slice(0, 2).map((team) => ({
        id: team.id,
        name: team.name,
      }));
    }

    const fromReports = new Map<number, string>();
    for (const entry of reports) {
      if (entry.sub_team_id != null && entry.sub_team_name) {
        fromReports.set(entry.sub_team_id, entry.sub_team_name);
      }
    }

    return [...fromReports.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, 2)
      .map(([id, name]) => ({ id, name }));
  }, [teams, reports]);

  const dayGroups = useMemo(() => {
    const groups = new Map<string, DayGroup>();

    for (const entry of reports) {
      let group = groups.get(entry.date);
      if (!group) {
        group = {
          dayKey: entry.date,
          entriesByTeamId: new Map(),
          unassigned: [],
        };
        groups.set(entry.date, group);
      }

      if (entry.sub_team_id != null) {
        const list = group.entriesByTeamId.get(entry.sub_team_id) ?? [];
        list.push(entry);
        group.entriesByTeamId.set(entry.sub_team_id, list);
      } else {
        group.unassigned.push(entry);
      }
    }

    for (const group of groups.values()) {
      for (const [teamId, list] of group.entriesByTeamId) {
        group.entriesByTeamId.set(
          teamId,
          [...list].sort((a, b) => a.user_name.localeCompare(b.user_name)),
        );
      }
      group.unassigned.sort((a, b) => a.user_name.localeCompare(b.user_name));
    }

    return [...groups.values()].sort((a, b) =>
      b.dayKey.localeCompare(a.dayKey),
    );
  }, [reports]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Team Report
        </h1>
        <p className="mt-1 text-slate-600">
          Daily reports grouped by day, with one column per sub team. Bid counts
          come from the bid table.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading team reports…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : dayGroups.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No reports yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {dayGroups.map((group) => (
            <section
              key={group.dayKey}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  {formatDayLabel(group.dayKey)}
                </h2>
              </div>

              <div className="grid gap-0 lg:grid-cols-2">
                {columnTeams.map((team, index) => {
                  const teamEntries =
                    group.entriesByTeamId.get(team.id) ?? [];

                  return (
                    <div
                      key={team.id}
                      className={`min-w-0 ${
                        index === 0 && columnTeams.length > 1
                          ? "border-b border-slate-200 lg:border-b-0 lg:border-r"
                          : ""
                      }`}
                    >
                      <div className="border-b border-slate-100 px-4 py-2.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {team.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {teamEntries.length} member
                          {teamEntries.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <MemberReportTable entries={teamEntries} />
                    </div>
                  );
                })}
              </div>

              {group.unassigned.length > 0 ? (
                <div className="border-t border-slate-200 px-4 py-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Unassigned
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-slate-100">
                    <MemberReportTable entries={group.unassigned} />
                  </div>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
