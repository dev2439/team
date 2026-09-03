"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TestResultProposalModal } from "@/components/TestResultProposalModal";
import { fetchCurrentUser, type PublicUser } from "@/lib/auth";
import {
  fetchTestBidProposals,
  fetchTestBids,
  recordTestBidViewRequest,
  saveTestBidRatingRequest,
  setTestBidResultsVisibleRequest,
  toggleTestBidFavoriteRequest,
  type TestBid,
  type TestBidProposalResult,
} from "@/lib/test-bids";
import { startBackgroundPoll } from "@/lib/poll";

const TEST_RESULT_POLL_MS = 10_000;

function formatCreatedAt(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Elapsed time from bid_test.created_at until test_bid.created_at. */
function formatAfterBidTest(
  bidTestCreatedAt: string,
  proposalCreatedAt: string,
): string {
  const ms =
    new Date(proposalCreatedAt).getTime() -
    new Date(bidTestCreatedAt).getTime();
  if (!Number.isFinite(ms)) return "—";
  const mins = Math.max(0, Math.round(ms / 60_000));
  return mins === 1 ? "After 1 min" : `After ${mins} mins`;
}

function formatRankPlace(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}

function sortProposalsByRank(
  proposals: TestBidProposalResult[],
): TestBidProposalResult[] {
  return [...proposals].sort((a, b) => {
    if (b.ranking_score !== a.ranking_score) {
      return b.ranking_score - a.ranking_score;
    }
    const timeDiff =
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id - b.id;
  });
}

/** Higher total is better — matches default BigBoss table ranking. */
function sortProposalsByViewScore(
  proposals: TestBidProposalResult[],
): TestBidProposalResult[] {
  return sortProposalsByMetric(proposals, "total", "desc");
}

type BigBossSortKey =
  | "submitted"
  | "view_score"
  | "favorites"
  | "comment_score"
  | "total";

function submittedDelayMs(row: TestBidProposalResult): number {
  const ms =
    new Date(row.created_at).getTime() -
    new Date(row.parent_created_at).getTime();
  return Number.isFinite(ms) ? Math.max(0, ms) : Number.POSITIVE_INFINITY;
}

/**
 * ((9 - View Score) * 10/9 * 3.5 + Favorites * 10/9 * 4 + Comment Score * 2.5) / 10
 * Missing View Score is treated as 9 (no view contribution).
 * Comment Score is already on a 0–10 scale (avg of 1–10 star ratings).
 */
function computeTotalScore(row: TestBidProposalResult): number {
  const viewScore = row.view_score == null ? 9 : Number(row.view_score);
  const favorites = Math.max(0, Number(row.favorites_received) || 0);
  const commentScore = Number(row.ranking_score) || 0;
  return (
    ((9 - viewScore) * (10 / 9) * 3.5 +
      favorites * (10 / 9) * 4 +
      commentScore * 2.5) /
    10
  );
}

function sortProposalsByMetric(
  proposals: TestBidProposalResult[],
  key: BigBossSortKey,
  direction: "asc" | "desc",
): TestBidProposalResult[] {
  const dir = direction === "asc" ? 1 : -1;
  return [...proposals].sort((a, b) => {
    if (key === "submitted") {
      const aDelay = submittedDelayMs(a);
      const bDelay = submittedDelayMs(b);
      if (aDelay !== bDelay) return (aDelay - bDelay) * dir;
    } else if (key === "view_score") {
      const aView = a.view_score;
      const bView = b.view_score;
      if (aView == null && bView != null) return 1;
      if (aView != null && bView == null) return -1;
      if (aView != null && bView != null && aView !== bView) {
        return (aView - bView) * dir;
      }
    } else if (key === "favorites") {
      if (a.favorites_received !== b.favorites_received) {
        return (a.favorites_received - b.favorites_received) * dir;
      }
    } else if (key === "comment_score") {
      if (a.ranking_score !== b.ranking_score) {
        return (a.ranking_score - b.ranking_score) * dir;
      }
    } else if (key === "total") {
      const aTotal = computeTotalScore(a);
      const bTotal = computeTotalScore(b);
      if (aTotal !== bTotal) return (aTotal - bTotal) * dir;
    }

    // Stable tie-breakers (independent of active direction).
    if (key !== "total") {
      const aTotal = computeTotalScore(a);
      const bTotal = computeTotalScore(b);
      if (aTotal !== bTotal) return bTotal - aTotal;
    }
    if (key !== "submitted") {
      const aDelay = submittedDelayMs(a);
      const bDelay = submittedDelayMs(b);
      if (aDelay !== bDelay) return aDelay - bDelay;
    }
    if (key !== "view_score") {
      const aView = a.view_score;
      const bView = b.view_score;
      if (aView == null && bView != null) return 1;
      if (aView != null && bView == null) return -1;
      if (aView != null && bView != null && aView !== bView) {
        return aView - bView;
      }
    }
    if (key !== "favorites" && b.favorites_received !== a.favorites_received) {
      return b.favorites_received - a.favorites_received;
    }
    if (key !== "comment_score" && b.ranking_score !== a.ranking_score) {
      return b.ranking_score - a.ranking_score;
    }
    const timeDiff =
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id - b.id;
  });
}

function defaultSortDirection(key: BigBossSortKey): "asc" | "desc" {
  // Submitted / View Score: lower is better. Favorites / Comment Score / Total: higher is better.
  return key === "view_score" || key === "submitted" ? "asc" : "desc";
}

/** Sort by test_bid.created_at ascending (earliest first). */
function sortProposalsByCreatedAt(
  proposals: TestBidProposalResult[],
): TestBidProposalResult[] {
  return [...proposals].sort((a, b) => {
    const timeDiff =
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id - b.id;
  });
}

function formatProposalPreview(
  proposal: string,
  maxCharsPerLine = 64,
  maxLines = 4,
): string {
  const prefix = "Cover letter - ";
  const body = proposal.replace(/\s+/g, " ").trim();
  // Count Unicode code points so math-bold text like "𝐦𝐚𝐭𝐜𝐡𝐞𝐝" is 7, not 14.
  const chars = Array.from(`${prefix}${body}`);
  const lines: string[] = [];
  for (
    let i = 0;
    i < chars.length && lines.length < maxLines;
    i += maxCharsPerLine
  ) {
    lines.push(chars.slice(i, i + maxCharsPerLine).join(""));
  }
  const usedChars = Math.min(chars.length, maxLines * maxCharsPerLine);
  if (chars.length > usedChars && lines.length > 0) {
    const lastChars = Array.from(lines[lines.length - 1]!);
    lines[lines.length - 1] =
      lastChars.length <= maxCharsPerLine - 3
        ? `${lastChars.join("")}...`
        : `${lastChars.slice(0, maxCharsPerLine - 3).join("")}...`;
  }
  return lines.join("\n");
}

/** 1-based place by ranking_score (higher is better) within the group. */
function myProposalRankPlace(
  proposals: TestBidProposalResult[],
  userId: number | null,
): number | null {
  if (userId == null || proposals.length === 0) return null;
  const mine = proposals.find((row) => row.user_id === userId);
  if (!mine) return null;

  const ordered = sortProposalsByRank(proposals);
  const index = ordered.findIndex((row) => row.id === mine.id);
  return index >= 0 ? index + 1 : null;
}

function myProposalInGroup(
  proposals: TestBidProposalResult[],
  userId: number | null,
): TestBidProposalResult | null {
  if (userId == null) return null;
  return proposals.find((row) => row.user_id === userId) ?? null;
}

type JobGroup = {
  job: TestBid;
  proposals: TestBidProposalResult[];
};

function ProposalList({
  proposals,
  currentUserId,
  onViewProposal,
}: {
  proposals: TestBidProposalResult[];
  currentUserId: number | null;
  onViewProposal: (row: TestBidProposalResult) => void;
}) {
  if (proposals.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-slate-400">No proposals yet.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-3 p-4">
      {proposals.map((row, index) => {
        const isMine =
          currentUserId != null && row.user_id === currentUserId;
        return (
          <li
            key={row.id}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {isMine ? "My Proposal" : `Bidder ${index + 1}`}
                  </p>
                  <span
                    className="text-xs tabular-nums text-slate-500"
                    title={`Submitted ${formatCreatedAt(row.created_at)}`}
                  >
                    {formatAfterBidTest(
                      row.parent_created_at,
                      row.created_at,
                    )}
                  </span>
                  {row.view_order != null ? (
                    <span
                      className="rounded-md bg-slate-200 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                      title={`You opened this proposal ${formatRankPlace(row.view_order)} among your opens in this bid test`}
                    >
                      Viewed {formatRankPlace(row.view_order)}
                    </span>
                  ) : null}
                  {row.is_favorited ? (
                    <span
                      aria-label="Favorited"
                      className="text-sm text-rose-500"
                      title="Favorited"
                    >
                      ♥
                    </span>
                  ) : null}
                  {row.my_rating != null ? (
                    <span
                      className="text-xs font-medium text-amber-500"
                      title={`Your rating: ${row.my_rating}/10`}
                    >
                      {"★".repeat(row.my_rating)}
                    </span>
                  ) : null}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onViewProposal(row)}
                className="shrink-0 text-sm font-medium text-slate-700 underline-offset-2 transition hover:text-slate-900 hover:underline"
              >
                View more
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-slate-600 [overflow-wrap:anywhere]">
              {formatProposalPreview(row.proposal)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function BigBossGroupedList({
  groups,
  expandedOverrides,
  defaultExpandedId,
  onToggleExpanded,
  onToggleResultsVisible,
  togglingResultsId,
  onViewProposal,
}: {
  groups: JobGroup[];
  expandedOverrides: Record<number, boolean>;
  defaultExpandedId: number | null;
  onToggleExpanded: (jobId: number) => void;
  onToggleResultsVisible: (jobId: number, resultsVisible: boolean) => void;
  togglingResultsId: number | null;
  onViewProposal: (row: TestBidProposalResult) => void;
}) {
  const [sortByJob, setSortByJob] = useState<
    Record<number, { key: BigBossSortKey; direction: "asc" | "desc" }>
  >({});

  function isExpanded(jobId: number): boolean {
    if (Object.prototype.hasOwnProperty.call(expandedOverrides, jobId)) {
      return expandedOverrides[jobId]!;
    }
    return jobId === defaultExpandedId;
  }

  function getSort(jobId: number): {
    key: BigBossSortKey;
    direction: "asc" | "desc";
  } {
    return (
      sortByJob[jobId] ?? {
        key: "total",
        direction: defaultSortDirection("total"),
      }
    );
  }

  function handleSortClick(jobId: number, key: BigBossSortKey) {
    setSortByJob((current) => {
      const prev = current[jobId] ?? {
        key: "total",
        direction: defaultSortDirection("total"),
      };
      if (prev.key === key) {
        return {
          ...current,
          [jobId]: {
            key,
            direction: prev.direction === "asc" ? "desc" : "asc",
          },
        };
      }
      return {
        ...current,
        [jobId]: { key, direction: defaultSortDirection(key) },
      };
    });
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
        No results yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const expanded = isExpanded(group.job.id);
        const sort = getSort(group.job.id);
        const ranked = sortProposalsByMetric(
          group.proposals,
          sort.key,
          sort.direction,
        );
        const proposalCount = group.proposals.length;

        return (
          <section
            key={group.job.id}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >
            <div
              className={`flex w-full items-center gap-3 bg-slate-50 px-4 py-3 ${
                expanded ? "border-b border-slate-200" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => onToggleExpanded(group.job.id)}
                aria-expanded={expanded}
                className="min-w-0 flex-1 text-left transition hover:opacity-90"
              >
                <h2 className="truncate text-sm font-semibold text-sky-700">
                  {group.job.url}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  #{group.job.id} · {formatCreatedAt(group.job.created_at)} ·{" "}
                  {proposalCount} proposal
                  {proposalCount === 1 ? "" : "s"}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onToggleResultsVisible(
                      group.job.id,
                      !group.job.results_visible,
                    )
                  }
                  disabled={togglingResultsId === group.job.id}
                  title={
                    group.job.results_visible
                      ? "Hide proposals from Member and SubBoss"
                      : "Show proposals to Member and SubBoss"
                  }
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
                    group.job.results_visible
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {togglingResultsId === group.job.id
                    ? "Saving…"
                    : group.job.results_visible
                      ? "Results shown"
                      : "Show results"}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleExpanded(group.job.id)}
                  aria-expanded={expanded}
                  aria-label={expanded ? "Collapse" : "Expand"}
                  className="rounded-md p-1 text-slate-500 transition hover:bg-slate-200/70"
                >
                  <span
                    aria-hidden
                    className={`inline-block transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                  >
                    ▾
                  </span>
                </button>
              </div>
            </div>

            {expanded ? (
              <div className="overflow-x-auto">
                {ranked.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">
                    No proposals yet.
                  </p>
                ) : (
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-white">
                        <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Rank
                        </th>
                        <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Member
                        </th>
                        {(
                          [
                            ["submitted", "Submitted"],
                            ["view_score", "View Score"],
                            ["favorites", "Favorites"],
                            ["comment_score", "Comment Score"],
                            ["total", "Total"],
                          ] as const
                        ).map(([key, label]) => {
                          const active = sort.key === key;
                          const arrow = !active
                            ? ""
                            : sort.direction === "asc"
                              ? " ↑"
                              : " ↓";
                          return (
                            <th
                              key={key}
                              className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  handleSortClick(group.job.id, key)
                                }
                                aria-pressed={active}
                                title={
                                  active
                                    ? `Sorted ${sort.direction === "asc" ? "ascending" : "descending"} — click to reverse`
                                    : `Sort by ${label}`
                                }
                                className={`inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 transition hover:bg-slate-100 hover:text-slate-800 ${
                                  active ? "text-slate-900" : ""
                                }`}
                              >
                                {label}
                                <span className="tabular-nums">{arrow}</span>
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((row, index) => (
                        <tr
                          key={row.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => onViewProposal(row)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onViewProposal(row);
                            }
                          }}
                          className="cursor-pointer border-b border-slate-50 last:border-b-0 transition hover:bg-slate-50"
                        >
                          <td className="px-4 py-3 font-semibold tabular-nums text-slate-700">
                            {formatRankPlace(index + 1)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-900 underline-offset-2 group-hover:underline">
                              {row.user_name}
                            </span>
                          </td>
                          <td
                            className="px-4 py-3 tabular-nums text-slate-600"
                            title={`Submitted ${formatCreatedAt(row.created_at)}`}
                          >
                            {formatAfterBidTest(
                              group.job.created_at,
                              row.created_at,
                            )}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate-800">
                            {row.view_score == null
                              ? "—"
                              : Number(row.view_score).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate-800">
                            {row.favorites_received}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate-800">
                            {Number(row.ranking_score).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">
                            {computeTotalScore(row).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export default function TestResultPage() {
  const [jobs, setJobs] = useState<TestBid[]>([]);
  const [proposals, setProposals] = useState<TestBidProposalResult[]>([]);
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalParentId, setModalParentId] = useState<number | null>(null);
  const [modalIndex, setModalIndex] = useState(0);
  const [expandedOverrides, setExpandedOverrides] = useState<
    Record<number, boolean>
  >({});
  const [togglingResultsId, setTogglingResultsId] = useState<number | null>(
    null,
  );

  const isBigBoss = currentUser?.role === "BigBoss";
  const canRecordProposalView =
    currentUser?.role === "Member" ||
    currentUser?.role === "SubBoss" ||
    currentUser?.role === "Tester";
  const currentUserId = currentUser?.id ?? null;

  const jobGroups = useMemo(() => {
    const byParent = new Map<number, TestBidProposalResult[]>();
    for (const proposal of proposals) {
      const list = byParent.get(proposal.parent_id) ?? [];
      list.push(proposal);
      byParent.set(proposal.parent_id, list);
    }

    return jobs.map((job) => ({
      job,
      proposals: sortProposalsByCreatedAt(byParent.get(job.id) ?? []),
    })) satisfies JobGroup[];
  }, [jobs, proposals]);

  const modalProposals = useMemo(() => {
    if (modalParentId == null) return [];
    const group =
      jobGroups.find((item) => item.job.id === modalParentId)?.proposals ?? [];
    // BigBoss navigates in view-score order to match the ranking table.
    return isBigBoss ? sortProposalsByViewScore(group) : group;
  }, [jobGroups, modalParentId, isBigBoss]);

  const modalFavoriteCount = useMemo(
    () => modalProposals.filter((row) => row.is_favorited).length,
    [modalProposals],
  );

  const defaultExpandedId = jobGroups[0]?.job.id ?? null;

  function isExpanded(jobId: number): boolean {
    if (Object.prototype.hasOwnProperty.call(expandedOverrides, jobId)) {
      return expandedOverrides[jobId]!;
    }
    return jobId === defaultExpandedId;
  }

  function toggleExpanded(jobId: number) {
    setExpandedOverrides((current) => ({
      ...current,
      [jobId]: !isExpanded(jobId),
    }));
  }

  async function handleToggleResultsVisible(
    jobId: number,
    resultsVisible: boolean,
  ) {
    setTogglingResultsId(jobId);
    try {
      const updated = await setTestBidResultsVisibleRequest({
        testBidId: jobId,
        resultsVisible,
      });
      setJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? { ...job, results_visible: updated.results_visible }
            : job,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update results visibility",
      );
    } finally {
      setTogglingResultsId(null);
    }
  }

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      const [nextJobs, proposalPayload, user] = await Promise.all([
        fetchTestBids(),
        fetchTestBidProposals(),
        silent ? Promise.resolve(null) : fetchCurrentUser(),
      ]);
      setJobs(nextJobs);
      setProposals(proposalPayload.proposals);
      if (user) setCurrentUser(user);
      if (!silent) setError(null);
    } catch (err) {
      if (!silent) {
        setError(
          err instanceof Error ? err.message : "Failed to load test results",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    // Pause background refresh while the rating modal is open.
    if (modalParentId != null) return;

    return startBackgroundPoll(
      () => loadData({ silent: true }),
      TEST_RESULT_POLL_MS,
      { runImmediately: false },
    );
  }, [loadData, modalParentId]);

  useEffect(() => {
    if (modalParentId == null) return;
    if (modalProposals.length === 0) {
      setModalParentId(null);
      setModalIndex(0);
      return;
    }
    if (modalIndex >= modalProposals.length) {
      setModalIndex(modalProposals.length - 1);
    }
  }, [modalParentId, modalProposals, modalIndex]);

  async function openProposal(row: TestBidProposalResult) {
    let viewedAt = row.viewed_at;
    let viewOrder = row.view_order;
    const isOwnProposal =
      currentUserId != null && row.user_id === currentUserId;
    // Member / SubBoss (and Tester): persist View more time, except own proposal.
    if (canRecordProposalView && !isOwnProposal) {
      try {
        const result = await recordTestBidViewRequest(row.id);
        viewedAt = row.viewed_at ?? result.viewed_at;
        viewOrder = row.view_order ?? result.view_order;
      } catch {
        // Still open the modal if recording the view fails.
      }
    }

    if (
      !isOwnProposal &&
      ((viewedAt && viewedAt !== row.viewed_at) ||
        (viewOrder != null && viewOrder !== row.view_order))
    ) {
      setProposals((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                viewed_at: item.viewed_at ?? viewedAt,
                view_order: item.view_order ?? viewOrder,
              }
            : item,
        ),
      );
    }

    const groupRaw = proposals
      .filter((item) => item.parent_id === row.parent_id)
      .map((item) =>
        item.id === row.id && !isOwnProposal
          ? {
              ...item,
              viewed_at: item.viewed_at ?? viewedAt,
              view_order: item.view_order ?? viewOrder,
            }
          : item,
      );
    const ordered = isBigBoss
      ? sortProposalsByViewScore(groupRaw)
      : sortProposalsByCreatedAt(groupRaw);
    const index = ordered.findIndex((item) => item.id === row.id);
    setModalParentId(row.parent_id);
    setModalIndex(index >= 0 ? index : 0);
  }

  async function handleToggleFavorite(proposalId: number) {
    const result = await toggleTestBidFavoriteRequest(proposalId);
    setProposals((current) =>
      current.map((row) =>
        row.id === proposalId
          ? { ...row, is_favorited: result.favorited }
          : row,
      ),
    );
  }

  async function handleSaveRating(input: {
    proposalId: number;
    rating: number;
    comment: string;
  }) {
    const saved = await saveTestBidRatingRequest({
      testBidId: input.proposalId,
      rating: input.rating,
      comment: input.comment,
    });
    setProposals((current) =>
      current.map((row) =>
        row.id === input.proposalId
          ? {
              ...row,
              my_rating: saved.rating,
              my_rating_comment: saved.comment,
              avg_rating:
                row.avg_rating > 0
                  ? row.avg_rating
                  : saved.rating != null
                    ? saved.rating
                    : row.avg_rating,
            }
          : row,
      ),
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Test Result
        </h1>
        <p className="mt-1 text-slate-600">
          {isBigBoss
            ? "Grouped by bid test URL. Use Show results to publish the proposal list to Member and SubBoss. Click a member to open their proposal."
            : "Proposals grouped by each bid test URL. The proposal list appears after BigBoss publishes results."}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading test results…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : isBigBoss ? (
        <BigBossGroupedList
          groups={jobGroups}
          expandedOverrides={expandedOverrides}
          defaultExpandedId={defaultExpandedId}
          onToggleExpanded={toggleExpanded}
          onToggleResultsVisible={handleToggleResultsVisible}
          togglingResultsId={togglingResultsId}
          onViewProposal={openProposal}
        />
      ) : jobGroups.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No results yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {jobGroups.map((group) => {
            const expanded = isExpanded(group.job.id);
            const resultsVisible = Boolean(group.job.results_visible);
            const visibleProposals = resultsVisible
              ? group.proposals
              : [];
            const proposalCount = resultsVisible
              ? group.proposals.length
              : 0;
            const myRank = resultsVisible
              ? myProposalRankPlace(group.proposals, currentUserId)
              : null;
            const mine = myProposalInGroup(group.proposals, currentUserId);

            return (
              <section
                key={group.job.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(group.job.id)}
                  aria-expanded={expanded}
                  className={`flex w-full items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 ${
                    expanded ? "border-b border-slate-200" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-sky-700">
                      {group.job.url}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      #{group.job.id} · {formatCreatedAt(group.job.created_at)}{" "}
                      ·{" "}
                      {resultsVisible
                        ? `${proposalCount} proposal${proposalCount === 1 ? "" : "s"}`
                        : "Results not published"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-right sm:px-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        View Score
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-slate-900">
                        {mine?.view_score == null
                          ? "—"
                          : Number(mine.view_score).toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-right sm:px-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Favorites
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-slate-900">
                        {mine == null ? "—" : mine.favorites_received}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-right sm:px-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Comment
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-slate-900">
                        {myRank == null ? "—" : formatRankPlace(myRank)}
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className={`text-slate-500 transition-transform ${
                        expanded ? "rotate-180" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </div>
                </button>

                {expanded ? (
                  <div className="grid gap-0 lg:grid-cols-2">
                    <div className="min-w-0 border-b border-slate-200 lg:border-b-0 lg:border-r">
                      <div className="border-b border-slate-100 px-4 py-2.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Bid test
                        </h3>
                      </div>
                      <div className="flex flex-col gap-3 px-4 py-4">
                        <div className="min-w-0">
                          <a
                            href={group.job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block break-all text-sm font-medium text-sky-700 hover:underline"
                          >
                            {group.job.url}
                          </a>
                          <p className="mt-1 text-xs text-slate-500">
                            Created {formatCreatedAt(group.job.created_at)}
                          </p>
                        </div>
                        <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                          {group.job.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={group.job.image}
                              alt=""
                              className="block h-auto w-full"
                            />
                          ) : (
                            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                              No image
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="border-b border-slate-100 px-4 py-2.5">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Proposals
                        </h3>
                        {resultsVisible ? (
                          <p className="mt-0.5 text-xs text-slate-400">
                            {proposalCount} proposal
                            {proposalCount === 1 ? "" : "s"}
                            {" · "}
                            {
                              visibleProposals.filter((row) => row.is_favorited)
                                .length
                            }{" "}
                            favorited
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-slate-400">
                            Waiting for BigBoss to publish results
                          </p>
                        )}
                      </div>
                      {resultsVisible ? (
                        <ProposalList
                          proposals={visibleProposals}
                          currentUserId={currentUserId}
                          onViewProposal={openProposal}
                        />
                      ) : (
                        <p className="px-4 py-8 text-center text-sm text-slate-400">
                          Proposal list is hidden until BigBoss publishes
                          results for this bid test.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {modalParentId != null && modalProposals.length > 0 ? (
        <TestResultProposalModal
          proposals={modalProposals}
          index={modalIndex}
          favoriteCount={modalFavoriteCount}
          currentUserId={currentUserId}
          showBidderNames={isBigBoss}
          hideRating={isBigBoss}
          commentsOpenByDefault={isBigBoss}
          showCommentAuthors={isBigBoss}
          onIndexChange={setModalIndex}
          onToggleFavorite={handleToggleFavorite}
          onSaveRating={handleSaveRating}
          onClose={() => {
            setModalParentId(null);
            setModalIndex(0);
          }}
        />
      ) : null}
    </div>
  );
}
