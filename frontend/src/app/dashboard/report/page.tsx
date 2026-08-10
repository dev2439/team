"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchWeekReports,
  saveTodayReport,
  type WeekDayReport,
} from "@/lib/reports";

const COLUMNS = [
  "Day",
  "Working time",
  "Bid",
  "Message",
  "Call",
  "Offer",
  "Accounts",
] as const;

type EditableKey = "workingTime" | "message" | "call" | "offer" | "accounts";

type RowMetrics = {
  workingTime: string;
  bid: string;
  message: string;
  call: string;
  offer: string;
  accounts: string;
};

type ReportRow = {
  day: string;
  date: string;
  isToday: boolean;
  metrics: RowMetrics;
};

const EDITABLE_KEYS: EditableKey[] = [
  "workingTime",
  "message",
  "call",
  "offer",
  "accounts",
];

function toNumber(raw: string, isFloat: boolean): number {
  if (raw.trim() === "") return 0;
  const value = isFloat ? Number.parseFloat(raw) : Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

function formatTotal(value: number, isFloat = false) {
  if (isFloat) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

function mapApiDay(day: WeekDayReport): ReportRow {
  return {
    day: day.day,
    date: day.date,
    isToday: day.is_today,
    metrics: {
      workingTime: String(day.working_time),
      bid: String(day.bid),
      message: String(day.message),
      call: String(day.call),
      offer: String(day.offer),
      accounts: String(day.accounts),
    },
  };
}

export default function ReportPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadWeek = useCallback(async () => {
    try {
      const week = await fetchWeekReports();
      setRows(week.days.map(mapApiDay));
      setDirty(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  const todayRow = useMemo(
    () => rows.find((row) => row.isToday) ?? null,
    [rows],
  );

  useEffect(() => {
    if (!dirty || !todayRow) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");

    saveTimer.current = setTimeout(() => {
      void (async () => {
        try {
          await saveTodayReport({
            working_time: toNumber(todayRow.metrics.workingTime, true),
            message: toNumber(todayRow.metrics.message, false),
            call: toNumber(todayRow.metrics.call, false),
            offer: toNumber(todayRow.metrics.offer, false),
            accounts: toNumber(todayRow.metrics.accounts, false),
          });
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      })();
    }, 600);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dirty, todayRow]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        workingTime:
          acc.workingTime + toNumber(row.metrics.workingTime, true),
        bid: acc.bid + toNumber(row.metrics.bid, false),
        message: acc.message + toNumber(row.metrics.message, false),
        call: acc.call + toNumber(row.metrics.call, false),
        offer: acc.offer + toNumber(row.metrics.offer, false),
        accounts: acc.accounts + toNumber(row.metrics.accounts, false),
      }),
      {
        workingTime: 0,
        bid: 0,
        message: 0,
        call: 0,
        offer: 0,
        accounts: 0,
      },
    );
  }, [rows]);

  function updateTodayMetric(key: EditableKey, raw: string) {
    setDirty(true);
    setRows((current) =>
      current.map((row) =>
        row.isToday
          ? {
              ...row,
              metrics: {
                ...row.metrics,
                [key]: raw,
              },
            }
          : row,
      ),
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-7xl flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Report
        </h1>
        <p className="mt-1 text-slate-600">
          Current week through today
          {todayRow ? ` (${todayRow.day})` : ""}. Bid counts come from your
          bids. Edits auto-save.
          {saveState === "saving" && (
            <span className="ml-2 text-slate-400">Saving…</span>
          )}
          {saveState === "saved" && (
            <span className="ml-2 text-emerald-600">Saved</span>
          )}
          {saveState === "error" && (
            <span className="ml-2 text-red-600">Save failed</span>
          )}
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2 lg:items-start">
        <section className="min-w-0">
          <div className="rounded-2xl border border-slate-200 bg-white">
            {loading ? (
              <p className="px-4 py-6 text-sm text-slate-500">Loading week…</p>
            ) : error ? (
              <p className="px-4 py-6 text-sm text-red-600">{error}</p>
            ) : (
              <table className="w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    {COLUMNS.map((column) => (
                      <th
                        key={column}
                        className="px-1.5 py-2 text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500 sm:px-2 sm:text-xs"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.date}
                      className={`border-b border-slate-200 ${
                        row.isToday ? "bg-sky-50/70" : "bg-white"
                      }`}
                    >
                      <td className="px-1.5 py-2 font-medium text-slate-900 sm:px-2">
                        <span className="block truncate">{row.day}</span>
                        {row.isToday && (
                          <span className="block text-[10px] font-normal text-sky-700">
                            Today
                          </span>
                        )}
                      </td>

                      <td className="px-1 py-1.5 sm:px-1.5">
                        {row.isToday ? (
                          <input
                            type="text"
                            value={row.metrics.workingTime}
                            onChange={(event) =>
                              updateTodayMetric(
                                "workingTime",
                                event.target.value,
                              )
                            }
                            className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
                          />
                        ) : (
                          <span className="block truncate px-1.5 py-1 text-slate-500">
                            {row.metrics.workingTime}
                          </span>
                        )}
                      </td>

                      <td className="px-1 py-1.5 sm:px-1.5">
                        <span className="block truncate px-1.5 py-1 text-slate-500">
                          {row.metrics.bid}
                        </span>
                      </td>

                      {EDITABLE_KEYS.filter((key) => key !== "workingTime").map(
                        (key) => (
                          <td key={key} className="px-1 py-1.5 sm:px-1.5">
                            {row.isToday ? (
                              <input
                                type="text"
                                value={row.metrics[key]}
                                onChange={(event) =>
                                  updateTodayMetric(key, event.target.value)
                                }
                                className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
                              />
                            ) : (
                              <span className="block truncate px-1.5 py-1 text-slate-500">
                                {row.metrics[key]}
                              </span>
                            )}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50">
                    <td className="px-1.5 py-2 font-semibold text-slate-900 sm:px-2">
                      Total
                    </td>
                    <td className="px-1.5 py-2 font-semibold text-slate-900 sm:px-2">
                      {formatTotal(totals.workingTime, true)}
                    </td>
                    <td className="px-1.5 py-2 font-semibold text-slate-900 sm:px-2">
                      {formatTotal(totals.bid)}
                    </td>
                    <td className="px-1.5 py-2 font-semibold text-slate-900 sm:px-2">
                      {formatTotal(totals.message)}
                    </td>
                    <td className="px-1.5 py-2 font-semibold text-slate-900 sm:px-2">
                      {formatTotal(totals.call)}
                    </td>
                    <td className="px-1.5 py-2 font-semibold text-slate-900 sm:px-2">
                      {formatTotal(totals.offer)}
                    </td>
                    <td className="px-1.5 py-2 font-semibold text-slate-900 sm:px-2">
                      {formatTotal(totals.accounts)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8">
          <p className="text-center text-sm text-slate-500">
            Right panel placeholder. Tell me what should go here and I will add
            it.
          </p>
        </section>
      </div>
    </div>
  );
}
