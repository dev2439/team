"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BidDetailModal } from "@/components/BidDetailModal";
import { BidImageModal } from "@/components/BidImageModal";
import { fetchTeamBids, type TeamBid } from "@/lib/bids";
import { fetchSubTeams, type SubTeam } from "@/lib/sub-teams";

function dayKeyFromCreatedAt(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

type ColumnTeam = {
  id: number;
  name: string;
};

type DayGroup = {
  dayKey: string;
  bidsByTeamId: Map<number, TeamBid[]>;
  unassigned: TeamBid[];
};

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
        <li
          key={bid.id}
          className="flex items-center gap-3 px-4 py-3"
        >
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
  const [bids, setBids] = useState<TeamBid[]>([]);
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

  const loadData = useCallback(async () => {
    try {
      const [nextTeams, nextBids] = await Promise.all([
        fetchSubTeams(),
        fetchTeamBids(),
      ]);
      setTeams(nextTeams);
      setBids(nextBids);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team bids");
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

    const fromBids = new Map<number, string>();
    for (const bid of bids) {
      if (bid.sub_team_id != null && bid.sub_team_name) {
        fromBids.set(bid.sub_team_id, bid.sub_team_name);
      }
    }

    return [...fromBids.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, 2)
      .map(([id, name]) => ({ id, name }));
  }, [teams, bids]);

  const dayGroups = useMemo(() => {
    const groups = new Map<string, DayGroup>();

    for (const bid of bids) {
      const dayKey = dayKeyFromCreatedAt(bid.created_at);
      let group = groups.get(dayKey);
      if (!group) {
        group = {
          dayKey,
          bidsByTeamId: new Map(),
          unassigned: [],
        };
        groups.set(dayKey, group);
      }

      if (bid.sub_team_id != null) {
        const list = group.bidsByTeamId.get(bid.sub_team_id) ?? [];
        list.push(bid);
        group.bidsByTeamId.set(bid.sub_team_id, list);
      } else {
        group.unassigned.push(bid);
      }
    }

    return [...groups.values()].sort((a, b) =>
      b.dayKey.localeCompare(a.dayKey),
    );
  }, [bids]);

  function openProposal(bid: TeamBid) {
    const number = bids.findIndex((row) => row.id === bid.id) + 1;
    setSelectedBid({ bid, number: number > 0 ? number : 1 });
  }

  function openJob(bid: TeamBid, number: number) {
    const globalNumber = bids.findIndex((row) => row.id === bid.id) + 1;
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
          Bid URLs grouped by day, with one column per sub team.
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
                  const teamBids = group.bidsByTeamId.get(team.id) ?? [];

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
            </section>
          ))}
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
