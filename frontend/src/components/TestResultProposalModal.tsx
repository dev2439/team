"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MarkdownView } from "@/components/MarkdownView";
import {
  fetchTestBidRatings,
  fetchTestBidViewers,
  type TestBidProposalResult,
  type TestBidRatingListItem,
  type TestBidViewer,
} from "@/lib/test-bids";

type TestResultProposalModalProps = {
  proposals: TestBidProposalResult[];
  index: number;
  favoriteCount: number;
  currentUserId: number | null;
  /** When true, show real names instead of "Bidder N". */
  showBidderNames?: boolean;
  /** Hide star/comment rating form (BigBoss). */
  hideRating?: boolean;
  /** Keep the comments panel open and load ratings by default. */
  commentsOpenByDefault?: boolean;
  /** Show comment author names (BigBoss only). */
  showCommentAuthors?: boolean;
  onIndexChange: (index: number) => void;
  onToggleFavorite: (proposalId: number) => Promise<void>;
  onSaveRating: (input: {
    proposalId: number;
    rating: number;
    comment: string;
  }) => Promise<void>;
  onClose: () => void;
};

const SCROLL_STEP = 80;

function HeartIcon({
  filled,
  className = "h-14 w-14",
}: {
  filled: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
      />
    </svg>
  );
}

function StarIcon({
  filled,
  className = "h-8 w-8",
}: {
  filled: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
      />
    </svg>
  );
}

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

export function TestResultProposalModal({
  proposals,
  index,
  favoriteCount,
  currentUserId,
  showBidderNames = false,
  hideRating = false,
  commentsOpenByDefault = false,
  showCommentAuthors = false,
  onIndexChange,
  onToggleFavorite,
  onSaveRating,
  onClose,
}: TestResultProposalModalProps) {
  const proposalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const onIndexChangeRef = useRef(onIndexChange);
  const indexRef = useRef(index);
  const countRef = useRef(proposals.length);
  const [busy, setBusy] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingSuccess, setRatingSuccess] = useState<string | null>(null);
  const [draftRating, setDraftRating] = useState(0);
  const [draftComment, setDraftComment] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(commentsOpenByDefault);
  const [ratings, setRatings] = useState<TestBidRatingListItem[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [ratingsError, setRatingsError] = useState<string | null>(null);
  const [viewers, setViewers] = useState<TestBidViewer[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const current = proposals[index] ?? null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
    onIndexChangeRef.current = onIndexChange;
    indexRef.current = index;
    countRef.current = proposals.length;
  }, [onClose, onIndexChange, index, proposals.length]);

  async function loadViewers(testBidId: number) {
    setViewersLoading(true);
    try {
      const rows = await fetchTestBidViewers(testBidId);
      setViewers(rows);
    } catch {
      setViewers([]);
    } finally {
      setViewersLoading(false);
    }
  }

  // Seed drafts only when switching proposals — never from background poll updates.
  useEffect(() => {
    proposalRef.current?.scrollTo({ top: 0 });
    setError(null);
    setRatingSuccess(null);
    setDraftRating(
      current?.my_rating != null
        ? Math.min(10, Math.max(0, current.my_rating))
        : 0,
    );
    setDraftComment(current?.my_rating_comment ?? "");
    setRatingsError(null);
    setViewers([]);

    if (current) {
      if (showBidderNames) {
        void loadViewers(current.id);
      } else {
        setViewers([]);
        setViewersLoading(false);
      }
    }

    if (commentsOpenByDefault) {
      setCommentsOpen(true);
      if (current) {
        void loadRatings(current.id);
      } else {
        setRatings([]);
      }
    } else {
      setCommentsOpen(false);
      setRatings([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadRatings is stable enough; only re-run on proposal change
  }, [current?.id, commentsOpenByDefault, showBidderNames]);

  async function loadRatings(testBidId: number) {
    setRatingsLoading(true);
    setRatingsError(null);
    try {
      const rows = await fetchTestBidRatings(testBidId);
      setRatings(rows);
    } catch (err) {
      setRatings([]);
      setRatingsError(
        err instanceof Error ? err.message : "Failed to load comments",
      );
    } finally {
      setRatingsLoading(false);
    }
  }

  async function toggleComments() {
    if (!current) return;
    const allowed =
      commentsOpenByDefault ||
      hideRating ||
      (currentUserId != null && current.user_id === currentUserId) ||
      (current.my_rating != null &&
        current.my_rating >= 1 &&
        Boolean(current.my_rating_comment?.trim()));
    if (!allowed) return;
    if (commentsOpen) {
      setCommentsOpen(false);
      return;
    }
    setCommentsOpen(true);
    await loadRatings(current.id);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "textarea" || tag === "input" || target?.isContentEditable) {
        if (event.key === "Escape") {
          onCloseRef.current();
        }
        return;
      }

      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const count = countRef.current;
        if (count <= 1) return;
        const next = (indexRef.current - 1 + count) % count;
        onIndexChangeRef.current(next);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        const count = countRef.current;
        if (count <= 1) return;
        const next = (indexRef.current + 1) % count;
        onIndexChangeRef.current(next);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const el = proposalRef.current;
        if (!el) return;
        event.preventDefault();
        el.scrollBy({
          top: event.key === "ArrowDown" ? SCROLL_STEP : -SCROLL_STEP,
          behavior: "smooth",
        });
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!mounted || !current) return null;

  const favorited = Boolean(current.is_favorited);
  const isOwnProposal =
    currentUserId != null && current.user_id === currentUserId;
  const memberLabel = isOwnProposal
    ? "My Proposal"
    : showBidderNames
      ? current.user_name
      : `Bidder ${index + 1}`;
  const hasLeftRating =
    current.my_rating != null &&
    current.my_rating >= 1 &&
    Boolean(current.my_rating_comment?.trim());
  // BigBoss always sees comments; others only after they leave a rating + comment.
  // Own proposal: allow viewing feedback without rating yourself.
  const canViewComments =
    commentsOpenByDefault || hideRating || isOwnProposal || hasLeftRating;

  const viewScore =
    current.view_score != null && !Number.isNaN(Number(current.view_score))
      ? Number(current.view_score)
      : viewers.length === 0
        ? null
        : viewers.reduce((sum, viewer) => sum + viewer.view_order, 0) /
          viewers.length;
  const favoritesReceived = Math.max(
    0,
    Number(current.favorites_received) || 0,
  );
  const commentScore = Number(current.ranking_score);

  async function handleToggleFavorite() {
    if (!current || busy || isOwnProposal) return;
    setBusy(true);
    setError(null);
    try {
      await onToggleFavorite(current.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update favorite",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveRating() {
    if (!current || ratingBusy || isOwnProposal) return;

    if (draftRating < 1 || draftRating > 10) {
      setError("Select a star rating from 1 to 10");
      setRatingSuccess(null);
      return;
    }
    if (!draftComment.trim()) {
      setError("Comment is required when rating");
      setRatingSuccess(null);
      return;
    }

    setRatingBusy(true);
    setError(null);
    setRatingSuccess(null);
    try {
      await onSaveRating({
        proposalId: current.id,
        rating: draftRating,
        comment: draftComment.trim(),
      });
      setRatingSuccess("Rating saved.");
      if (commentsOpen) {
        await loadRatings(current.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rating");
    } finally {
      setRatingBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-result-modal-title"
        className={`relative z-10 flex h-[min(90vh,56rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-[max-width] ${
          commentsOpen && canViewComments
            ? "max-w-[min(112rem,calc(100vw-1rem))]"
            : "max-w-[min(96rem,calc(100vw-1rem))]"
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p
              id="test-result-modal-title"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Proposal {index + 1} of {proposals.length}
              {proposals.length > 1 ? " · ← → switch member" : ""}
            </p>
            <a
              href={current.parent_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block break-all text-sm font-medium text-sky-700 hover:underline"
            >
              {current.parent_url}
            </a>
            <p className="mt-1 text-xs text-slate-500">
              {memberLabel} ·{" "}
              {formatAfterBidTest(
                current.parent_created_at,
                current.created_at,
              )}{" "}
              · {formatCreatedAt(current.created_at)}
            </p>
            {showBidderNames ? (
              <div className="mt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  View order by user
                  {viewersLoading
                    ? " · loading…"
                    : viewers.length > 0
                      ? ` · ${viewers.length} user${viewers.length === 1 ? "" : "s"}`
                      : " · none yet"}
                </p>
                {viewers.length > 0 ? (
                  <div className="mt-1 flex max-h-16 flex-wrap gap-1.5 overflow-y-auto">
                    {viewers.map((viewer) => (
                      <span
                        key={viewer.user_id}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-800 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100"
                        title={`${viewer.user_name} opened this proposal ${formatRankPlace(viewer.view_order)} among their opens in this bid test · ${formatCreatedAt(viewer.viewed_at)}`}
                      >
                        <span className="max-w-[8rem] truncate">
                          {viewer.user_name}
                        </span>
                        <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                          {formatRankPlace(viewer.view_order)}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {showBidderNames ? (
            <div className="flex shrink-0 items-center gap-4 self-center px-2 sm:gap-6">
              <div
                className="text-center"
                title="Average view order across users who opened this proposal (lower is better)"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  View Score
                </p>
                <p className="text-4xl font-semibold tabular-nums leading-none text-slate-900 dark:text-white sm:text-5xl">
                  {viewersLoading
                    ? "…"
                    : viewScore == null
                      ? "—"
                      : viewScore.toFixed(2)}
                </p>
              </div>
              <div
                className="text-center"
                title="Times this proposal was favorited"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Favorites
                </p>
                <p className="text-4xl font-semibold tabular-nums leading-none text-slate-900 dark:text-white sm:text-5xl">
                  {favoritesReceived}
                </p>
              </div>
              <div className="text-center" title="Average star rating score">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Comment Score
                </p>
                <p className="text-4xl font-semibold tabular-nums leading-none text-slate-900 dark:text-white sm:text-5xl">
                  {commentScore.toFixed(2)}
                </p>
              </div>
            </div>
          ) : null}
          <div className="flex shrink-0 flex-col items-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Close
            </button>
            {!hideRating ? (
              <p className="text-xs text-slate-500">
                Your picks {favoriteCount}
              </p>
            ) : null}
          </div>
        </div>

        {/* One horizontal row: Image | Proposal | Comments */}
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          <div className="flex w-[28rem] shrink-0 flex-col border-r border-slate-200">
            <p className="shrink-0 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Job image
            </p>
            <div className="min-h-0 flex-1 overflow-auto bg-slate-50 px-5 pb-5">
              {current.parent_image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.parent_image}
                  alt=""
                  className="mx-auto block h-auto w-full max-w-full rounded-xl border border-slate-200 bg-white"
                />
              ) : (
                <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
                  No image
                </div>
              )}

              {!hideRating ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                {!isOwnProposal ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Your rating
                      </p>
                      {hasLeftRating ? (
                        <button
                          type="button"
                          onClick={() => void toggleComments()}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          {commentsOpen ? "Hide comments" : "Show comments"}
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div
                        className="flex items-center gap-1"
                        role="radiogroup"
                        aria-label="Star rating"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => {
                          const filled = draftRating >= value;
                          return (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={draftRating === value}
                              aria-label={`${value} star${value === 1 ? "" : "s"}`}
                              onClick={() => {
                                setDraftRating(value);
                                setError(null);
                                setRatingSuccess(null);
                              }}
                              className={`rounded-md p-0.5 transition ${
                                filled
                                  ? "text-amber-400"
                                  : "text-slate-300 hover:text-amber-300"
                              }`}
                            >
                              <StarIcon filled={filled} className="h-5 w-5" />
                            </button>
                          );
                        })}
                        <span className="ml-2 text-sm text-slate-500">
                          {draftRating > 0
                            ? `${draftRating}/10`
                            : "Select stars"}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleSaveRating()}
                        disabled={
                          ratingBusy ||
                          draftRating < 1 ||
                          !draftComment.trim()
                        }
                        className="ml-auto rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {ratingBusy ? "Saving…" : "Save rating"}
                      </button>
                    </div>

                    <label className="mt-4 flex flex-col gap-2 text-sm text-slate-700">
                      <span className="font-medium">
                        Comment <span className="text-rose-500">*</span>
                      </span>
                      <textarea
                        value={draftComment}
                        onChange={(e) => {
                          setDraftComment(e.target.value);
                          setError(null);
                          setRatingSuccess(null);
                        }}
                        rows={3}
                        required
                        placeholder="Required when you rate this proposal…"
                        className="resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                      />
                    </label>

                    {error ? (
                      <p
                        role="alert"
                        className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
                      >
                        {error}
                      </p>
                    ) : null}
                    {ratingSuccess ? (
                      <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        {ratingSuccess}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Ratings
                    </p>
                    <button
                      type="button"
                      onClick={() => void toggleComments()}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      {commentsOpen ? "Hide comments" : "Show comments"}
                    </button>
                  </div>
                )}
              </div>
              ) : null}
            </div>
          </div>

          <div
            className={`flex min-h-0 min-w-0 flex-1 flex-col ${
              commentsOpen && canViewComments
                ? "border-r border-slate-200"
                : ""
            }`}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Proposal · {memberLabel}
              </p>
              {isOwnProposal ? (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Your proposal
                </p>
              ) : hideRating ? null : (
                <button
                  type="button"
                  onClick={() => void handleToggleFavorite()}
                  disabled={busy}
                  aria-pressed={favorited}
                  aria-label={
                    favorited ? "Remove from favorites" : "Add to favorites"
                  }
                  title={
                    favorited ? "Remove favorite" : "Add to favorites"
                  }
                  className={`flex h-20 w-20 items-center justify-center rounded-2xl border transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    favorited
                      ? "border-rose-200 bg-rose-50 text-rose-500 hover:bg-rose-100"
                      : "border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:text-rose-500"
                  }`}
                >
                  <HeartIcon filled={favorited} />
                </button>
              )}
            </div>

            <div
              ref={proposalRef}
              tabIndex={0}
              className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 outline-none"
            >
              <MarkdownView
                content={current.proposal}
                className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 [&_p]:!text-[calc(0.95rem-1px)] [&_p]:!leading-6 [&_li]:!text-[calc(0.95rem-1px)] [&_li]:!leading-6 [&_blockquote]:!text-[calc(0.95rem-1px)] [&_blockquote]:!leading-6"
              />
            </div>
          </div>

          {commentsOpen && canViewComments ? (
            <div className="flex w-72 shrink-0 flex-col">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Comments
                </p>
                <span className="text-xs text-slate-400">
                  {ratingsLoading ? "Loading…" : `${ratings.length} total`}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {ratingsError ? (
                  <p className="text-sm text-red-600">{ratingsError}</p>
                ) : ratingsLoading ? (
                  <p className="text-sm text-slate-500">Loading comments…</p>
                ) : ratings.length === 0 ? (
                  <p className="text-sm text-slate-400">No comments yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {ratings.map((row) => (
                      <li
                        key={row.id}
                        className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-0.5 text-amber-400">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                            <StarIcon
                              key={value}
                              filled={row.rating >= value}
                              className="h-3.5 w-3.5"
                            />
                          ))}
                          <span className="ml-2 text-xs font-medium text-slate-600">
                            {row.rating}/10
                          </span>
                        </div>
                        {showCommentAuthors ? (
                          <p className="mt-1.5 text-xs font-medium text-slate-700">
                            {row.user_name}
                          </p>
                        ) : null}
                        <p className="mt-1.5 break-words whitespace-pre-wrap text-sm text-slate-800 [overflow-wrap:anywhere]">
                          {row.comment}
                        </p>
                        <p className="mt-1.5 text-[11px] text-slate-400">
                          {formatCreatedAt(row.updated_at || row.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
