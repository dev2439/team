"use client";

import { useEffect, useRef } from "react";
import type { Bid } from "@/lib/bids";

type BidImageModalProps = {
  bid: Bid;
  onClose: () => void;
  onShowProposal?: () => void;
};

export function BidImageModal({
  bid,
  onClose,
  onShowProposal,
}: BidImageModalProps) {
  const onCloseRef = useRef(onClose);
  const onShowProposalRef = useRef(onShowProposal);

  useEffect(() => {
    onCloseRef.current = onClose;
    onShowProposalRef.current = onShowProposal;
  }, [onClose, onShowProposal]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        onShowProposalRef.current
      ) {
        event.preventDefault();
        onShowProposalRef.current();
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

  if (!bid.image) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-slate-950/75"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bid-image-modal-title"
        className="relative z-10 flex max-h-[min(92vh,60rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/50"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div className="min-w-0">
            <p
              id="bid-image-modal-title"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Job
            </p>
            {bid.user_name ? (
              <p className="mt-0.5 truncate text-sm text-slate-700 dark:text-slate-200">
                {bid.user_name}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-3 sm:p-5 dark:bg-slate-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bid.image}
            alt="Job"
            className="max-h-[min(80vh,52rem)] max-w-full rounded-lg object-contain shadow-lg shadow-slate-900/20 dark:shadow-black/40"
          />
        </div>
      </div>
    </div>
  );
}
