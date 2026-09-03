"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCurrentUser, type PublicUser } from "@/lib/auth";
import {
  createPlanRequest,
  deletePlanRequest,
  fetchPlansInRange,
  updatePlanRequest,
  type PlanItem,
  type PlanItemScope,
  type PlanItemStatus,
} from "@/lib/plans";
import { fetchTarget, type Target } from "@/lib/targets";
import { fetchUsers, type ListedUser } from "@/lib/users";

type PlanWeek = {
  key: string;
  endKey: string;
  label: string;
  days: string[];
};

const EST_TIMEZONE = "America/New_York";
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateKeyFromParts(parts: {
  year: number;
  month: number;
  day: number;
}): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/** Calendar date in Eastern Time. Date-only keys are used as-is (no UTC shift). */
function estDateParts(value: string | Date): {
  year: number;
  month: number;
  day: number;
} {
  if (typeof value === "string" && DATE_ONLY_RE.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return { year: year!, month: month!, day: day! };
  }

  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EST_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return { year: num("year"), month: num("month"), day: num("day") };
}

function toEstDateKey(value: string | Date): string {
  return formatDateKeyFromParts(estDateParts(value));
}

function todayKey(): string {
  return toEstDateKey(new Date());
}

function dateKeyToUtcNoon(key: string): Date {
  const { year, month, day } = estDateParts(key);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDaysToKey(key: string, days: number): string {
  const date = dateKeyToUtcNoon(key);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Monday of the Eastern calendar week that contains `key`. */
function mondayOfWeek(key: string): string {
  const jsDay = dateKeyToUtcNoon(key).getUTCDay();
  const offset = jsDay === 0 ? -6 : 1 - jsDay;
  return addDaysToKey(key, offset);
}

function formatMonthDay(value: string | Date): string {
  const { month, day } = estDateParts(value);
  return `${month}/${day}`;
}

/** Same week count as Financial, aligned Monday–Sunday in Eastern Time. */
function getPlanWeeksFromTarget(target: Target | null): PlanWeek[] {
  if (!target) return [];

  const weekCount = Math.max(0, Math.trunc(Number(target.week) || 0));
  if (weekCount === 0) return [];

  const startKey = mondayOfWeek(toEstDateKey(target.created_at));

  return Array.from({ length: weekCount }, (_, index) => {
    const weekStartKey = addDaysToKey(startKey, index * 7);
    const weekEndKey = addDaysToKey(weekStartKey, 6);
    const days = Array.from({ length: 7 }, (__, offset) =>
      addDaysToKey(weekStartKey, offset),
    );

    return {
      key: weekStartKey,
      endKey: weekEndKey,
      label: `Week ${index + 1}`,
      days,
    };
  });
}

function formatDayLabel(isoDate: string): string {
  return dateKeyToUtcNoon(isoDate).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${
        open ? "rotate-0" : "-rotate-90"
      }`}
      fill="currentColor"
    >
      <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
    </svg>
  );
}

function StatusIcon({ status }: { status: PlanItemStatus }) {
  if (status === "done") {
    return (
      <span
        title="Done"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"
      >
        ✓
      </span>
    );
  }
  if (status === "not_done") {
    return (
      <span
        title="Not done"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-rose-100 text-sm font-bold text-rose-700 dark:bg-rose-900/60 dark:text-rose-300"
      >
        ✕
      </span>
    );
  }
  return (
    <span
      title="Pending"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sm font-bold text-sky-700 dark:bg-sky-900/60 dark:text-sky-300"
    >
      ?
    </span>
  );
}

function nextStatus(status: PlanItemStatus): PlanItemStatus {
  if (status === "pending") return "done";
  if (status === "done") return "not_done";
  return "pending";
}

function isGroupComplete(items: PlanItem[]): boolean {
  return items.length > 0 && items.every((item) => item.status === "done");
}

type PlanGroupVariant = "month" | "week" | "day";

function PlanGroupCard({
  title,
  subtitle,
  items,
  expanded,
  variant = "day",
  readOnly = false,
  onToggle,
  onCreate,
  onUpdate,
  onDelete,
}: {
  title: string;
  subtitle?: string;
  items: PlanItem[];
  expanded: boolean;
  variant?: PlanGroupVariant;
  readOnly?: boolean;
  onToggle: () => void;
  onCreate: (title: string) => Promise<void>;
  onUpdate: (
    id: number,
    patch: {
      title?: string;
      status?: PlanItemStatus;
      note?: string;
      notDoneReason?: string;
    },
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [draftTitle, setDraftTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");
  const [reasonDrafts, setReasonDrafts] = useState<Record<number, string>>({});
  const [awaitingReasonId, setAwaitingReasonId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const doneCount = items.filter((item) => item.status === "done").length;
  const total = items.length;
  const progress = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const complete = isGroupComplete(items);

  const shellClass =
    variant === "month"
      ? complete
        ? "border-emerald-400 bg-gradient-to-br from-emerald-50 to-white shadow-sm dark:border-emerald-500/70 dark:from-emerald-950/50 dark:to-slate-900 dark:shadow-none"
        : "border-sky-200 bg-gradient-to-br from-sky-50 to-white shadow-sm dark:border-sky-700/70 dark:from-sky-950/40 dark:to-slate-900 dark:shadow-none"
      : variant === "week"
        ? complete
          ? "border-emerald-400 bg-emerald-50/50 dark:border-emerald-500/70 dark:bg-emerald-950/35"
          : "border-indigo-200 bg-indigo-50/40 dark:border-indigo-700/60 dark:bg-indigo-950/30"
        : complete
          ? "border-emerald-400 bg-slate-50/80 dark:border-emerald-500/70 dark:bg-slate-800/70"
          : "border-amber-200/80 bg-slate-50/80 dark:border-slate-600 dark:bg-slate-800/55";

  const badgeClass =
    variant === "month"
      ? "bg-sky-100 text-sky-800 dark:bg-sky-900/80 dark:text-sky-200"
      : variant === "week"
        ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/80 dark:text-indigo-200"
        : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";

  const addPlaceholder =
    variant === "month"
      ? "Add a month goal…"
      : variant === "week"
        ? "Add a week goal…"
        : "Add a plan…";

  async function handleAdd() {
    const titleText = draftTitle.trim();
    if (!titleText) {
      setLocalError(
        variant === "day" ? "Plan title is required" : "Goal title is required",
      );
      return;
    }
    setAdding(true);
    setLocalError(null);
    try {
      await onCreate(titleText);
      setDraftTitle("");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function handleStatusClick(item: PlanItem) {
    const status = nextStatus(item.status);
    if (status === "not_done") {
      setAwaitingReasonId(item.id);
      setReasonDrafts((current) => ({
        ...current,
        [item.id]: current[item.id] ?? item.not_done_reason ?? "",
      }));
      setLocalError("Write a reason, then confirm not done");
      return;
    }

    setAwaitingReasonId(null);
    setBusyId(item.id);
    setLocalError(null);
    try {
      await onUpdate(item.id, { status });
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Failed to update status",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function confirmNotDone(item: PlanItem) {
    const reason = (reasonDrafts[item.id] ?? "").trim();
    if (!reason) {
      setLocalError("Reason is required when status is not done");
      return;
    }
    setBusyId(item.id);
    setLocalError(null);
    try {
      await onUpdate(item.id, { status: "not_done", notDoneReason: reason });
      setAwaitingReasonId(null);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Failed to update status",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveEdit(item: PlanItem) {
    const titleText = editTitle.trim();
    if (!titleText) {
      setLocalError("Title is required");
      return;
    }
    const reason = (reasonDrafts[item.id] ?? item.not_done_reason).trim();
    if (item.status === "not_done" && !reason) {
      setLocalError("Reason is required when status is not done");
      return;
    }

    setBusyId(item.id);
    setLocalError(null);
    try {
      await onUpdate(item.id, {
        title: titleText,
        note: editNote,
        notDoneReason: item.status === "not_done" ? reason : undefined,
      });
      setEditingId(null);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusyId(null);
    }
  }

  const previewTitles = items
    .filter((item) => item.status !== "done")
    .slice(0, 2)
    .map((item) => item.title);

  return (
    <section className={`overflow-hidden rounded-xl border ${shellClass}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-white/50 dark:hover:bg-white/5"
      >
        <ChevronIcon open={expanded} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}
            >
              {variant === "month"
                ? "Month"
                : variant === "week"
                  ? "Week"
                  : "Day"}
            </span>
            <span
              className={`truncate font-semibold text-slate-800 dark:text-slate-100 ${
                variant === "month" ? "text-base" : "text-sm"
              }`}
            >
              {title}
            </span>
          </div>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          ) : null}
          {!expanded && previewTitles.length > 0 ? (
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {previewTitles.join(" · ")}
              {items.filter((item) => item.status !== "done").length > 2
                ? "…"
                : ""}
            </p>
          ) : null}
          {!expanded && total === 0 ? (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {variant === "day"
                ? "No plans yet"
                : readOnly
                  ? "No goals yet"
                  : "No goals yet — expand to add"}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
            {doneCount}/{total}
          </span>
          <div
            className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700"
            title={`${progress}% done`}
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-all dark:bg-emerald-400"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </button>

      {expanded ? (
        <div
          className={`border-t bg-white/90 px-3 py-3 dark:bg-slate-950/50 ${
            complete
              ? "border-emerald-100 dark:border-emerald-800/60"
              : "border-slate-100 dark:border-slate-700/80"
          }`}
        >
          {items.length === 0 ? (
            <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">
              {variant === "day" ? "No plans yet." : "No goals yet."}
            </p>
          ) : (
            <ul className="mb-3 flex flex-col gap-2">
              {items.map((item) => {
                const isEditing = editingId === item.id;
                const awaitingReason = awaitingReasonId === item.id;
                return (
                  <li
                    key={item.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900/70"
                  >
                    <div className="flex items-start gap-2">
                      {readOnly ? (
                        <span className="mt-0.5">
                          <StatusIcon status={item.status} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void handleStatusClick(item)}
                          className="mt-0.5 disabled:opacity-50"
                          title="Cycle status: pending → done → not done"
                        >
                          <StatusIcon status={item.status} />
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        {isEditing && !readOnly ? (
                          <div className="flex flex-col gap-2">
                            <input
                              value={editTitle}
                              onChange={(event) =>
                                setEditTitle(event.target.value)
                              }
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
                            />
                            <textarea
                              value={editNote}
                              onChange={(event) =>
                                setEditNote(event.target.value)
                              }
                              placeholder="Note (optional)"
                              rows={2}
                              className="w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
                            />
                            {item.status === "not_done" ? (
                              <textarea
                                value={
                                  reasonDrafts[item.id] ?? item.not_done_reason
                                }
                                onChange={(event) =>
                                  setReasonDrafts((current) => ({
                                    ...current,
                                    [item.id]: event.target.value,
                                  }))
                                }
                                placeholder="Reason (required for not done)"
                                rows={2}
                                className="w-full resize-y rounded-md border border-rose-200 bg-rose-50/40 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-rose-300 dark:border-rose-800 dark:bg-rose-950/40 dark:text-slate-100 dark:focus:border-rose-600"
                              />
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busyId === item.id}
                                onClick={() => void handleSaveEdit(item)}
                                className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                              {item.title}
                            </p>
                            {item.note ? (
                              <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
                                Note: {item.note}
                              </p>
                            ) : null}
                            {item.status === "not_done" &&
                            item.not_done_reason ? (
                              <p className="mt-1 whitespace-pre-wrap text-xs text-rose-600 dark:text-rose-400">
                                Reason: {item.not_done_reason}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                      {!isEditing && !readOnly ? (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            title="Edit"
                            onClick={() => {
                              setEditingId(item.id);
                              setEditTitle(item.title);
                              setEditNote(item.note);
                              setReasonDrafts((current) => ({
                                ...current,
                                [item.id]: item.not_done_reason,
                              }));
                              setAwaitingReasonId(null);
                              setLocalError(null);
                            }}
                            className="rounded-md border border-slate-200 bg-white p-1.5 text-sky-600 hover:bg-sky-50 dark:border-slate-600 dark:bg-slate-800 dark:text-sky-400 dark:hover:bg-sky-950/50"
                          >
                            <svg
                              aria-hidden
                              viewBox="0 0 20 20"
                              className="h-3.5 w-3.5"
                              fill="currentColor"
                            >
                              <path d="M15.586 3.586a2 2 0 0 1 0 2.828l-8.5 8.5A2 2 0 0 1 5.672 15.5l-2.086.418a.5.5 0 0 1-.586-.586L3.418 13.246a2 2 0 0 1 .586-1.414l8.5-8.5a2 2 0 0 1 2.828 0ZM13.5 5.5l1 1" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            disabled={busyId === item.id}
                            onClick={() => {
                              void (async () => {
                                setBusyId(item.id);
                                setLocalError(null);
                                try {
                                  await onDelete(item.id);
                                } catch (err) {
                                  setLocalError(
                                    err instanceof Error
                                      ? err.message
                                      : "Failed to delete",
                                  );
                                } finally {
                                  setBusyId(null);
                                }
                              })();
                            }}
                            className="rounded-md border border-slate-200 bg-white p-1.5 text-rose-500 hover:bg-rose-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            <svg
                              aria-hidden
                              viewBox="0 0 20 20"
                              className="h-3.5 w-3.5"
                              fill="currentColor"
                            >
                              <path d="M7 2a1 1 0 0 0-1 1v1H3.5a.75.75 0 0 0 0 1.5h.64l.7 10.05A2 2 0 0 0 6.83 18h6.34a2 2 0 0 0 1.99-1.45l.7-10.05h.64a.75.75 0 0 0 0-1.5H14V3a1 1 0 0 0-1-1H7Zm1.5 2.5h3V3.5h-3v1Zm-1.03 3.1a.75.75 0 0 1 .78.72l.3 6a.75.75 0 1 1-1.5.08l-.3-6a.75.75 0 0 1 .72-.8Zm4.56 0a.75.75 0 0 1 .72.8l-.3 6a.75.75 0 1 1-1.5-.08l.3-6a.75.75 0 0 1 .78-.72Z" />
                            </svg>
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {!isEditing && !readOnly && awaitingReason ? (
                      <div className="mt-2 flex flex-col gap-2 pl-8">
                        <textarea
                          value={reasonDrafts[item.id] ?? ""}
                          onChange={(event) =>
                            setReasonDrafts((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder="Reason required for not done"
                          rows={2}
                          className="w-full resize-y rounded-md border border-rose-200 bg-rose-50/40 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-rose-300 dark:border-rose-800 dark:bg-rose-950/40 dark:text-slate-100 dark:focus:border-rose-600"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => void confirmNotDone(item)}
                            className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                          >
                            Confirm not done
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAwaitingReasonId(null);
                              setLocalError(null);
                            }}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {!readOnly ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleAdd();
                  }
                }}
                placeholder={addPlaceholder}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500"
              />
              <button
                type="button"
                disabled={adding}
                onClick={() => void handleAdd()}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
          ) : null}
          {localError && !readOnly ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {localError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function isPlanMemberRole(role: string): boolean {
  return role === "Member" || role === "SubBoss";
}

export default function PlanPage() {
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [members, setMembers] = useState<ListedUser[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Only keys set to true are expanded. Default: today only. */
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const isBigBoss = currentUser?.role === "BigBoss";
  const planUserId = isBigBoss ? selectedMemberId : (currentUser?.id ?? null);
  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const weeks = useMemo(() => getPlanWeeksFromTarget(target), [target]);
  const monthKey = weeks[0]?.key ?? null;

  const rangeLabel = useMemo(() => {
    if (weeks.length === 0) return null;
    const first = weeks[0]!;
    const last = weeks[weeks.length - 1]!;
    return `${formatMonthDay(first.key)} – ${formatMonthDay(last.endKey)} (${weeks.length} week${weeks.length === 1 ? "" : "s"})`;
  }, [weeks]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await fetchCurrentUser();
        if (cancelled) return;
        setCurrentUser(user);
        if (user?.role === "BigBoss") {
          const { users } = await fetchUsers();
          if (cancelled) return;
          const planMembers = users
            .filter((entry) => isPlanMemberRole(entry.role))
            .sort((a, b) => a.name.localeCompare(b.name));
          setMembers(planMembers);
          setSelectedMemberId((current) =>
            current != null && planMembers.some((m) => m.id === current)
              ? current
              : (planMembers[0]?.id ?? null),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load user");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadData = useCallback(async () => {
    if (currentUser == null) return;
    if (isBigBoss && planUserId == null) {
      setPlans([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const nextTarget = await fetchTarget();
      setTarget(nextTarget);
      const nextWeeks = getPlanWeeksFromTarget(nextTarget);
      if (nextWeeks.length === 0) {
        setPlans([]);
        setExpandedKeys({});
      } else {
        const from = nextWeeks[0]!.key;
        const to = nextWeeks[nextWeeks.length - 1]!.endKey;
        const rows = await fetchPlansInRange({
          from,
          to,
          userId: planUserId ?? undefined,
        });
        setPlans(rows);
        const todayDate = todayKey();
        const nextExpanded: Record<string, boolean> = {};
        for (const week of nextWeeks) {
          for (const day of week.days) {
            nextExpanded[`day:${day}`] = day === todayDate;
          }
        }
        setExpandedKeys(nextExpanded);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, [currentUser, isBigBoss, planUserId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const targetStartKey = target ? toEstDateKey(target.created_at) : null;
  const monthPlans = useMemo(
    () =>
      plans.filter((item) => {
        if (item.scope !== "month") return false;
        if (monthKey && item.plan_date === monthKey) return true;
        if (targetStartKey && item.plan_date === targetStartKey) return true;
        return false;
      }),
    [plans, monthKey, targetStartKey],
  );

  const weekPlansByKey = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const plan of plans) {
      if (plan.scope !== "week") continue;
      const list = map.get(plan.plan_date) ?? [];
      list.push(plan);
      map.set(plan.plan_date, list);
    }
    return map;
  }, [plans]);

  const dayPlansByDate = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const plan of plans) {
      if (plan.scope !== "day") continue;
      const list = map.get(plan.plan_date) ?? [];
      list.push(plan);
      map.set(plan.plan_date, list);
    }
    return map;
  }, [plans]);

  function isExpanded(key: string): boolean {
    return expandedKeys[key] === true;
  }

  function toggleExpanded(key: string) {
    setExpandedKeys((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  async function handleCreate(
    date: string,
    title: string,
    scope: PlanItemScope,
  ) {
    if (isBigBoss || planUserId == null) return;
    const created = await createPlanRequest({
      planDate: date,
      title,
      scope,
    });
    setPlans((current) => [...current, created]);
  }

  async function handleUpdate(
    id: number,
    patch: {
      title?: string;
      status?: PlanItemStatus;
      note?: string;
      notDoneReason?: string;
    },
  ) {
    const updated = await updatePlanRequest({ id, ...patch });
    setPlans((current) =>
      current.map((item) => (item.id === id ? updated : item)),
    );
  }

  async function handleDelete(id: number) {
    await deletePlanRequest(id);
    setPlans((current) => current.filter((item) => item.id !== id));
  }

  const planBoard = (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200">
          {isBigBoss && selectedMember
            ? `${selectedMember.name}'s plan${rangeLabel ? ` · ${rangeLabel}` : ""}`
            : (rangeLabel ?? "Plan weeks")}
        </div>

        {isBigBoss && planUserId == null ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {members.length === 0
              ? "No members found."
              : "Select a member to view their plan."}
          </p>
        ) : loading ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Loading plans…
          </p>
        ) : weeks.length === 0 || !monthKey ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No target week range set. Ask BigBoss to set Financial plan weeks
            first.
          </p>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            <PlanGroupCard
              variant="month"
              title="Month goals"
              subtitle={rangeLabel ?? undefined}
              items={monthPlans}
              expanded={isExpanded("month")}
              readOnly={isBigBoss}
              onToggle={() => toggleExpanded("month")}
              onCreate={(title) => handleCreate(monthKey, title, "month")}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />

            <div className="overflow-x-auto">
              <div
                className="grid gap-0"
                style={{
                  gridTemplateColumns: `repeat(${weeks.length}, minmax(16rem, 1fr))`,
                }}
              >
                {weeks.map((week, weekIndex) => (
                  <div
                    key={week.key}
                    className={`min-w-0 border-slate-200 p-3 dark:border-slate-700 ${
                      weekIndex > 0 ? "border-l" : ""
                    }`}
                  >
                    <h2 className="mb-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {week.label}
                    </h2>
                    <p className="mb-3 text-center text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                      {formatMonthDay(week.key)} – {formatMonthDay(week.endKey)}
                    </p>
                    <div className="flex flex-col gap-2">
                      <PlanGroupCard
                        variant="week"
                        title="Week goals"
                        subtitle={`${formatMonthDay(week.key)} – ${formatMonthDay(week.endKey)}`}
                        items={week.days.flatMap(
                          (day) => weekPlansByKey.get(day) ?? [],
                        )}
                        expanded={isExpanded(`week:${week.key}`)}
                        readOnly={isBigBoss}
                        onToggle={() => toggleExpanded(`week:${week.key}`)}
                        onCreate={(title) =>
                          handleCreate(week.key, title, "week")
                        }
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                      />
                      {week.days.map((date) => (
                        <PlanGroupCard
                          key={date}
                          variant="day"
                          title={formatDayLabel(date)}
                          items={dayPlansByDate.get(date) ?? []}
                          expanded={isExpanded(`day:${date}`)}
                          readOnly={isBigBoss}
                          onToggle={() => toggleExpanded(`day:${date}`)}
                          onCreate={(title) =>
                            handleCreate(date, title, "day")
                          }
                          onUpdate={handleUpdate}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Plan
        </h1>
        <p className="mt-1 text-slate-600">
          {isBigBoss
            ? "Select a member to review their month, week, and day plans. Viewing only — members manage their own plans."
            : "Set month and week goals, then break work into day plans. Only today opens by default. Borders turn green when every item is done."}
        </p>
        {rangeLabel ? (
          <p className="mt-1 text-sm text-slate-500">{rangeLabel}</p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {isBigBoss ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <aside className="w-full shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 lg:w-64">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200">
              Members
            </div>
            {members.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">
                No members yet.
              </p>
            ) : (
              <ul className="max-h-[70vh] overflow-y-auto py-1">
                {members.map((member) => {
                  const selected = member.id === selectedMemberId;
                  return (
                    <li key={member.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberId(member.id)}
                        className={`flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors ${
                          selected
                            ? "bg-sky-700 text-white"
                            : "text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span className="text-sm font-medium">{member.name}</span>
                        <span
                          className={`text-xs ${
                            selected
                              ? "text-sky-100"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {member.role}
                          {member.sub_team ? ` · ${member.sub_team}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
          <div className="min-w-0 flex-1">{planBoard}</div>
        </div>
      ) : (
        planBoard
      )}
    </div>
  );
}
