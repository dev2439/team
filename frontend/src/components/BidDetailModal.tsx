"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MarkdownView } from "@/components/MarkdownView";
import type { Bid } from "@/lib/bids";

type BidDetailModalProps = {
  bid: Bid;
  number: number;
  onClose: () => void;
  onShowImage?: () => void;
};

const SCROLL_STEP = 80;

export function BidDetailModal({
  bid,
  number,
  onClose,
  onShowImage,
}: BidDetailModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const onShowImageRef = useRef(onShowImage);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
    onShowImageRef.current = onShowImage;
  }, [onClose, onShowImage]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        onShowImageRef.current
      ) {
        event.preventDefault();
        onShowImageRef.current();
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const el = contentRef.current;
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

  if (!mounted) return null;

  return createPortal(
    <div className="modal-backdrop-enter fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-3">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px] dark:bg-slate-950/75"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bid-modal-title"
        className="modal-panel-enter relative z-10 flex max-h-[min(85vh,52rem)] w-full max-w-[min(88vw,80rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/95 dark:shadow-black/50"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="min-w-0">
            <p
              id="bid-modal-title"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              Bid {number}
            </p>
            <a
              href={bid.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block break-all text-sm font-medium text-sky-700 hover:underline dark:text-sky-400 dark:hover:text-sky-300"
            >
              {bid.url}
            </a>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
            className="shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Close
          </button>
        </div>

        <div
          ref={contentRef}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4 outline-none dark:bg-slate-900/95"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Proposal
          </p>
          <MarkdownView
            content={bid.proposal}
            className="markdown-proposal rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
