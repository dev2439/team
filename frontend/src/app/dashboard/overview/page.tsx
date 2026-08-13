"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART_GRID_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_WRAPPER_STYLE,
} from "@/lib/chartTheme";
import { fetchTeamReports, type TeamReportEntry } from "@/lib/reports";
import { fetchSubTeams, type SubTeam } from "@/lib/sub-teams";
import { fetchUsers, type ListedUser } from "@/lib/users";

const METRIC_SERIES = [
  { key: "bid", label: "Bid", color: "#0284c7" },
  { key: "message", label: "Message", color: "#059669" },
  { key: "call", label: "Call", color: "#d97706" },
  { key: "offer", label: "Offer", color: "#7c3aed" },
] as const;

type SubTeamCompetitionRow = {
  name: string;
  bid: number;
  message: number;
  call: number;
  offer: number;
};

type RankedMember = {
  id: number;
  name: string;
  value: number;
  subTeamName: string | null;
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentWeekDateKeys(): Set<string> {
  const now = new Date();
  const jsDay = now.getDay();
  const mondayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - mondayIndex);

  const keys = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    keys.add(formatLocalDate(date));
  }
  return keys;
}

function buildCompetitionData(
  teams: SubTeam[],
  reports: TeamReportEntry[],
): SubTeamCompetitionRow[] {
  const weekDates = getCurrentWeekDateKeys();
  const totals = new Map<
    number,
    { name: string; bid: number; message: number; call: number; offer: number }
  >();

  const columnTeams =
    teams.length > 0
      ? teams.slice(0, 2)
      : (() => {
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
        })();

  for (const team of columnTeams) {
    totals.set(team.id, {
      name: team.name,
      bid: 0,
      message: 0,
      call: 0,
      offer: 0,
    });
  }

  for (const entry of reports) {
    if (!weekDates.has(entry.date)) continue;
    if (entry.sub_team_id == null) continue;

    const bucket = totals.get(entry.sub_team_id);
    if (!bucket) continue;

    bucket.bid += entry.bid || 0;
    bucket.message += entry.message || 0;
    bucket.call += entry.call || 0;
    bucket.offer += entry.offer || 0;
  }

  return columnTeams.map((team) => {
    const row = totals.get(team.id)!;
    return {
      name: row.name,
      bid: row.bid,
      message: row.message,
      call: row.call,
      offer: row.offer,
    };
  });
}

function buildMemberStats(
  teams: SubTeam[],
  reports: TeamReportEntry[],
  users: ListedUser[],
): {
  topBids: RankedMember[];
  lowBids: RankedMember[];
  maxBalance: RankedMember[];
  minBalances: RankedMember[];
} {
  const weekDates = getCurrentWeekDateKeys();
  const teamNameByUserId = new Map<number, string>();
  const bidMembers = new Map<number, { id: number; name: string }>();

  for (const team of teams) {
    for (const member of team.members) {
      teamNameByUserId.set(member.id, team.name);
      bidMembers.set(member.id, { id: member.id, name: member.name });
    }
  }

  const bidTotals = new Map<number, number>();
  for (const entry of reports) {
    if (!weekDates.has(entry.date)) continue;
    bidTotals.set(
      entry.user_id,
      (bidTotals.get(entry.user_id) ?? 0) + (entry.bid || 0),
    );
    if (!bidMembers.has(entry.user_id)) {
      bidMembers.set(entry.user_id, {
        id: entry.user_id,
        name: entry.user_name || `User ${entry.user_id}`,
      });
    }
    if (entry.sub_team_name && !teamNameByUserId.has(entry.user_id)) {
      teamNameByUserId.set(entry.user_id, entry.sub_team_name);
    }
  }

  const bidRanked: RankedMember[] = [...bidMembers.values()]
    .map((member) => ({
      id: member.id,
      name: member.name,
      value: bidTotals.get(member.id) ?? 0,
      subTeamName: teamNameByUserId.get(member.id) ?? null,
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  const balanceRanked: RankedMember[] = users
    .map((user) => ({
      id: user.id,
      name: user.name,
      value: Number(user.balance) || 0,
      subTeamName: user.sub_team ?? teamNameByUserId.get(user.id) ?? null,
    }))
    .sort((a, b) => a.value - b.value || a.name.localeCompare(b.name));

  return {
    topBids: bidRanked.slice(0, 2),
    lowBids: [...bidRanked].sort((a, b) => a.value - b.value || a.name.localeCompare(b.name)).slice(0, 2),
    maxBalance: [...balanceRanked]
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
      .slice(0, 1),
    minBalances: balanceRanked.slice(0, 3),
  };
}

function formatBalance(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function RankList({
  title,
  items,
  emptyLabel,
  formatValue,
  accentClass,
}: {
  title: string;
  items: RankedMember[];
  emptyLabel: string;
  formatValue: (value: number) => string;
  accentClass: string;
}) {
  return (
    <div className="min-w-0 shrink-0">
      <h3 className="mb-1.5 text-sm font-semibold text-slate-800">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, index) => (
            <li
              key={`${title}-${item.id}`}
              className="grid grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1fr)_4.5rem] items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2"
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white ${accentClass}`}
              >
                {index + 1}
              </span>
              <span className="truncate text-sm font-medium text-slate-900">
                {item.name}
              </span>
              <span className="truncate text-sm text-slate-600">
                {item.subTeamName ?? "—"}
              </span>
              <span className="text-right text-sm font-semibold tabular-nums text-slate-900">
                {formatValue(item.value)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="shrink-0 border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        {children}
      </div>
    </section>
  );
}

export default function OverviewPage() {
  const [teams, setTeams] = useState<SubTeam[]>([]);
  const [reports, setReports] = useState<TeamReportEntry[]>([]);
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [nextTeams, nextReports, usersResponse] = await Promise.all([
        fetchSubTeams(),
        fetchTeamReports(),
        fetchUsers(),
      ]);
      setTeams(nextTeams);
      setReports(nextReports);
      setUsers(usersResponse.users);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const competitionData = useMemo(
    () => buildCompetitionData(teams, reports),
    [teams, reports],
  );

  const memberStats = useMemo(
    () => buildMemberStats(teams, reports, users),
    [teams, reports, users],
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-7xl flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Overview
        </h1>
        <p className="mt-1 text-slate-600">
          Team snapshot — sub team competition uses this week&apos;s report and
          bid counts.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-4 gap-3 overflow-hidden sm:grid-cols-2 sm:grid-rows-2">
        <Panel
          title="Sub team competition"
          subtitle="This week totals — Bid, Message, Call, Offer"
        >
          {loading ? (
            <p className="flex flex-1 items-center justify-center text-sm text-slate-500">
              Loading chart…
            </p>
          ) : error ? (
            <p className="flex flex-1 items-center justify-center text-sm text-red-600">
              {error}
            </p>
          ) : competitionData.length === 0 ? (
            <p className="flex flex-1 items-center justify-center text-sm text-slate-500">
              No sub team data yet.
            </p>
          ) : (
            <div className="min-h-0 w-full flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={competitionData}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 13 }} width={36} />
                  <Tooltip
                    wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                    contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  {METRIC_SERIES.map((series) => (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      name={series.label}
                      fill={series.color}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Member highlights"
          subtitle="This week bid leaders/laggards and balance extremes"
        >
          {loading ? (
            <p className="flex flex-1 items-center justify-center text-sm text-slate-500">
              Loading…
            </p>
          ) : error ? (
            <p className="flex flex-1 items-center justify-center text-sm text-red-600">
              {error}
            </p>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-hidden">
              <div className="flex min-h-0 min-w-0 flex-col justify-start gap-3 overflow-hidden border-r border-slate-200 pr-4">
                <RankList
                  title="Top 2 bids"
                  items={memberStats.topBids}
                  emptyLabel="No members"
                  formatValue={(value) => String(value)}
                  accentClass="bg-sky-600"
                />
                <RankList
                  title="Lowest 2 bids"
                  items={memberStats.lowBids}
                  emptyLabel="No members"
                  formatValue={(value) => String(value)}
                  accentClass="bg-slate-500"
                />
              </div>
              <div className="flex min-h-0 min-w-0 flex-col justify-start gap-3 overflow-hidden">
                <RankList
                  title="Max balance"
                  items={memberStats.maxBalance}
                  emptyLabel="No members"
                  formatValue={formatBalance}
                  accentClass="bg-emerald-600"
                />
                <RankList
                  title="Lowest 3 balances"
                  items={memberStats.minBalances}
                  emptyLabel="No members"
                  formatValue={formatBalance}
                  accentClass="bg-amber-600"
                />
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Panel 3" subtitle="Coming soon">
          <p className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Placeholder
          </p>
        </Panel>

        <Panel title="Panel 4" subtitle="Coming soon">
          <p className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Placeholder
          </p>
        </Panel>
      </div>
    </div>
  );
}
