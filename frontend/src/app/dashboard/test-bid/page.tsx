"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { LiveMarkdownEditor } from "@/components/LiveMarkdownEditor";
import { MarkdownView } from "@/components/MarkdownView";
import {
  createTestBidProposalRequest,
  fetchTestBidProposal,
  fetchTestBids,
  type TestBid,
  type TestBidProposal,
} from "@/lib/test-bids";
import { startBackgroundPoll } from "@/lib/poll";

const TEST_BIDS_POLL_MS = 10_000;
const MAX_TEST_BID_PROPOSAL_CHARS = 5000;

function formatCreatedAt(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function TestBidPage() {
  const [bids, setBids] = useState<TestBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [savedProposal, setSavedProposal] = useState<TestBidProposal | null>(
    null,
  );
  const [proposalLoading, setProposalLoading] = useState(false);
  const [draftProposal, setDraftProposal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const loadBids = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      const rows = await fetchTestBids();
      setBids(rows);
      if (!silent) setError(null);
    } catch (err) {
      if (!silent) {
        setError(
          err instanceof Error ? err.message : "Failed to load test bids",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBids();
    return startBackgroundPoll(() => loadBids({ silent: true }), TEST_BIDS_POLL_MS, {
      runImmediately: false,
    });
  }, [loadBids]);

  useEffect(() => {
    if (selectedId == null && bids.length > 0) {
      setSelectedId(bids[0]!.id);
      return;
    }
    if (
      selectedId != null &&
      bids.length > 0 &&
      !bids.some((bid) => bid.id === selectedId)
    ) {
      setSelectedId(bids[0]!.id);
    }
    if (bids.length === 0) {
      setSelectedId(null);
    }
  }, [bids, selectedId]);

  useEffect(() => {
    setDraftProposal("");
    setSaveError(null);
    setSavedProposal(null);
    setEditing(false);

    if (selectedId == null) {
      setProposalLoading(false);
      return;
    }

    let cancelled = false;
    setProposalLoading(true);

    void fetchTestBidProposal(selectedId)
      .then((row) => {
        if (!cancelled) setSavedProposal(row);
      })
      .catch(() => {
        if (!cancelled) setSavedProposal(null);
      })
      .finally(() => {
        if (!cancelled) setProposalLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = bids.find((bid) => bid.id === selectedId) ?? null;
  const showEditor = !savedProposal || editing;

  function startEditing() {
    if (!savedProposal) return;
    setDraftProposal(savedProposal.proposal);
    setSaveError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setDraftProposal("");
    setSaveError(null);
    setEditing(false);
  }

  async function onSubmitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;

    setSaveError(null);

    const text = draftProposal.trim();
    if (!text) {
      setSaveError("Proposal is required");
      return;
    }
    if (draftProposal.length > MAX_TEST_BID_PROPOSAL_CHARS) {
      setSaveError(
        `Proposal must be at most ${MAX_TEST_BID_PROPOSAL_CHARS} characters`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const row = await createTestBidProposalRequest({
        parentId: selected.id,
        proposal: text,
      });
      setDraftProposal("");
      setEditing(false);
      setSavedProposal(row);
      setBids((current) =>
        current.map((bid) =>
          bid.id === selected.id ? { ...bid, has_proposal: true } : bid,
        ),
      );
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save proposal",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Test Bid
        </h1>
        <p className="mt-1 text-slate-600">
          Select a test bid, then write and submit a proposal.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:col-span-1">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Test bids</h2>
            <span className="text-xs text-slate-500">
              {loading ? "Loading…" : `${bids.length} total`}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                Loading test bids…
              </p>
            ) : error ? (
              <p className="px-4 py-6 text-sm text-red-600">{error}</p>
            ) : bids.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                No test bids yet. Save one from Bid Test.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {bids.map((bid) => {
                  const active = bid.id === selectedId;
                  return (
                    <li key={bid.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(bid.id)}
                        className={`flex w-full items-start gap-3 px-3 py-3 text-left transition ${
                          active ? "bg-sky-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                          {bid.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={bid.image}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
                              No img
                            </div>
                          )}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="block min-w-0 truncate text-sm font-medium text-sky-700">
                              {bid.url}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                bid.has_proposal
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {bid.has_proposal ? "Bidded" : "Open"}
                            </span>
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {formatCreatedAt(bid.created_at)}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-slate-400">
                            #{bid.id}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:col-span-2">
          {selected ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
              <div className="shrink-0 border-b border-slate-100 pb-3">
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm font-medium text-sky-700 hover:underline"
                >
                  {selected.url}
                </a>
                <p className="mt-1 text-xs text-slate-500">
                  Created {formatCreatedAt(selected.created_at)} · #
                  {selected.id}
                </p>
              </div>

              {proposalLoading ? (
                <p className="text-sm text-slate-500">Loading proposal…</p>
              ) : showEditor ? (
                <form
                  onSubmit={onSubmitProposal}
                  className="flex min-h-0 flex-1 flex-col gap-4"
                >
                  <div className="flex min-h-0 flex-1 flex-col">
                    <LiveMarkdownEditor
                      value={draftProposal}
                      onChange={setDraftProposal}
                      required
                      maxLength={MAX_TEST_BID_PROPOSAL_CHARS}
                      placeholder={"# Proposal\n\nWrite in **Markdown**…"}
                    />
                  </div>

                  {saveError ? (
                    <p
                      role="alert"
                      className="shrink-0 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
                    >
                      {saveError}
                    </p>
                  ) : null}

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      disabled={
                        submitting ||
                        !draftProposal.trim() ||
                        draftProposal.length > MAX_TEST_BID_PROPOSAL_CHARS
                      }
                      className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting
                        ? "Saving…"
                        : editing
                          ? "Save changes"
                          : "Submit"}
                    </button>
                    {editing ? (
                      <button
                        type="button"
                        onClick={cancelEditing}
                        disabled={submitting}
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  <div className="flex shrink-0 items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Proposal
                    </p>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-slate-400">
                        Saved {formatCreatedAt(savedProposal.created_at)}
                      </p>
                      <button
                        type="button"
                        onClick={startEditing}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                    <MarkdownView content={savedProposal.proposal} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 py-10 text-sm text-slate-500">
              {loading ? "Loading…" : "Select a test bid from the list."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
