"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchFinancialRange,
  saveFinancial,
  type FinancialType,
} from "@/lib/financials";
import { fetchSubTeams, type SubTeam } from "@/lib/sub-teams";
import { fetchTarget, type Target } from "@/lib/targets";

const ROWS_PER_MEMBER = 3;

const MEMBER_COLUMNS = [
  "Name",
  "In",
  "UMS",
  "Out",
  "Current",
] as const;

const DAY_LIKE_COLUMNS = ["Des"] as const;

const DES_ROW_LABELS = ["In", "UMS", "Out"] as const;

const DES_TO_TYPE: Record<(typeof DES_ROW_LABELS)[number], FinancialType> = {
  In: "in",
  UMS: "ums",
  Out: "out",
};

const TYPE_TO_DES: Record<FinancialType, (typeof DES_ROW_LABELS)[number]> = {
  in: "In",
  ums: "UMS",
  out: "Out",
};

const dayColumnClass =
  "w-10 min-w-10 max-w-10 border-r border-slate-200 px-0.5 py-1.5 text-center text-[10px] font-semibold tracking-wide text-slate-500";

const metaColumnClass =
  "min-w-12 border-r border-slate-200 px-1.5 py-1.5 text-center text-xs font-semibold tracking-wide text-slate-500";

const dayCellClass =
  "relative w-10 min-w-10 max-w-10 border-r border-slate-200 p-0 text-center";

const metaCellClass =
  "min-w-12 border-r border-slate-200 px-1.5 py-1 text-center";

type DateColumn = {
  key: string;
  label: string;
};

function dayValueKey(memberId: number, des: string, dateKey: string) {
  return `${memberId}:${des}:${dateKey}`;
}

function isDoubleInput(raw: string): boolean {
  if (raw.trim() === "") return true;
  return /^-?\d*\.?\d*$/.test(raw);
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toLocalDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getTargetDateColumns(target: Target | null): DateColumn[] {
  if (!target) return [];

  const weekCount = Math.max(0, Math.trunc(Number(target.week) || 0));
  const dayCount = weekCount * 7;
  if (dayCount === 0) return [];

  const start = toLocalDate(target.created_at);

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    return {
      key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      label: formatMonthDay(date),
    };
  });
}

function parseAmount(raw: string): number {
  if (raw.trim() === "") return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function formatTotal(value: number): string {
  if (Object.is(value, -0)) return "0";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000);
}

function sumMemberDes(
  amounts: Record<string, string>,
  memberId: number,
  des: (typeof DES_ROW_LABELS)[number],
  dateKeys: string[],
): number {
  return dateKeys.reduce((total, dateKey) => {
    return total + parseAmount(amounts[dayValueKey(memberId, des, dateKey)] ?? "");
  }, 0);
}

function ExcelDayCell({
  value,
  note,
  editable,
  editing,
  onStartEdit,
  onChange,
  onCommitAmount,
  onChangeNote,
  onCommitNote,
}: {
  value: string;
  note: string;
  editable: boolean;
  editing: boolean;
  onStartEdit: () => void;
  onChange: (raw: string) => void;
  onCommitAmount: (raw: string) => void;
  onChangeNote: (raw: string) => void;
  onCommitNote: (raw: string) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const [draftNote, setDraftNote] = useState(note);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(note);
  const notePropRef = useRef(note);
  const noteOpenRef = useRef(false);
  const noteFocusedRef = useRef(false);

  draftRef.current = draftNote;
  notePropRef.current = note;
  noteFocusedRef.current = noteFocused;

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openNote() {
    clearCloseTimer();
    if (!noteOpenRef.current) {
      setDraftNote(notePropRef.current);
      draftRef.current = notePropRef.current;
    }
    noteOpenRef.current = true;
    setNoteOpen(true);
  }

  function commitDraftNote() {
    const next = draftRef.current;
    onChangeNote(next);
    onCommitNote(next);
  }

  function closeNote() {
    clearCloseTimer();
    if (editable) {
      commitDraftNote();
    }
    noteFocusedRef.current = false;
    noteOpenRef.current = false;
    setNoteFocused(false);
    setNoteOpen(false);
  }

  function scheduleCloseNote() {
    if (noteFocusedRef.current) return;
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      if (noteFocusedRef.current) return;
      closeNote();
    }, 250);
  }

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  return (
    <td
      className={dayCellClass}
      onMouseEnter={openNote}
      onMouseLeave={scheduleCloseNote}
    >
      {(note.trim() !== "" || draftNote.trim() !== "") && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 z-10 h-0 w-0 border-t-[7px] border-l-[7px] border-t-amber-500 border-l-transparent"
        />
      )}

      {editing && editable ? (
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onCommitAmount(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
          className="h-7 w-full border-0 bg-sky-50 px-0.5 text-center text-xs text-slate-900 outline-none ring-1 ring-inset ring-sky-400"
        />
      ) : (
        <button
          type="button"
          disabled={!editable}
          onClick={() => {
            if (editable) onStartEdit();
          }}
          className={`flex h-7 w-full items-center justify-center px-0.5 text-xs ${
            editable
              ? "cursor-cell text-slate-800 hover:bg-slate-50"
              : "cursor-default text-slate-500"
          }`}
        >
          {value === "" ? <span className="text-transparent">0</span> : value}
        </button>
      )}

      {noteOpen && (
        <div
          className="absolute top-full left-1/2 z-40 w-72 -translate-x-1/2 pt-1"
          onMouseEnter={openNote}
          onMouseLeave={scheduleCloseNote}
        >
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                Note
              </p>
              {editable && (
                <button
                  type="button"
                  onClick={closeNote}
                  className="text-[10px] font-medium text-amber-800 hover:text-amber-950"
                >
                  Save
                </button>
              )}
            </div>
            {editable ? (
              <textarea
                value={draftNote}
                rows={8}
                onFocus={() => {
                  clearCloseTimer();
                  setNoteFocused(true);
                }}
                onChange={(event) => {
                  const next = event.target.value;
                  setDraftNote(next);
                  onChangeNote(next);
                }}
                onBlur={() => {
                  setNoteFocused(false);
                  commitDraftNote();
                }}
                placeholder="Add note…"
                className="min-h-40 w-full resize-y rounded border border-amber-200 bg-white px-2 py-2 text-sm leading-5 text-slate-800 outline-none focus:border-amber-400"
              />
            ) : (
              <p className="min-h-40 whitespace-pre-wrap text-sm leading-5 text-slate-700">
                {note.trim() === "" ? "No note" : note}
              </p>
            )}
          </div>
        </div>
      )}
    </td>
  );
}

function MemberSpanCell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      rowSpan={ROWS_PER_MEMBER}
      className={`border-r border-slate-200 bg-white px-3 py-2.5 align-middle whitespace-nowrap text-slate-900 ${className}`}
    >
      {children}
    </td>
  );
}

export default function FinancialPage() {
  const [teams, setTeams] = useState<SubTeam[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const today = useMemo(() => todayKey(), []);
  const dateColumns = useMemo(() => getTargetDateColumns(target), [target]);

  const rangeLabel = useMemo(() => {
    if (dateColumns.length === 0) {
      return "No target week range set";
    }
    const first = dateColumns[0]!;
    const last = dateColumns[dateColumns.length - 1]!;
    return `${first.label} – ${last.label} (${target?.week ?? 0} week${target?.week === 1 ? "" : "s"} from target created date). Only today (${formatMonthDay(new Date())}) is editable.`;
  }, [dateColumns, target?.week]);

  const loadData = useCallback(async () => {
    try {
      const [subTeams, nextTarget] = await Promise.all([
        fetchSubTeams(),
        fetchTarget(),
      ]);
      setTeams(subTeams);
      setTarget(nextTarget);

      const columns = getTargetDateColumns(nextTarget);
      if (columns.length > 0) {
        const from = columns[0]!.key;
        const to = columns[columns.length - 1]!.key;
        const entries = await fetchFinancialRange(from, to);
        const nextAmounts: Record<string, string> = {};
        const nextNotes: Record<string, string> = {};

        for (const entry of entries) {
          const type = entry.type.toLowerCase();
          if (!(type in TYPE_TO_DES)) continue;
          const des = TYPE_TO_DES[type as FinancialType];
          const key = dayValueKey(entry.user_id, des, entry.day);
          nextAmounts[key] = String(entry.amount);
          nextNotes[key] = entry.note ?? "";
        }

        setAmounts(nextAmounts);
        setNotes(nextNotes);
      } else {
        setAmounts({});
        setNotes({});
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load financial data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function persistCell(
    memberId: number,
    des: (typeof DES_ROW_LABELS)[number],
    dateKey: string,
    nextAmount: string,
    nextNote: string,
  ) {
    if (dateKey !== today) return;

    try {
      await saveFinancial({
        user_id: memberId,
        amount: parseAmount(nextAmount),
        type: DES_TO_TYPE[des],
        note: nextNote,
        day: dateKey,
      });
      setSaveError(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  function updateAmount(
    memberId: number,
    des: (typeof DES_ROW_LABELS)[number],
    dateKey: string,
    raw: string,
  ) {
    if (!isDoubleInput(raw)) return;
    const key = dayValueKey(memberId, des, dateKey);
    setAmounts((current) => ({ ...current, [key]: raw }));
  }

  function updateNote(
    memberId: number,
    des: (typeof DES_ROW_LABELS)[number],
    dateKey: string,
    raw: string,
  ) {
    const key = dayValueKey(memberId, des, dateKey);
    setNotes((current) => ({ ...current, [key]: raw }));
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Financial
        </h1>
        <p className="mt-1 text-slate-600">{rangeLabel}</p>
        {saveError && <p className="mt-1 text-sm text-red-600">{saveError}</p>}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading financial data…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {teams.map((team) => {
            const totalRows = Math.max(team.members.length, 1) * ROWS_PER_MEMBER;
            const trailingColCount =
              DAY_LIKE_COLUMNS.length + dateColumns.length;

            return (
              <section key={team.id} className="min-w-0">
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="w-max min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left">
                        <th className="sticky left-0 z-20 min-w-16 border-r border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Team
                        </th>
                        {MEMBER_COLUMNS.map((column) => (
                          <th
                            key={column}
                            className="min-w-28 border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
                          >
                            {column}
                          </th>
                        ))}
                        {DAY_LIKE_COLUMNS.map((column) => (
                          <th key={column} className={metaColumnClass}>
                            {column}
                          </th>
                        ))}
                        {dateColumns.map((column) => (
                          <th
                            key={column.key}
                            className={`${dayColumnClass} ${
                              column.key === today ? "bg-sky-50 text-sky-700" : ""
                            }`}
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {team.members.length === 0 ? (
                        <tr>
                          <td
                            rowSpan={ROWS_PER_MEMBER}
                            className="border-r border-slate-200 bg-slate-50 px-2 py-4 text-center align-middle font-semibold text-slate-900"
                          >
                            <span className="inline-block max-h-40 rotate-180 [writing-mode:vertical-rl]">
                              {team.name}
                            </span>
                          </td>
                          <td
                            colSpan={MEMBER_COLUMNS.length + trailingColCount}
                            className="px-3 py-6 text-center text-slate-500"
                          >
                            No members in this sub team.
                          </td>
                        </tr>
                      ) : (
                        team.members.map((member, memberIndex) => {
                          const dateKeys = dateColumns.map((column) => column.key);
                          const inTotal = sumMemberDes(
                            amounts,
                            member.id,
                            "In",
                            dateKeys,
                          );
                          const umsTotal = sumMemberDes(
                            amounts,
                            member.id,
                            "UMS",
                            dateKeys,
                          );
                          const outTotal = sumMemberDes(
                            amounts,
                            member.id,
                            "Out",
                            dateKeys,
                          );
                          const current =
                            (Number(member.balance) || 0) +
                            inTotal -
                            umsTotal -
                            outTotal;

                          return Array.from(
                            { length: ROWS_PER_MEMBER },
                            (_, rowIndex) => (
                            <tr
                              key={`${member.id}-${rowIndex}`}
                              className="border-b border-slate-200"
                            >
                              {memberIndex === 0 && rowIndex === 0 ? (
                                <td
                                  rowSpan={totalRows}
                                  className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-2 py-3 text-center align-middle font-semibold text-slate-900"
                                >
                                  <span className="inline-block max-h-[28rem] rotate-180 [writing-mode:vertical-rl]">
                                    {team.name}
                                  </span>
                                </td>
                              ) : null}

                              {rowIndex === 0 ? (
                                <>
                                  <MemberSpanCell className="font-medium">
                                    {member.name}
                                  </MemberSpanCell>
                                  <MemberSpanCell className="text-center tabular-nums text-slate-800">
                                    {formatTotal(inTotal)}
                                  </MemberSpanCell>
                                  <MemberSpanCell className="text-center tabular-nums text-slate-800">
                                    {formatTotal(umsTotal)}
                                  </MemberSpanCell>
                                  <MemberSpanCell className="text-center tabular-nums text-slate-800">
                                    {formatTotal(outTotal)}
                                  </MemberSpanCell>
                                  <MemberSpanCell className="text-center tabular-nums font-medium text-slate-900">
                                    {formatTotal(current)}
                                  </MemberSpanCell>
                                </>
                              ) : null}

                              {DAY_LIKE_COLUMNS.map((column) => (
                                <td
                                  key={column}
                                  className={
                                    column === "Des"
                                      ? `${metaCellClass} font-medium text-slate-700`
                                      : metaCellClass
                                  }
                                >
                                  {column === "Des"
                                    ? DES_ROW_LABELS[rowIndex]
                                    : "—"}
                                </td>
                              ))}

                              {dateColumns.map((column) => {
                                const des = DES_ROW_LABELS[rowIndex]!;
                                const key = dayValueKey(
                                  member.id,
                                  des,
                                  column.key,
                                );
                                const editable = column.key === today;
                                const amount = amounts[key] ?? "";
                                const note = notes[key] ?? "";

                                return (
                                  <ExcelDayCell
                                    key={column.key}
                                    value={amount}
                                    note={note}
                                    editable={editable}
                                    editing={editingKey === key}
                                    onStartEdit={() => setEditingKey(key)}
                                    onChange={(raw) =>
                                      updateAmount(
                                        member.id,
                                        des,
                                        column.key,
                                        raw,
                                      )
                                    }
                                    onCommitAmount={(raw) => {
                                      setEditingKey(null);
                                      updateAmount(
                                        member.id,
                                        des,
                                        column.key,
                                        raw,
                                      );
                                      void persistCell(
                                        member.id,
                                        des,
                                        column.key,
                                        raw,
                                        notes[key] ?? note,
                                      );
                                    }}
                                    onChangeNote={(raw) =>
                                      updateNote(
                                        member.id,
                                        des,
                                        column.key,
                                        raw,
                                      )
                                    }
                                    onCommitNote={(raw) => {
                                      updateNote(
                                        member.id,
                                        des,
                                        column.key,
                                        raw,
                                      );
                                      void persistCell(
                                        member.id,
                                        des,
                                        column.key,
                                        amounts[key] ?? amount,
                                        raw,
                                      );
                                    }}
                                  />
                                );
                              })}
                            </tr>
                            ),
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
