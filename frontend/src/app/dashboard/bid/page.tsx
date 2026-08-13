"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BidDetailModal } from "@/components/BidDetailModal";
import { BidImageModal } from "@/components/BidImageModal";
import { ImagePasteArea } from "@/components/ImagePasteArea";
import { LiveMarkdownEditor } from "@/components/LiveMarkdownEditor";
import { fetchCurrentUser, type PublicUser } from "@/lib/auth";
import { createBidRequest, fetchBids, type Bid } from "@/lib/bids";

const SUB_TEAM_BIDS_POLL_MS = 4000;

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

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

export default function BidPage() {
  const [url, setUrl] = useState("");
  const [proposal, setProposal] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
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

  const loadBids = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      const rows = await fetchBids();
      setBids(rows);
      if (!silent) setError(null);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to load bids");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBids();

    const timer = window.setInterval(() => {
      void loadBids({ silent: true });
    }, SUB_TEAM_BIDS_POLL_MS);

    const onFocus = () => {
      void loadBids({ silent: true });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loadBids]);

  useEffect(() => {
    void fetchCurrentUser().then(setCurrentUser);
  }, []);

  const bidsByDay = useMemo(() => {
    const groups = new Map<string, Bid[]>();

    for (const bid of bids) {
      const dayKey = dayKeyFromCreatedAt(bid.created_at);
      const current = groups.get(dayKey) ?? [];
      current.push(bid);
      groups.set(dayKey, current);
    }

    return [...groups.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dayKey, dayBids]) => ({
        dayKey,
        label: formatDayLabel(dayKey),
        bids: dayBids,
      }));
  }, [bids]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const bid = await createBidRequest({
        url: normalizeUrl(url),
        proposal: proposal.trim(),
        image,
      });
      setBids((current) => [bid, ...current]);
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
          Bid
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
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/job"
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
              disabled={submitting}
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
              {loading ? "Loading…" : `${bids.length} total`}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
            {loading && (
              <p className="px-4 py-6 text-sm text-slate-500">
                Loading sub team bids…
              </p>
            )}

            {!loading && bids.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                No bids from your sub team yet.
              </p>
            )}

            {!loading && bids.length > 0 && (
              <div className="divide-y divide-slate-200">
                {bidsByDay.map((group) => (
                  <section key={group.dayKey}>
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                      <h3 className="text-sm font-semibold text-slate-900">
                        {group.label}
                      </h3>
                      <span className="text-xs text-slate-500">
                        {group.bids.length} bid
                        {group.bids.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {group.bids.map((bid, index) => {
                        const isOwnBid =
                          currentUser != null &&
                          bid.user_id === currentUser.id;

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
                              {isOwnBid ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedBid({ bid, number: index + 1 })
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
                  </section>
                ))}
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
            currentUser != null && jobBid.bid.user_id === currentUser.id
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
