"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BidDetailModal } from "@/components/BidDetailModal";
import { BidImageModal } from "@/components/BidImageModal";
import {
  fetchTeamBidDays,
  fetchTeamBids,
  type BidDay,
  type BidDayMemberCount,
  type TeamBid,
} from "@/lib/bids";
import { fetchSubTeams, type SubTeam, type SubTeamMember } from "@/lib/sub-teams";
import { startBackgroundPoll } from "@/lib/poll";

const TEAM_BIDS_POLL_MS = 10_000;
const EST_TIMEZONE = "America/New_York";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function todayDayKey(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EST_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return `${num("year")}-${pad2(num("month"))}-${pad2(num("day"))}`;
}

function formatDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return dayKey;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toLocaleDateString(
    "en-US",
    {
      timeZone: "UTC",
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    },
  );
}

function mergeDaysWithToday(days: BidDay[], today: string): BidDay[] {
  if (days.some((day) => day.date === today)) return days;
  return [{ date: today, count: 0 }, ...days].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
}

function expandedDayKeys(
  days: BidDay[],
  overrides: Record<string, boolean>,
  today: string,
): string[] {
  return days
    .map((day) => day.date)
    .filter((dayKey) => {
      if (Object.prototype.hasOwnProperty.call(overrides, dayKey)) {
        return overrides[dayKey] === true;
      }
      return dayKey === today;
    });
}

type ColumnTeam = {
  id: number;
  name: string;
  members: SubTeamMember[];
};

type MemberCount = {
  id: number;
  name: string;
  count: number;
};

function sortMemberCounts(rows: MemberCount[]): MemberCount[] {
  return [...rows].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}

function countsFromBids(bids: TeamBid[]): MemberCount[] {
  const map = new Map<number, MemberCount>();
  for (const bid of bids) {
    const existing = map.get(bid.user_id);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(bid.user_id, {
        id: bid.user_id,
        name: bid.user_name || "Unknown",
        count: 1,
      });
    }
  }
  return sortMemberCounts([...map.values()]);
}

function countsFromSummary(members: BidDayMemberCount[] | undefined): MemberCount[] {
  return sortMemberCounts(
    (members ?? []).map((row) => ({
      id: row.user_id,
      name: row.user_name,
      count: row.count,
    })),
  );
}

function rosterCounts(
  members: SubTeamMember[] | undefined,
  bids: TeamBid[],
): MemberCount[] {
  const fromBids = new Map(
    countsFromBids(bids).map((row) => [row.id, row] as const),
  );
  const rows: MemberCount[] = [];
  for (const member of members ?? []) {
    rows.push({
      id: member.id,
      name: member.name,
      count: fromBids.get(member.id)?.count ?? 0,
    });
    fromBids.delete(member.id);
  }
  rows.push(...fromBids.values());
  return sortMemberCounts(rows);
}

function MemberBidCounts({ members }: { members: MemberCount[] }) {
  if (members.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {members.map((member) => (
        <li
          key={member.id}
          className={`text-xs ${
            member.count === 0 ? "text-slate-400" : "text-slate-600"
          }`}
        >
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {member.name}
          </span>{" "}
          {member.count}
        </li>
      ))}
    </ul>
  );
}

type DayGroup = {
  dayKey: string;
  bidsByTeamId: Map<number, TeamBid[]>;
  unassigned: TeamBid[];
};

function groupDayBids(dayKey: string, bids: TeamBid[]): DayGroup {
  const group: DayGroup = {
    dayKey,
    bidsByTeamId: new Map(),
    unassigned: [],
  };

  for (const bid of bids) {
    if (bid.sub_team_id != null) {
      const list = group.bidsByTeamId.get(bid.sub_team_id) ?? [];
      list.push(bid);
      group.bidsByTeamId.set(bid.sub_team_id, list);
    } else {
      group.unassigned.push(bid);
    }
  }

  return group;
}

function BidUrlList({
  bids,
  onViewProposal,
  onViewJob,
}: {
  bids: TeamBid[];
  onViewProposal: (bid: TeamBid) => void;
  onViewJob: (bid: TeamBid, number: number) => void;
}) {
  if (bids.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-slate-400">No bids this day.</p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {bids.map((bid, index) => (
        <li key={bid.id} className="flex items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1">
            <a
              href={bid.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium text-sky-700 hover:underline"
            >
              {bid.url}
            </a>
            {bid.user_name ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {bid.user_name}
              </p>
            ) : null}
          </span>
          <div className="flex shrink-0 items-center gap-3">
            {bid.image ? (
              <button
                type="button"
                onClick={() => onViewJob(bid, index + 1)}
                className="text-sm font-medium text-sky-700 underline-offset-2 transition hover:text-sky-900 hover:underline"
              >
                Job
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onViewProposal(bid)}
              className="text-sm font-medium text-slate-700 underline-offset-2 transition hover:text-slate-900 hover:underline"
            >
              View Proposal
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function TeamBidPage() {
  const [teams, setTeams] = useState<SubTeam[]>([]);
  const [days, setDays] = useState<BidDay[]>([]);
  const [bidsByDate, setBidsByDate] = useState<Record<string, TeamBid[]>>({});
  const [dayLoading, setDayLoading] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBid, setSelectedBid] = useState<{
    bid: TeamBid;
    number: number;
  } | null>(null);
  const [jobBid, setJobBid] = useState<{
    bid: TeamBid;
    number: number;
  } | null>(null);
  const [dayExpandedOverrides, setDayExpandedOverrides] = useState<
    Record<string, boolean>
  >({});

  const todayKey = useMemo(() => todayDayKey(), []);
  const expandedKeysRef = useRef<string[]>([todayKey]);

  function isDayExpanded(dayKey: string): boolean {
    if (Object.prototype.hasOwnProperty.call(dayExpandedOverrides, dayKey)) {
      return dayExpandedOverrides[dayKey]!;
    }
    return dayKey === todayKey;
  }

  const loadDays = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      try {
        const rows = await fetchTeamBidDays();
        setDays(mergeDaysWithToday(rows, todayKey));
        if (!silent) setError(null);
      } catch (err) {
        setDays((current) =>
          current.length > 0 ? current : mergeDaysWithToday([], todayKey),
        );
        if (!silent) {
          setError(
            err instanceof Error ? err.message : "Failed to load team bids",
          );
        }
      }
    },
    [todayKey],
  );

  const loadDayBids = useCallback(
    async (dayKey: string, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setDayLoading((current) => ({ ...current, [dayKey]: true }));
      }
      try {
        const rows = await fetchTeamBids({ date: dayKey });
        setBidsByDate((current) => ({ ...current, [dayKey]: rows }));
        if (!silent) setError(null);
      } catch (err) {
        if (!silent) {
          setError(
            err instanceof Error ? err.message : "Failed to load team bids",
          );
        }
      } finally {
        if (!silent) {
          setDayLoading((current) => ({ ...current, [dayKey]: false }));
        }
      }
    },
    [],
  );

  function toggleDayExpanded(dayKey: string) {
    const nextExpanded = !isDayExpanded(dayKey);
    setDayExpandedOverrides((current) => ({
      ...current,
      [dayKey]: nextExpanded,
    }));
    if (nextExpanded) {
      void loadDayBids(dayKey);
    }
  }

  useEffect(() => {
    expandedKeysRef.current = expandedDayKeys(
      days,
      dayExpandedOverrides,
      todayKey,
    );
  }, [days, dayExpandedOverrides, todayKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [nextTeams] = await Promise.all([fetchSubTeams(), loadDays()]);
        if (cancelled) return;
        setTeams(nextTeams);
        await loadDayBids(todayKey);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load team bids",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const stopPoll = startBackgroundPoll(
      async () => {
        await loadDays({ silent: true });
        await Promise.all(
          expandedKeysRef.current.map((dayKey) =>
            loadDayBids(dayKey, { silent: true }),
          ),
        );
      },
      TEAM_BIDS_POLL_MS,
      { runImmediately: false },
    );

    return () => {
      cancelled = true;
      stopPoll();
    };
  }, [loadDayBids, loadDays, todayKey]);

  const columnTeams = useMemo<ColumnTeam[]>(() => {
    if (teams.length > 0) {
      return teams.slice(0, 2).map((team) => ({
        id: team.id,
        name: team.name,
        members: team.members,
      }));
    }

    const fromBids = new Map<number, string>();
    for (const bids of Object.values(bidsByDate)) {
      for (const bid of bids) {
        if (bid.sub_team_id != null && bid.sub_team_name) {
          fromBids.set(bid.sub_team_id, bid.sub_team_name);
        }
      }
    }

    return [...fromBids.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, 2)
      .map(([id, name]) => ({ id, name, members: [] }));
  }, [teams, bidsByDate]);

  const dayGroups = useMemo(
    () =>
      days.map((day) => {
        const bids = bidsByDate[day.date] ?? [];
        const group = groupDayBids(day.date, bids);
        const loaded = Object.prototype.hasOwnProperty.call(
          bidsByDate,
          day.date,
        );
        return {
          ...group,
          label: formatDayLabel(day.date),
          count: loaded ? bids.length : day.count,
          memberCounts: loaded
            ? countsFromBids(bids)
            : countsFromSummary(day.members),
          loaded,
          loadingDay: dayLoading[day.date] === true,
        };
      }),
    [bidsByDate, dayLoading, days],
  );

  function openProposal(bid: TeamBid) {
    const fromLoaded = Object.values(bidsByDate).flat();
    const number = fromLoaded.findIndex((row) => row.id === bid.id) + 1;
    setSelectedBid({ bid, number: number > 0 ? number : 1 });
  }

  function openJob(bid: TeamBid, number: number) {
    const fromLoaded = Object.values(bidsByDate).flat();
    const globalNumber = fromLoaded.findIndex((row) => row.id === bid.id) + 1;
    setJobBid({
      bid,
      number: globalNumber > 0 ? globalNumber : number,
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Team Bid
        </h1>
        <p className="mt-1 text-slate-600">
          Bid URLs grouped by day, with one column per sub team. Each day
          shows how many bids every member submitted.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading team bids…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : dayGroups.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No bids yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {dayGroups.map((group) => {
            const expanded = isDayExpanded(group.dayKey);

            return (
              <section
                key={group.dayKey}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggleDayExpanded(group.dayKey)}
                  aria-expanded={expanded}
                  className={`flex w-full items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 ${
                    expanded ? "border-b border-slate-200" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-slate-900">
                      {group.label}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {group.count} bid{group.count === 1 ? "" : "s"}
                    </p>
                    {group.memberCounts.length > 0 ? (
                      <div className="mt-2">
                        <MemberBidCounts members={group.memberCounts} />
                      </div>
                    ) : null}
                  </div>
                  <span
                    aria-hidden
                    className={`shrink-0 text-slate-500 transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                  >
                    ▾
                  </span>
                </button>

                {expanded ? (
                  group.loadingDay && !group.loaded ? (
                    <p className="px-4 py-6 text-sm text-slate-500">
                      Loading bids…
                    </p>
                  ) : (
                    <>
                      <div className="grid gap-0 lg:grid-cols-2">
                        {columnTeams.map((team, index) => {
                          const teamBids =
                            group.bidsByTeamId.get(team.id) ?? [];

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
                                  {teamBids.length} bid
                                  {teamBids.length === 1 ? "" : "s"}
                                </p>
                                <div className="mt-2">
                                  <MemberBidCounts
                                    members={rosterCounts(
                                      team.members,
                                      teamBids,
                                    )}
                                  />
                                </div>
                              </div>
                              <BidUrlList
                                bids={teamBids}
                                onViewProposal={openProposal}
                                onViewJob={openJob}
                              />
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
                            <BidUrlList
                              bids={group.unassigned}
                              onViewProposal={openProposal}
                              onViewJob={openJob}
                            />
                          </div>
                        </div>
                      ) : null}
                    </>
                  )
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {selectedBid ? (
        <BidDetailModal
          bid={selectedBid.bid}
          number={selectedBid.number}
          onClose={() => setSelectedBid(null)}
          onShowImage={
            selectedBid.bid.image
              ? () => {
                  setJobBid(selectedBid);
                  setSelectedBid(null);
                }
              : undefined
          }
        />
      ) : null}

      {jobBid ? (
        <BidImageModal
          bid={jobBid.bid}
          onClose={() => setJobBid(null)}
          onShowProposal={() => {
            setSelectedBid(jobBid);
            setJobBid(null);
          }}
        />
      ) : null}
    </div>
  );
}
