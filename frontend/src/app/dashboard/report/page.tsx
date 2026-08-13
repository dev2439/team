"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART_GRID_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_WRAPPER_STYLE,
} from "@/lib/chartTheme";
import {
  fetchSubTeamWeekReports,
  fetchWeekReports,
  saveDayReport,
  type SubTeamWeekReports,
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

const SERIES = [
  { key: "working_time", label: "Working time", color: "#0f766e" },
  { key: "bid", label: "Bid", color: "#0284c7" },
  { key: "message", label: "Message", color: "#059669" },
  { key: "call", label: "Call", color: "#d97706" },
  { key: "offer", label: "Offer", color: "#7c3aed" },
  { key: "accounts", label: "Accounts", color: "#e11d48" },
] as const;

const MAX_METRIC = 100;

function toNumber(raw: string, isFloat: boolean): number {
  if (raw.trim() === "") return 0;
  const value = isFloat ? Number.parseFloat(raw) : Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

function isMetricInput(raw: string, allowDecimal: boolean): boolean {
  if (raw.trim() === "") return true;
  if (allowDecimal) {
    return /^\d*\.?\d*$/.test(raw);
  }
  return /^\d*$/.test(raw);
}

function isMetricWithinMax(raw: string): boolean {
  if (raw.trim() === "" || raw === ".") return true;
  const value = Number(raw);
  return Number.isFinite(value) && value <= MAX_METRIC;
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

function dayShort(day: string): string {
  return day.slice(0, 3);
}

export default function ReportPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [teamWeek, setTeamWeek] = useState<SubTeamWeekReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirtyDate, setDirtyDate] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [hoveredMemberId, setHoveredMemberId] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadWeek = useCallback(async () => {
    try {
      const [week, subTeamWeek] = await Promise.all([
        fetchWeekReports(),
        fetchSubTeamWeekReports(),
      ]);
      setRows(week.days.map(mapApiDay));
      setTeamWeek(subTeamWeek);
      setDirtyDate(null);
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

  const dirtyRow = useMemo(
    () => (dirtyDate ? (rows.find((row) => row.date === dirtyDate) ?? null) : null),
    [dirtyDate, rows],
  );

  useEffect(() => {
    if (!dirtyDate || !dirtyRow) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");

    saveTimer.current = setTimeout(() => {
      void (async () => {
        try {
          await saveDayReport({
            date: dirtyRow.date,
            working_time: toNumber(dirtyRow.metrics.workingTime, true),
            message: toNumber(dirtyRow.metrics.message, false),
            call: toNumber(dirtyRow.metrics.call, false),
            offer: toNumber(dirtyRow.metrics.offer, false),
            accounts: toNumber(dirtyRow.metrics.accounts, false),
          });
          setSaveState("saved");
          setDirtyDate(null);
          const subTeamWeek = await fetchSubTeamWeekReports();
          setTeamWeek(subTeamWeek);
        } catch {
          setSaveState("error");
        }
      })();
    }, 600);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dirtyDate, dirtyRow]);

  const totals = useMemo(() => {
    if (rows.length === 0) {
      return {
        workingTime: 0,
        bid: 0,
        message: 0,
        call: 0,
        offer: 0,
        accounts: 0,
      };
    }

    let workingTimeSum = 0;
    let bid = 0;
    let message = 0;
    let call = 0;
    let offer = 0;
    let accounts = 0;

    for (const row of rows) {
      workingTimeSum += toNumber(row.metrics.workingTime, true);
      bid += toNumber(row.metrics.bid, false);
      message += toNumber(row.metrics.message, false);
      call += toNumber(row.metrics.call, false);
      offer += toNumber(row.metrics.offer, false);
      accounts = Math.max(accounts, toNumber(row.metrics.accounts, false));
    }

    return {
      workingTime: workingTimeSum / rows.length,
      bid,
      message,
      call,
      offer,
      accounts,
    };
  }, [rows]);

  const dailyChartData = useMemo(
    () =>
      (teamWeek?.days ?? []).map((day) => ({
        day: dayShort(day.day),
        working_time: day.working_time,
        bid: day.bid,
        message: day.message,
        call: day.call,
        offer: day.offer,
        accounts: day.accounts,
      })),
    [teamWeek],
  );

  const memberDailyCharts = useMemo(
    () =>
      (teamWeek?.members ?? []).map((member) => ({
        userId: member.user_id,
        name: member.user_name,
        days: (member.days ?? []).map((day) => ({
          day: dayShort(day.day),
          working_time: day.working_time,
          bid: day.bid,
          message: day.message,
          call: day.call,
          offer: day.offer,
          accounts: day.accounts,
        })),
      })),
    [teamWeek],
  );

  function updateDayMetric(date: string, key: EditableKey, raw: string) {
    const allowDecimal = key === "workingTime";
    if (!isMetricInput(raw, allowDecimal)) return;
    if (!isMetricWithinMax(raw)) return;

    setDirtyDate(date);
    setRows((current) =>
      current.map((row) =>
        row.date === date
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 lg:h-[calc(100vh-8rem)]">
      <div className="shrink-0">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Report
        </h1>
        <p className="mt-1 text-slate-600">
          Full week view
          {todayRow ? ` — today is ${todayRow.day}` : ""}. Every day is
          editable. Bid counts come from your bids. Edits auto-save.
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

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2 lg:items-stretch lg:overflow-hidden">
        <section className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-hidden">
          <div className="shrink-0 rounded-2xl border border-slate-200 bg-white">
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
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.metrics.workingTime}
                          onChange={(event) =>
                            updateDayMetric(
                              row.date,
                              "workingTime",
                              event.target.value,
                            )
                          }
                          className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
                        />
                      </td>

                      <td className="px-1 py-1.5 sm:px-1.5">
                        <span className="block truncate px-1.5 py-1 text-slate-500">
                          {row.metrics.bid}
                        </span>
                      </td>

                      {EDITABLE_KEYS.filter((key) => key !== "workingTime").map(
                        (key) => (
                          <td key={key} className="px-1 py-1.5 sm:px-1.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={row.metrics[key]}
                              onChange={(event) =>
                                updateDayMetric(
                                  row.date,
                                  key,
                                  event.target.value,
                                )
                              }
                              className="w-full min-w-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
                            />
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

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 shrink-0">
              <h2 className="text-sm font-semibold text-slate-900">
                Sub team daily totals
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {teamWeek?.sub_team_name
                  ? `${teamWeek.sub_team_name} — report metrics + bid URL counts`
                  : "Your sub team — report metrics + bid URL counts"}
              </p>
            </div>

            {loading ? (
              <p className="flex flex-1 items-center justify-center text-sm text-slate-500">
                Loading chart…
              </p>
            ) : dailyChartData.length === 0 ? (
              <p className="flex flex-1 items-center justify-center text-sm text-slate-500">
                No sub team data this week.
              </p>
            ) : (
              <div className="min-h-0 w-full flex-1 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dailyChartData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={36} />
                    <Tooltip
                      allowEscapeViewBox={{ x: false, y: false }}
                      wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                      contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                      labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {SERIES.map((series) => (
                      <Line
                        key={series.key}
                        type="monotone"
                        dataKey={series.key}
                        name={series.label}
                        stroke={series.color}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-[36rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 lg:h-full lg:min-h-0">
          <div className="mb-2 shrink-0">
            <h2 className="text-sm font-semibold text-slate-900">
              Member daily reports
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Each sub team member — every day this week
            </p>
          </div>

          {loading ? (
            <p className="flex flex-1 items-center justify-center text-sm text-slate-500">
              Loading chart…
            </p>
          ) : memberDailyCharts.length === 0 ? (
            <p className="flex flex-1 items-center justify-center text-sm text-slate-500">
              No members to chart.
            </p>
          ) : (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {memberDailyCharts.map((member) => (
                <div
                  key={member.userId}
                  onMouseEnter={() => setHoveredMemberId(member.userId)}
                  onMouseLeave={() => setHoveredMemberId(null)}
                  className={`relative rounded-xl border border-slate-100 bg-white p-3 shadow-sm ${
                    hoveredMemberId === member.userId ? "z-30" : "z-0"
                  }`}
                >
                  <h3 className="mb-2 text-xs font-semibold text-slate-800">
                    {member.name}
                  </h3>
                  <div className="relative h-44 w-full overflow-visible [&_.recharts-tooltip-wrapper]:!z-50 [&_.recharts-default-tooltip]:!bg-white [&_.recharts-default-tooltip]:!opacity-100">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={member.days}
                        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                      >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={CHART_GRID_STROKE}
                          />
                          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} width={32} />
                          <Tooltip
                            wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                            contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        {SERIES.map((series) => (
                          <Line
                            key={series.key}
                            type="monotone"
                            dataKey={series.key}
                            name={series.label}
                            stroke={series.color}
                            strokeWidth={2}
                            dot={{ r: 2 }}
                            activeDot={{ r: 4 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
