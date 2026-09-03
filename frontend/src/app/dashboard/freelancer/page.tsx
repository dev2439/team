"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BidDetailModal } from "@/components/BidDetailModal";
import { BidImageModal } from "@/components/BidImageModal";
import { ImagePasteArea } from "@/components/ImagePasteArea";
import { LiveMarkdownEditor } from "@/components/LiveMarkdownEditor";
import { MemberBidCounts } from "@/components/MemberBidCounts";
import { fetchCurrentUser, type PublicUser } from "@/lib/auth";
import { countsFromBids, countsFromSummary } from "@/lib/bid-day-counts";
import {
  createFreelancerBidRequest,
  fetchFreelancerBidDays,
  fetchFreelancerBids,
  type Bid,
  type BidDay,
} from "@/lib/bids";
import { startBackgroundPoll } from "@/lib/poll";

const SUB_TEAM_BIDS_POLL_MS = 10_000;
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

function canViewBidProposal(user: PublicUser | null, bid: Bid): boolean {
  if (!user) return false;
  if (bid.user_id === user.id) return true;
  return user.role === "SubBoss";
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

export default function FreelancerPage() {
  const [url, setUrl] = useState("");
  const [proposal, setProposal] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [days, setDays] = useState<BidDay[]>([]);
  const [bidsByDate, setBidsByDate] = useState<Record<string, Bid[]>>({});
  const [dayLoading, setDayLoading] = useState<Record<string, boolean>>({});
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedBid, setSelectedBid] = useState<{
    bid: Bid;
    number: number;
  } | null>(null);
  const [jobBid, setJobBid] = useState<{
    bid: Bid;
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

  const loadDays = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      const rows = await fetchFreelancerBidDays();
      setDays(mergeDaysWithToday(rows, todayKey));
      if (!silent) setError(null);
    } catch (err) {
      setDays((current) =>
        current.length > 0 ? current : mergeDaysWithToday([], todayKey),
      );
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to load bids");
      }
    }
  }, [todayKey]);

  const loadDayBids = useCallback(
    async (dayKey: string, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setDayLoading((current) => ({ ...current, [dayKey]: true }));
      }
      try {
        const rows = await fetchFreelancerBids({ date: dayKey });
        setBidsByDate((current) => ({ ...current, [dayKey]: rows }));
        if (!silent) setError(null);
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : "Failed to load bids");
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
        await loadDays();
        if (cancelled) return;
        await loadDayBids(todayKey);
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
      SUB_TEAM_BIDS_POLL_MS,
      { runImmediately: false },
    );

    return () => {
      cancelled = true;
      stopPoll();
    };
  }, [loadDayBids, loadDays, todayKey]);

  useEffect(() => {
    void fetchCurrentUser().then(setCurrentUser);
  }, []);

  const bidGroups = useMemo(
    () =>
      days.map((day) => {
        const bids = bidsByDate[day.date] ?? [];
        const loaded = Object.prototype.hasOwnProperty.call(
          bidsByDate,
          day.date,
        );
        return {
          dayKey: day.date,
          label: formatDayLabel(day.date),
          count: loaded ? bids.length : day.count,
          memberCounts: loaded
            ? countsFromBids(bids)
            : countsFromSummary(day.members),
          bids,
          loaded,
          loadingDay: dayLoading[day.date] === true,
        };
      }),
    [bidsByDate, dayLoading, days],
  );

  const totalBidCount = useMemo(
    () => bidGroups.reduce((sum, group) => sum + group.count, 0),
    [bidGroups],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const bidUrl = url.trim();
    if (!bidUrl) {
      setError("URL is required");
      return;
    }

    if (!image) {
      setError("Paste a job image before saving");
      return;
    }

    setSubmitting(true);

    try {
      const bid = await createFreelancerBidRequest({
        url: bidUrl,
        proposal: proposal.trim(),
        image,
      });
      setBidsByDate((current) => ({
        ...current,
        [todayKey]: [bid, ...(current[todayKey] ?? [])],
      }));
      setDays((current) => {
        const next = mergeDaysWithToday(current, todayKey);
        return next.map((day) =>
          day.date === todayKey ? { ...day, count: day.count + 1 } : day,
        );
      });
      setUrl("");
      setProposal("");
      setImage(null);
      setSuccess("Bid saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bid");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-7xl flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Freelancer
        </h1>
        <p className="mt-1 text-slate-600">
          Create a proposal on the left. The right lists bid URLs from your sub
          team.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col">
          <form
            onSubmit={onSubmit}
            className="flex min-h-0 flex-1 flex-col gap-4"
          >
            <label className="flex shrink-0 flex-col gap-2 text-sm text-slate-700">
              <span className="font-medium">URL</span>
              <input
                type="url"
                name="url"
                required
                value={url}
                onChange={(e) => {
                  setSuccess(null);
                  setUrl(e.target.value);
                }}
                placeholder="https://…"
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            </label>

            <LiveMarkdownEditor
              value={proposal}
              onChange={setProposal}
              required
              placeholder={"# Proposal\n\nWrite in **Markdown**…"}
            />

            <ImagePasteArea value={image} onChange={setImage} />

            {error && (
              <p
                role="alert"
                className="shrink-0 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            {success && (
              <p className="shrink-0 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !image}
              className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Submit"}
            </button>
          </form>
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Sub team bids
            </h2>
            <span className="text-sm text-slate-500">
              {loading ? "Loading…" : `${totalBidCount} total`}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
            {loading && (
              <p className="px-4 py-6 text-sm text-slate-500">
                Loading sub team bids…
              </p>
            )}

            {!loading && bidGroups.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                No bids from your sub team yet.
              </p>
            )}

            {!loading && bidGroups.length > 0 && (
              <div className="divide-y divide-slate-200">
                {bidGroups.map((group) => {
                  const expanded = isDayExpanded(group.dayKey);

                  return (
                    <section key={group.dayKey}>
                      <button
                        type="button"
                        onClick={() => toggleDayExpanded(group.dayKey)}
                        aria-expanded={expanded}
                        className={`sticky top-0 z-10 flex w-full items-center justify-between gap-3 bg-slate-50 px-4 py-2.5 text-left transition hover:bg-slate-100 ${
                          expanded ? "border-b border-slate-200" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900">
                            {group.label}
                          </h3>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {group.count} bid
                            {group.count === 1 ? "" : "s"}
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
                        ) : group.bids.length === 0 ? (
                          <p className="px-4 py-6 text-sm text-slate-500">
                            No bids this day.
                          </p>
                        ) : (
                        <ul className="divide-y divide-slate-100">
                          {group.bids.map((bid, index) => {
                            const showProposal = canViewBidProposal(
                              currentUser,
                              bid,
                            );

                            return (
                              <li
                                key={bid.id}
                                className="flex items-center gap-3 px-4 py-3"
                              >
                                <span className="w-6 shrink-0 text-xs font-medium text-slate-400">
                                  {index + 1}
                                </span>
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
                                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                                      {bid.user_name}
                                    </span>
                                  ) : null}
                                </span>
                                <div className="flex shrink-0 items-center gap-3">
                                  {bid.image ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setJobBid({ bid, number: index + 1 })
                                      }
                                      className="text-sm font-medium text-sky-700 underline-offset-2 transition hover:text-sky-900 hover:underline"
                                    >
                                      Job
                                    </button>
                                  ) : null}
                                  {showProposal ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedBid({
                                          bid,
                                          number: index + 1,
                                        })
                                      }
                                      className="text-sm font-medium text-slate-700 underline-offset-2 transition hover:text-slate-900 hover:underline"
                                    >
                                      View Proposal
                                    </button>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        )
                      ) : null}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {selectedBid && (
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
      )}

      {jobBid && (
        <BidImageModal
          bid={jobBid.bid}
          onClose={() => setJobBid(null)}
          onShowProposal={
            canViewBidProposal(currentUser, jobBid.bid)
              ? () => {
                  setSelectedBid(jobBid);
                  setJobBid(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
