"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCurrentUser, type PublicUser } from "@/lib/auth";
import { fetchDeposits, type Deposit } from "@/lib/deposits";
import { createEta, fetchEtas, type EtaEntry } from "@/lib/etas";
import { fetchMyProjects, type Project } from "@/lib/projects";
import { fetchSubTeams, type SubTeam } from "@/lib/sub-teams";

function isNumberInput(raw: string): boolean {
  if (raw.trim() === "") return true;
  return /^-?\d*\.?\d*$/.test(raw);
}

function formatAmountLabel(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000);
}

function toLocalDate(value: string): Date {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateHeader(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return `${month}/${day}`;
}

type MemberEtaSummary = {
  total: number;
  byProject: { projectId: number; projectName: string; amount: number }[];
};

/** Total + per-project totals for each member from eta rows. */
function buildEtaSummaryByMember(
  etas: EtaEntry[],
): Map<number, MemberEtaSummary> {
  const map = new Map<number, MemberEtaSummary>();

  for (const entry of etas) {
    const amount = Number(entry.amount) || 0;
    const current = map.get(entry.user_id) ?? { total: 0, byProject: [] };
    current.total += amount;

    const projectName =
      entry.project_name?.trim() || `Project #${entry.project_id}`;
    const existing = current.byProject.find(
      (row) => row.projectId === entry.project_id,
    );
    if (existing) {
      existing.amount += amount;
    } else {
      current.byProject.push({
        projectId: entry.project_id,
        projectName,
        amount,
      });
    }

    map.set(entry.user_id, current);
  }

  for (const summary of map.values()) {
    summary.byProject.sort((a, b) => a.projectName.localeCompare(b.projectName));
  }

  return map;
}

const DEFAULT_DATE_COLUMN_COUNT = 10;

type DepositProjectAmount = {
  projectId: number;
  projectName: string;
  amount: number;
};

type DateColumn = {
  key: string;
  dateKey: string | null;
  label: string;
};

/** Unique deposit dates (sorted) + per-project amounts; pad to 10 default empty columns. */
function buildDepositDateColumns(
  deposits: Deposit[],
  memberIds: Set<number>,
): {
  columns: DateColumn[];
  projectsByMember: Map<number, Record<string, DepositProjectAmount[]>>;
} {
  const dateSet = new Set<string>();
  const projectsByMember = new Map<
    number,
    Record<string, DepositProjectAmount[]>
  >();

  for (const deposit of deposits) {
    if (deposit.project_id == null) continue;
    if (!memberIds.has(deposit.user_id)) continue;

    const dateKey = formatDateKey(toLocalDate(deposit.created_at));
    dateSet.add(dateKey);

    const amount = Number(deposit.amount) || 0;
    const projectName =
      deposit.project_name?.trim() || `Project #${deposit.project_id}`;
    const byDate = projectsByMember.get(deposit.user_id) ?? {};
    const dayRows = byDate[dateKey] ?? [];
    const existing = dayRows.find(
      (row) => row.projectId === deposit.project_id,
    );
    if (existing) {
      existing.amount += amount;
    } else {
      dayRows.push({
        projectId: deposit.project_id,
        projectName,
        amount,
      });
    }
    byDate[dateKey] = dayRows;
    projectsByMember.set(deposit.user_id, byDate);
  }

  for (const byDate of projectsByMember.values()) {
    for (const rows of Object.values(byDate)) {
      rows.sort((a, b) => a.projectName.localeCompare(b.projectName));
    }
  }

  const dateKeys = [...dateSet].sort((a, b) => a.localeCompare(b));
  const columns: DateColumn[] = dateKeys.map((dateKey) => ({
    key: dateKey,
    dateKey,
    label: formatDateHeader(dateKey),
  }));

  while (columns.length < DEFAULT_DATE_COLUMN_COUNT) {
    const index = columns.length;
    columns.push({
      key: `empty-${index}`,
      dateKey: null,
      label: "",
    });
  }

  return { columns, projectsByMember };
}

const teamColumnClass =
  "w-8 border-r border-slate-200 bg-slate-50 px-0.5 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500";

const teamCellClass =
  "w-8 border-r border-slate-200 bg-slate-50 px-0.5 py-2.5 text-center align-middle font-semibold text-slate-900";

const nameColumnClass =
  "w-[5.5rem] min-w-[5.5rem] max-w-[5.5rem] border-r border-slate-200 bg-slate-50 px-1.5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500";

const nameCellClass =
  "w-[5.5rem] min-w-[5.5rem] max-w-[5.5rem] border-r border-slate-200 px-1.5 py-2.5 text-sm font-medium text-slate-900";

const dayColumnClass =
  "border-r border-slate-200 px-1 py-1.5 text-center text-xs font-semibold tracking-wide text-slate-500";

const dayCellClass =
  "border-r border-slate-200 px-1 py-2 align-middle text-slate-800";

const etaColumnClass =
  "w-36 border-r border-slate-200 bg-slate-50 px-1 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500";

const etaCellClass =
  "w-36 border-r border-slate-200 px-1 py-2 align-middle text-slate-800";

export default function EtaPage() {
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [projectId, setProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [myProjects, setMyProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<SubTeam[]>([]);
  const [etas, setEtas] = useState<EtaEntry[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canEditEta = currentUser != null && currentUser.role !== "BigBoss";

  const displayTeams = useMemo(
    () => [...teams].sort((a, b) => a.id - b.id).slice(0, 2),
    [teams],
  );

  const memberIds = useMemo(() => {
    const ids = new Set<number>();
    for (const team of displayTeams) {
      for (const member of team.members) {
        ids.add(member.id);
      }
    }
    return ids;
  }, [displayTeams]);

  const summaryByMember = useMemo(
    () => buildEtaSummaryByMember(etas),
    [etas],
  );

  const { columns: dateColumns, projectsByMember: depositProjectsByMember } =
    useMemo(
      () => buildDepositDateColumns(deposits, memberIds),
      [deposits, memberIds],
    );

  const totalEta = useMemo(() => {
    let sum = 0;
    for (const memberId of memberIds) {
      sum += summaryByMember.get(memberId)?.total ?? 0;
    }
    return sum;
  }, [memberIds, summaryByMember]);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      const [user, nextTeams, nextEtas, nextDeposits] = await Promise.all([
        fetchCurrentUser(),
        fetchSubTeams(),
        fetchEtas(),
        fetchDeposits(),
      ]);
      setCurrentUser(user);
      setTeams(nextTeams);
      setEtas(nextEtas);
      setDeposits(nextDeposits);

      if (user != null && user.role !== "BigBoss") {
        const nextProjects = await fetchMyProjects();
        setMyProjects(nextProjects);
      } else {
        setMyProjects([]);
      }

      if (!silent) setError(null);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to load ETA data");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (projectId === "" && myProjects.length > 0) {
      setProjectId(String(myProjects[0]!.id));
    }
    if (
      projectId !== "" &&
      myProjects.length > 0 &&
      !myProjects.some((project) => String(project.id) === projectId)
    ) {
      setProjectId(String(myProjects[0]!.id));
    }
    if (myProjects.length === 0) {
      setProjectId("");
    }
  }, [myProjects, projectId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const selectedProjectId = Math.trunc(Number(projectId));
    if (!Number.isFinite(selectedProjectId) || selectedProjectId <= 0) {
      setError("Select a project");
      return;
    }

    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue)) {
      setError("Amount must be a valid number");
      return;
    }

    setSaving(true);
    try {
      await createEta({
        project_id: selectedProjectId,
        amount: amountValue,
      });
      setAmount("");
      setMessage("ETA saved");
      await loadData({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save ETA");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            ETA
          </h1>
          <p className="mt-1 text-slate-600">
            {canEditEta
              ? "Save ETA amounts for your projects and view sub team 1 and 2."
              : "View ETA and deposit amounts for sub team 1 and 2."}
          </p>
        </div>
        {!loading && displayTeams.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Total ETA
            </p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
              {formatAmountLabel(totalEta)}
            </p>
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading sub team ETA…</p>
      ) : displayTeams.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No sub teams found.
        </div>
      ) : (
        <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className={teamColumnClass} aria-label="Team">
                  {""}
                </th>
                <th className={nameColumnClass}>Name</th>
                <th className={etaColumnClass}>ETA</th>
                {dateColumns.map((column) => (
                  <th
                    key={column.key}
                    className={dayColumnClass}
                    title={column.dateKey ?? undefined}
                  >
                    {column.label || (
                      <span className="text-transparent">0</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayTeams.flatMap((team) => {
                const rowCount = Math.max(team.members.length, 1);

                if (team.members.length === 0) {
                  return [
                    <tr
                      key={`team-${team.id}-empty`}
                      className="border-b border-slate-200"
                    >
                      <td rowSpan={1} className={teamCellClass}>
                        <span className="inline-block max-h-40 rotate-180 [writing-mode:vertical-rl]">
                          {team.name}
                        </span>
                      </td>
                      <td
                        colSpan={2 + dateColumns.length}
                        className="px-3 py-6 text-center text-slate-500"
                      >
                        No members
                      </td>
                    </tr>,
                  ];
                }

                return team.members.map((member, memberIndex) => {
                  const summary = summaryByMember.get(member.id);
                  const memberDepositProjects =
                    depositProjectsByMember.get(member.id) ?? {};
                  const total = summary?.total ?? 0;
                  const byProject = summary?.byProject ?? [];

                  return (
                    <tr
                      key={member.id}
                      className="border-b border-slate-200 last:border-b-0"
                    >
                      {memberIndex === 0 ? (
                        <td rowSpan={rowCount} className={teamCellClass}>
                          <span className="inline-block max-h-[28rem] rotate-180 [writing-mode:vertical-rl]">
                            {team.name}
                          </span>
                        </td>
                      ) : null}
                      <td className={nameCellClass}>
                        <div className="truncate" title={member.name}>
                          {member.name}
                        </div>
                      </td>
                      <td className={etaCellClass}>
                        <div className="text-center text-xs font-semibold tabular-nums leading-tight text-slate-900">
                          {formatAmountLabel(total)}
                        </div>
                        {byProject.length > 0 ? (
                          <div className="mt-0.5 space-y-0 text-center">
                            {byProject.map((row) => (
                              <p
                                key={`${member.id}-${row.projectId}`}
                                className="truncate text-xs leading-snug text-slate-500"
                                title={`${row.projectName}: ${formatAmountLabel(row.amount)}`}
                              >
                                {row.projectName}:{" "}
                                {formatAmountLabel(row.amount)}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      {dateColumns.map((column) => {
                        const dayProjects = column.dateKey
                          ? (memberDepositProjects[column.dateKey] ?? [])
                          : [];

                        return (
                          <td key={column.key} className={dayCellClass}>
                            {dayProjects.length > 0 ? (
                              <div className="space-y-0 text-center">
                                {dayProjects.map((row) => (
                                  <p
                                    key={`${member.id}-${column.key}-${row.projectId}`}
                                    className="truncate text-xs leading-snug text-slate-700"
                                    title={`${row.projectName}: ${formatAmountLabel(row.amount)}`}
                                  >
                                    {row.projectName}:{" "}
                                    {formatAmountLabel(row.amount)}
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <span className="text-transparent">0</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                });
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td className={teamCellClass} />
                <td className={`${nameCellClass} bg-slate-50 font-semibold text-slate-700`}>
                  Total
                </td>
                <td className={`${etaCellClass} bg-slate-50`}>
                  <div className="text-center text-xs font-semibold tabular-nums text-slate-900">
                    {formatAmountLabel(totalEta)}
                  </div>
                </td>
                {dateColumns.map((column) => (
                  <td key={column.key} className={`${dayCellClass} bg-slate-50`}>
                    <span className="text-transparent">0</span>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {canEditEta ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <form onSubmit={onSubmit} className="max-w-3xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block min-w-0 flex-1">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Project
                </span>
                <select
                  name="projectId"
                  required
                  value={projectId}
                  disabled={myProjects.length === 0}
                  onChange={(event) => {
                    setMessage(null);
                    setProjectId(event.target.value);
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {myProjects.length === 0 ? (
                    <option value="">No projects yet</option>
                  ) : (
                    myProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="block min-w-0 sm:w-36">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Amount
                </span>
                <input
                  type="text"
                  name="amount"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (!isNumberInput(next)) return;
                    setMessage(null);
                    setAmount(next);
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
                />
              </label>

              <button
                type="submit"
                disabled={saving || myProjects.length === 0}
                className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>

            {(message || error) && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {message && (
                  <span className="text-sm text-emerald-600">{message}</span>
                )}
                {error && <span className="text-sm text-red-600">{error}</span>}
              </div>
            )}
          </form>
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
