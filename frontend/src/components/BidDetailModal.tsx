"use client";

import { useEffect } from "react";
import { MarkdownView } from "@/components/MarkdownView";
import type { Bid } from "@/lib/bids";

type BidDetailModalProps = {
  bid: Bid;
  number: number;
  onClose: () => void;
};

export function BidDetailModal({ bid, number, onClose }: BidDetailModalProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bid-modal-title"
        className="relative z-10 flex max-h-[min(85vh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p
              id="bid-modal-title"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Bid {number}
            </p>
            <a
              href={bid.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block break-all text-sm font-medium text-sky-700 hover:underline"
            >
              {bid.url}
            </a>
            <p className="mt-1 text-xs text-slate-500">
              Created{" "}
              {new Date(bid.created_at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Proposal
          </p>
          <MarkdownView content={bid.proposal} />
        </div>
      </div>
    </div>
  );
}
