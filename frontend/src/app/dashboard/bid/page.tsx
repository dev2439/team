"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { BidDetailModal } from "@/components/BidDetailModal";
import { LiveMarkdownEditor } from "@/components/LiveMarkdownEditor";
import { createBidRequest, fetchBids, type Bid } from "@/lib/bids";

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export default function BidPage() {
  const [url, setUrl] = useState("");
  const [proposal, setProposal] = useState("");
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedBid, setSelectedBid] = useState<{
    bid: Bid;
    number: number;
  } | null>(null);

  const loadBids = useCallback(async () => {
    try {
      const rows = await fetchBids();
      setBids(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bids");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBids();
  }, [loadBids]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const bid = await createBidRequest({
        url: normalizeUrl(url),
        proposal: proposal.trim(),
      });
      setBids((current) => [bid, ...current]);
      setUrl("");
      setProposal("");
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
              <ul className="divide-y divide-slate-200">
                {bids.map((bid, index) => (
                  <li
                    key={bid.id}
                    className="border-b border-slate-200 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedBid({ bid, number: index + 1 })
                      }
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                    >
                      <span className="w-6 shrink-0 text-xs font-medium text-slate-400">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-sky-700 hover:underline">
                          {bid.url}
                        </span>
                        {bid.user_name ? (
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {bid.user_name}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {selectedBid && (
        <BidDetailModal
          bid={selectedBid.bid}
          number={selectedBid.number}
          onClose={() => setSelectedBid(null)}
        />
      )}
    </div>
  );
}
