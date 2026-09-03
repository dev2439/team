"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchCurrentUser, type PublicUser } from "@/lib/auth";
import { fetchTeamBids, type TeamBid } from "@/lib/bids";
import {
  CHART_GRID_STROKE,
  CHART_TOOLTIP_CONTENT_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_WRAPPER_STYLE,
} from "@/lib/chartTheme";
import {
  createBidDepositForUser,
  fetchDeposits,
  type Deposit,
} from "@/lib/deposits";
import { fetchSubTeams, type SubTeam } from "@/lib/sub-teams";
import { fetchTarget, type Target } from "@/lib/targets";

const MEMBER_COLUMNS = ["Name", "CUR"] as const;

const MEMBER_COLUMN_WIDTH: Record<(typeof MEMBER_COLUMNS)[number], string> = {
  Name: "w-[20%]",
  CUR: "w-[16%]",
};

const BID_ROW_KEY = "Bid";
const BID_ROW_LABEL = "Bid";
const MAX_BID_AMOUNT = 99999;

const weekColumnClass =
  "border-r border-slate-200 px-0.5 py-1.5 text-center text-[10px] font-semibold tracking-wide text-slate-500";

const weekCellClass =
  "relative overflow-hidden border-r border-slate-200 p-0 text-center";

const teamColumnClass =
  "w-8 border-r border-slate-200 bg-slate-50 px-0.5 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500";

const teamCellClass =
  "w-8 border-r border-slate-200 bg-slate-50 px-0.5 py-3 text-center align-middle font-semibold text-slate-900";

const desColumnClass =
  "w-[12%] border-r border-slate-200 px-0.5 py-1.5 text-center text-xs font-semibold tracking-wide text-slate-500";

const desCellClass =
  "w-[12%] overflow-hidden border-r border-slate-200 px-0.5 py-1 text-center text-xs font-medium text-slate-700";

type WeekColumn = {
  key: string;
  label: string;
  endKey: string;
  editable: boolean;
};

type MemberRow = {
  key: string;
  label: string;
};

type MemberChartRow = {
  name: string;
  /** Bar height and top label */
  amount: number;
  /** Optional value shown under the member name */
  underNameValue?: number;
};

type TeamChartStats = {
  teamId: number;
  teamName: string;
  depositChart: MemberChartRow[];
  bidPriceChart: MemberChartRow[];
  depositAverage: number;
};

function dayValueKey(memberId: number, rowKey: string, dateKey: string) {
  return `${memberId}:${rowKey}:${dateKey}`;
}

function isBidProjectName(name: string): boolean {
  return name.trim().toLowerCase() === "bid";
}

function isDoubleInput(raw: unknown): boolean {
  const text = String(raw ?? "");
  if (text.trim() === "") return true;
  return /^-?\d*\.?\d*$/.test(text);
}

function isBidAmountWithinMax(raw: unknown): boolean {
  const text = String(raw ?? "").trim();
  if (text === "" || text === "-" || text === "." || text === "-.") {
    return true;
  }
  const value = Number(text);
  return Number.isFinite(value) && Math.abs(value) <= MAX_BID_AMOUNT;
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toLocalDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDepositDate(value: string): string {
  return toLocalDate(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildDepositsByMemberId(deposits: Deposit[]): Map<number, Deposit[]> {
  const map = new Map<number, Deposit[]>();
  for (const deposit of deposits) {
    const current = map.get(deposit.user_id) ?? [];
    current.push(deposit);
    map.set(deposit.user_id, current);
  }
  return map;
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function getTargetWeekColumns(target: Target | null): WeekColumn[] {
  if (!target) return [];

  const weekCount = Math.max(0, Math.trunc(Number(target.week) || 0));
  if (weekCount === 0) return [];

  const start = toLocalDate(target.created_at);
  const today = parseDateKey(todayKey());

  return Array.from({ length: weekCount }, (_, index) => {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + index * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    return {
      key: formatDateKey(weekStart),
      endKey: formatDateKey(weekEnd),
      label: `W${index + 1}`,
      editable: today >= weekStart && today <= weekEnd,
    };
  });
}

function findWeekForDate(
  date: Date,
  columns: WeekColumn[],
): WeekColumn | undefined {
  return columns.find((column) => {
    const start = parseDateKey(column.key);
    const end = parseDateKey(column.endKey);
    return date >= start && date <= end;
  });
}

function isInPlanWeeks(date: Date, columns: WeekColumn[]): boolean {
  return Boolean(findWeekForDate(date, columns));
}

function getMemberRows(
  memberId: number,
  depositsByUser: Map<number, string[]>,
): MemberRow[] {
  const projects = depositsByUser.get(memberId) ?? [];
  return [
    ...projects.map((projectName) => ({
      key: projectName,
      label: projectName,
    })),
    { key: BID_ROW_KEY, label: BID_ROW_LABEL },
  ];
}

function buildDepositsByUser(deposits: Deposit[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const deposit of deposits) {
    const name = deposit.project_name.trim();
    if (!name || isBidProjectName(name)) continue;
    const current = map.get(deposit.user_id) ?? [];
    if (!current.includes(name)) {
      current.push(name);
      map.set(deposit.user_id, current);
    }
  }
  return map;
}

/** CUR = users.balance + project deposit amounts - Bid deposit amounts */
function getMemberCur(balance: number, memberId: number, deposits: Deposit[]) {
  let projectAmount = 0;
  let bidAmount = 0;

  for (const deposit of deposits) {
    if (deposit.user_id !== memberId) continue;
    const amount = Number(deposit.amount) || 0;
    if (isBidProjectName(deposit.project_name)) {
      bidAmount += amount;
    } else {
      projectAmount += amount;
    }
  }

  return (Number(balance) || 0) + projectAmount - bidAmount;
}

function buildAmountsFromDeposits(
  deposits: Deposit[],
  columns: WeekColumn[],
): Record<string, string> {
  const totals: Record<string, number> = {};

  for (const deposit of deposits) {
    const name = deposit.project_name.trim();
    if (!name) continue;
    const rowKey = isBidProjectName(name) ? BID_ROW_KEY : name;
    const week = findWeekForDate(toLocalDate(deposit.created_at), columns);
    if (!week) continue;
    const key = dayValueKey(deposit.user_id, rowKey, week.key);
    totals[key] = (totals[key] ?? 0) + Number(deposit.amount);
  }

  const amounts: Record<string, string> = {};
  for (const [key, value] of Object.entries(totals)) {
    amounts[key] = formatBalance(value);
  }
  return amounts;
}

function parseAmount(raw: unknown): number {
  const text = String(raw ?? "").trim();
  if (text === "") return 0;
  const value = Number(text);
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function formatBalance(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  if (Object.is(rounded, -0)) return "0";
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return formatBalance(Math.round(value * 100) / 100);
}

function buildTeamChartStats(
  teams: SubTeam[],
  deposits: Deposit[],
  bids: TeamBid[],
  columns: WeekColumn[],
): TeamChartStats[] {
  const planDeposits = deposits.filter((deposit) =>
    isInPlanWeeks(toLocalDate(deposit.created_at), columns),
  );

  return teams.map((team) => {
    const memberIds = new Set(team.members.map((member) => member.id));
    const depositTotals = new Map<number, number>();
    const bidAmountByUser = new Map<number, number>();
    const bidCountByUser = new Map<number, number>();

    for (const member of team.members) {
      depositTotals.set(member.id, 0);
      bidAmountByUser.set(member.id, 0);
      bidCountByUser.set(member.id, 0);
    }

    // Deposit chart: non-Bid deposits in plan weeks
    for (const deposit of planDeposits) {
      if (!memberIds.has(deposit.user_id)) continue;
      if (isBidProjectName(deposit.project_name)) continue;
      depositTotals.set(
        deposit.user_id,
        (depositTotals.get(deposit.user_id) ?? 0) +
          (Number(deposit.amount) || 0),
      );
    }

    // Bid amount from deposit where user_id matches member (project_name = Bid)
    for (const deposit of deposits) {
      if (!memberIds.has(deposit.user_id)) continue;
      if (!isBidProjectName(deposit.project_name)) continue;
      bidAmountByUser.set(
        deposit.user_id,
        (bidAmountByUser.get(deposit.user_id) ?? 0) +
          (Number(deposit.amount) || 0),
      );
    }

    // Bid counts from bid table where user_id matches member
    for (const bid of bids) {
      if (!memberIds.has(bid.user_id)) continue;
      bidCountByUser.set(
        bid.user_id,
        (bidCountByUser.get(bid.user_id) ?? 0) + 1,
      );
    }

    const depositChart = team.members.map((member) => ({
      name: member.name,
      amount: depositTotals.get(member.id) ?? 0,
    }));
    const depositTotal = depositChart.reduce(
      (sum, row) => sum + row.amount,
      0,
    );
    const memberCount = Math.max(team.members.length, 1);

    return {
      teamId: team.id,
      teamName: team.name,
      depositChart,
      depositAverage: depositTotal / memberCount,
      bidPriceChart: team.members.map((member) => {
        const bidAmount = bidAmountByUser.get(member.id) ?? 0;
        const bidCount = bidCountByUser.get(member.id) ?? 0;
        return {
          name: member.name,
          amount: bidAmount,
          underNameValue: bidCount > 0 ? bidAmount / bidCount : 0,
        };
      }),
    };
  });
}

function ExcelWeekCell({
  value,
  editable,
  editing,
  memberId,
  onStartEdit,
  onChange,
  onCommitAmount,
}: {
  value: string;
  editable: boolean;
  editing: boolean;
  memberId: number;
  onStartEdit: () => void;
  onChange: (raw: string) => void;
  onCommitAmount: (memberId: number, raw: string) => void;
}) {
  return (
    <td className={weekCellClass}>
      {editing && editable ? (
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(String(event.currentTarget.value))}
          onBlur={(event) =>
            onCommitAmount(
              memberId,
              String(event.currentTarget.value ?? ""),
            )
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
          className="box-border h-7 w-full min-w-0 max-w-full border-0 bg-sky-50 px-0.5 text-center text-xs text-slate-900 outline-none ring-1 ring-inset ring-sky-400"
        />
      ) : (
        <button
          type="button"
          disabled={!editable}
          onClick={() => {
            if (editable) onStartEdit();
          }}
          className={`box-border flex h-7 w-full min-w-0 max-w-full items-center justify-center px-0.5 text-xs ${
            editable
              ? "cursor-cell text-slate-800 hover:bg-slate-50"
              : "cursor-default text-slate-500"
          }`}
        >
          {value === "" ? <span className="text-transparent">0</span> : value}
        </button>
      )}
    </td>
  );
}

function MemberSpanCell({
  children,
  className = "",
  title,
  rowSpan,
  truncate = true,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  rowSpan: number;
  truncate?: boolean;
}) {
  return (
    <td
      rowSpan={rowSpan}
      title={title}
      className={`border-r border-slate-200 bg-white py-2.5 align-middle text-slate-900 ${
        truncate ? "overflow-hidden px-3" : "overflow-visible px-1"
      } ${className}`}
    >
      <div className={truncate ? "truncate" : "whitespace-nowrap text-center"}>
        {children}
      </div>
    </td>
  );
}

function MemberNameCell({
  name,
  history,
  rowSpan,
  className = "",
}: {
  name: string;
  history: Deposit[];
  rowSpan: number;
  className?: string;
}) {
  const cellRef = useRef<HTMLTableCellElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  function showTooltip() {
    const rect = cellRef.current?.getBoundingClientRect();
    if (!rect) return;

    const width = 280;
    const estimatedHeight = Math.min(256, 56 + history.length * 28);
    let left = rect.right + 8;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, rect.left - width - 8);
    }
    let top = rect.top;
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - estimatedHeight - 8);
    }

    setCoords({ top, left });
    setOpen(true);
  }

  return (
    <>
      <td
        ref={cellRef}
        rowSpan={rowSpan}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setOpen(false)}
        className={`border-r border-slate-200 bg-white px-3 py-2.5 align-middle text-slate-900 ${className}`}
      >
        <div className="truncate cursor-default">{name}</div>
      </td>
      {open
        ? createPortal(
            <div
              role="tooltip"
              style={{ top: coords.top, left: coords.left }}
              className="pointer-events-none fixed z-[200] w-[17.5rem] max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/50"
            >
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Deposit history · {name}
              </p>
              {history.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No deposits yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {history.map((deposit) => (
                    <li
                      key={deposit.id}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-2 text-xs text-slate-700 dark:text-slate-200"
                    >
                      <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                        {formatDepositDate(deposit.created_at)}
                      </span>
                      <span className="min-w-0 truncate font-medium">
                        {deposit.project_name}
                      </span>
                      <span className="shrink-0 tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {formatBalance(Number(deposit.amount) || 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function MemberNamePriceTick({
  x,
  y,
  payload,
  data,
}: {
  x?: string | number;
  y?: string | number;
  payload?: { value?: string };
  data: MemberChartRow[];
}) {
  const name = String(payload?.value ?? "");
  const row = data.find((item) => item.name === name);
  const underValue =
    row?.underNameValue != null ? row.underNameValue : (row?.amount ?? 0);

  return (
    <g transform={`translate(${Number(x) || 0},${Number(y) || 0})`}>
      <text
        x={0}
        y={0}
        dy={12}
        textAnchor="middle"
        fill="#334155"
        fontSize={11}
      >
        {name}
      </text>
      <text
        x={0}
        y={0}
        dy={26}
        textAnchor="middle"
        fill="#0284c7"
        fontSize={11}
        fontWeight={600}
      >
        {formatPrice(underValue)}
      </text>
    </g>
  );
}

function MemberAmountChart({
  title,
  subtitle,
  data,
  color,
  valueLabel,
  average,
  valueUnderName = false,
}: {
  title: string;
  subtitle: string;
  data: MemberChartRow[];
  color: string;
  valueLabel: string;
  average?: number;
  valueUnderName?: boolean;
}) {
  return (
    <div className="flex min-h-[14rem] flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 shrink-0">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
      {data.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-slate-500">
          No members to chart.
        </p>
      ) : (
        <div className="min-h-[11rem] w-full flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{
                top: 22,
                right: 8,
                left: 0,
                bottom: valueUnderName ? 12 : 8,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
              <XAxis
                dataKey="name"
                interval={0}
                height={valueUnderName ? 48 : 36}
                tick={
                  valueUnderName
                    ? (props) => <MemberNamePriceTick {...props} data={data} />
                    : { fontSize: 11 }
                }
              />
              <YAxis tick={{ fontSize: 12 }} width={40} />
              <Tooltip
                wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                formatter={(value) => [
                  formatPrice(Number(value) || 0),
                  valueLabel,
                ]}
              />
              {average != null ? (
                <ReferenceLine
                  y={average}
                  stroke="#b45309"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Avg ${formatPrice(average)}`,
                    position: "insideTopRight",
                    fill: "#b45309",
                    fontSize: 11,
                  }}
                />
              ) : null}
              <Bar
                dataKey="amount"
                name={valueLabel}
                fill={color}
                radius={[4, 4, 0, 0]}
              >
                <LabelList
                  dataKey="amount"
                  position="top"
                  formatter={(value) => formatPrice(Number(value) || 0)}
                  style={{ fontSize: 11, fill: "#0f172a" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function FinancialPage() {
  const [teams, setTeams] = useState<SubTeam[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [bids, setBids] = useState<TeamBid[]>([]);
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const committedAmounts = useRef<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canEditBid = currentUser != null && currentUser.role !== "Member";
  const isBigBoss = currentUser?.role === "BigBoss";

  const weekColumns = useMemo(() => getTargetWeekColumns(target), [target]);
  const depositsByUser = useMemo(
    () => buildDepositsByUser(deposits),
    [deposits],
  );
  const depositsByMemberId = useMemo(
    () => buildDepositsByMemberId(deposits),
    [deposits],
  );
  const teamCharts = useMemo(
    () => buildTeamChartStats(teams, deposits, bids, weekColumns),
    [teams, deposits, bids, weekColumns],
  );

  const currentWeekLabel = useMemo(() => {
    const current = weekColumns.find((column) => column.editable);
    return current?.label ?? null;
  }, [weekColumns]);

  const rangeLabel = useMemo(() => {
    if (weekColumns.length === 0) {
      return "No target week range set";
    }
    const first = weekColumns[0]!;
    const last = weekColumns[weekColumns.length - 1]!;
    let weekHint: string;
    if (!canEditBid) {
      weekHint = "Bid values are read-only for Member role.";
    } else if (isBigBoss) {
      weekHint = "BigBoss can edit the Bid row for any week in the plan.";
    } else if (currentWeekLabel) {
      weekHint = `Today is ${currentWeekLabel}. Only the Bid row for ${currentWeekLabel} is editable.`;
    } else {
      weekHint = "Today is outside the plan week range. All weeks are read-only.";
    }
    return `${formatMonthDay(parseDateKey(first.key))} – ${formatMonthDay(parseDateKey(last.endKey))} (${weekColumns.length} week${weekColumns.length === 1 ? "" : "s"} from plan). ${weekHint}`;
  }, [weekColumns, currentWeekLabel, canEditBid, isBigBoss]);

  const loadData = useCallback(async () => {
    try {
      const [subTeams, nextTarget, nextDeposits, nextBids, user] =
        await Promise.all([
          fetchSubTeams(),
          fetchTarget(),
          fetchDeposits(),
          fetchTeamBids(),
          fetchCurrentUser(),
        ]);
      setTeams(subTeams);
      setTarget(nextTarget);
      setDeposits(nextDeposits);
      setBids(nextBids);
      setCurrentUser(user);

      const columns = getTargetWeekColumns(nextTarget);
      const nextAmounts = buildAmountsFromDeposits(nextDeposits, columns);
      committedAmounts.current = nextAmounts;
      setAmounts(nextAmounts);
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

  async function persistBidIncrease(
    memberId: number,
    weekKey: string,
    nextRaw: string,
  ) {
    if (!canEditBid) return;

    const key = dayValueKey(memberId, BID_ROW_KEY, weekKey);
    const previousAmount = parseAmount(committedAmounts.current[key] ?? "");
    const nextAmount = parseAmount(nextRaw);
    const delta = parseAmount(nextAmount - previousAmount);
    const previousDisplay =
      previousAmount === 0 ? "" : formatBalance(previousAmount);

    if (delta === 0) {
      setAmounts((current) => ({ ...current, [key]: previousDisplay }));
      setSaveError(null);
      return;
    }

    if (nextAmount > MAX_BID_AMOUNT) {
      setAmounts((current) => ({ ...current, [key]: previousDisplay }));
      setSaveError(`Bid amount must be at most ${MAX_BID_AMOUNT}`);
      return;
    }

    if (delta < 0) {
      setAmounts((current) => ({ ...current, [key]: previousDisplay }));
      setSaveError("Bid amount can only be increased");
      return;
    }

    const targetUserId = Math.trunc(Number(memberId));
    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      setAmounts((current) => ({ ...current, [key]: previousDisplay }));
      setSaveError("Invalid member selected");
      return;
    }

    try {
      const deposit = await createBidDepositForUser({
        user_id: targetUserId,
        amount: delta,
        ...(isBigBoss
          ? {
              day: (() => {
                const weekStart = parseDateKey(weekKey);
                weekStart.setHours(12, 0, 0, 0);
                return weekStart.toISOString();
              })(),
            }
          : {}),
      });
      if (Number(deposit.user_id) !== targetUserId) {
        setAmounts((current) => ({ ...current, [key]: previousDisplay }));
        setSaveError("Deposit was not saved for the selected user");
        return;
      }
      const nextDisplay = formatBalance(nextAmount);
      committedAmounts.current = {
        ...committedAmounts.current,
        [key]: nextDisplay,
      };
      setAmounts((current) => ({ ...current, [key]: nextDisplay }));
      setDeposits((current) => [...current, deposit]);
      setSaveError(null);
    } catch (err) {
      setAmounts((current) => ({ ...current, [key]: previousDisplay }));
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  function updateAmount(
    memberId: number,
    rowKey: string,
    weekKey: string,
    raw: string,
  ) {
    if (!isDoubleInput(raw)) return;
    if (!isBidAmountWithinMax(raw)) return;
    const key = dayValueKey(memberId, rowKey, weekKey);
    setAmounts((current) => ({ ...current, [key]: raw }));
  }

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
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
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_2fr] xl:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            {teams.map((team) => {
              const memberRowCounts = team.members.map(
                (member) => getMemberRows(member.id, depositsByUser).length,
              );
              const totalRows =
                memberRowCounts.length > 0
                  ? memberRowCounts.reduce((sum, count) => sum + count, 0)
                  : 1;
              const trailingColCount = 1 + weekColumns.length;

              return (
                <section key={team.id} className="min-w-0">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <table className="w-full table-fixed border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left">
                          <th className={teamColumnClass} aria-label="Team">
                            {""}
                          </th>
                          {MEMBER_COLUMNS.map((column) => (
                            <th
                              key={column}
                              className={`${MEMBER_COLUMN_WIDTH[column]} border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500`}
                            >
                              {column}
                            </th>
                          ))}
                          <th className={desColumnClass}>Des</th>
                          {weekColumns.map((column) => (
                            <th
                              key={column.key}
                              className={`${weekColumnClass} ${
                                isBigBoss || column.editable
                                  ? "bg-sky-50 text-sky-700"
                                  : ""
                              }`}
                              title={`${formatMonthDay(parseDateKey(column.key))} – ${formatMonthDay(parseDateKey(column.endKey))}`}
                            >
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {team.members.length === 0 ? (
                          <tr>
                            <td rowSpan={1} className={teamCellClass}>
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
                            const rows = getMemberRows(
                              member.id,
                              depositsByUser,
                            );
                            const rowSpan = rows.length;

                            return rows.map((row, rowIndex) => (
                              <tr
                                key={`${member.id}-${row.key}`}
                                className="border-b border-slate-200"
                              >
                                {memberIndex === 0 && rowIndex === 0 ? (
                                  <td
                                    rowSpan={totalRows}
                                    className={teamCellClass}
                                  >
                                    <span className="inline-block max-h-[28rem] rotate-180 [writing-mode:vertical-rl]">
                                      {team.name}
                                    </span>
                                  </td>
                                ) : null}

                                {rowIndex === 0 ? (
                                  <>
                                    <MemberNameCell
                                      name={member.name}
                                      history={
                                        depositsByMemberId.get(member.id) ?? []
                                      }
                                      rowSpan={rowSpan}
                                      className={`${MEMBER_COLUMN_WIDTH.Name} font-medium`}
                                    />
                                  <MemberSpanCell
                                    rowSpan={rowSpan}
                                    truncate={false}
                                    className={`${MEMBER_COLUMN_WIDTH.CUR} text-xs tabular-nums font-medium text-slate-900`}
                                  >
                                    {formatBalance(
                                      getMemberCur(
                                        member.balance,
                                        member.id,
                                        deposits,
                                      ),
                                    )}
                                  </MemberSpanCell>
                                  </>
                                ) : null}

                                <td className={desCellClass} title={row.label}>
                                  <div className="truncate">{row.label}</div>
                                </td>

                                {weekColumns.map((column) => {
                                  const key = dayValueKey(
                                    member.id,
                                    row.key,
                                    column.key,
                                  );
                                  const amount = amounts[key] ?? "";
                                  const editable =
                                    canEditBid &&
                                    row.key === BID_ROW_KEY &&
                                    (isBigBoss || column.editable);

                                  return (
                                    <ExcelWeekCell
                                      key={`${member.id}-${row.key}-${column.key}`}
                                      value={amount}
                                      editable={editable}
                                      editing={editingKey === key}
                                      memberId={member.id}
                                      onStartEdit={() => setEditingKey(key)}
                                      onChange={(raw) =>
                                        updateAmount(
                                          member.id,
                                          row.key,
                                          column.key,
                                          raw,
                                        )
                                      }
                                      onCommitAmount={(rowMemberId, raw) => {
                                        const nextRaw = String(raw ?? "");
                                        setEditingKey(null);
                                        updateAmount(
                                          rowMemberId,
                                          row.key,
                                          column.key,
                                          nextRaw,
                                        );
                                        void persistBidIncrease(
                                          rowMemberId,
                                          column.key,
                                          nextRaw,
                                        );
                                      }}
                                    />
                                  );
                                })}
                              </tr>
                            ));
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {teamCharts.map((team) => (
              <section key={team.teamId} className="flex flex-col gap-3">
                <h2 className="text-base font-semibold text-slate-900">
                  {team.teamName}
                </h2>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <MemberAmountChart
                    title="Deposit by member"
                    subtitle="Non-Bid deposit totals in plan weeks"
                    data={team.depositChart}
                    color="#0f766e"
                    valueLabel="Deposit"
                    average={team.depositAverage}
                  />
                  <MemberAmountChart
                    title="Bid price by member"
                    subtitle="Bar: total Bid deposit · Under name: Bid deposit ÷ bid count"
                    data={team.bidPriceChart}
                    color="#0284c7"
                    valueLabel="Total Bid"
                    valueUnderName
                  />
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
