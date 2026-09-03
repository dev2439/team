"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Bid } from "@/lib/bids";

type BidImageModalProps = {
  bid: Bid;
  onClose: () => void;
  onShowProposal?: () => void;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const WHEEL_ZOOM_STEP = 0.12;
const KEY_ZOOM_STEP = 0.2;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function BidImageModal({
  bid,
  onClose,
  onShowProposal,
}: BidImageModalProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const onCloseRef = useRef(onClose);
  const onShowProposalRef = useRef(onShowProposal);
  const setZoomRef = useRef(setZoom);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
    onShowProposalRef.current = onShowProposal;
    setZoomRef.current = setZoom;
  }, [onClose, onShowProposal]);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    dragRef.current = null;
  }, [bid.id, bid.image]);

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
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setZoomRef.current((current) => clampZoom(current + KEY_ZOOM_STEP));
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setZoomRef.current((current) => clampZoom(current - KEY_ZOOM_STEP));
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

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      setZoomRef.current((current) =>
        clampZoom(current + direction * WHEEL_ZOOM_STEP),
      );
    }

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
    };
  }, []);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (!bid.image || !mounted) return null;

  return createPortal(
    <div className="modal-backdrop-enter fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-3">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bid-image-modal-title"
        className="modal-panel-enter relative z-10 flex h-[min(96vh,72rem)] w-full max-w-[min(88vw,80rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.6)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/95 dark:shadow-black/50"
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
          <div className="flex shrink-0 items-center gap-3">
            <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>

        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-slate-100 p-3 sm:p-5 dark:bg-slate-950 ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bid.image}
            alt="Job"
            draggable={false}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            }}
            className={`max-h-[min(88vh,64rem)] max-w-full origin-center select-none rounded-lg object-contain shadow-lg shadow-slate-900/20 dark:shadow-black/40 ${
              dragging ? "" : "transition-transform duration-75 ease-out"
            }`}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
