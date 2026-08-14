"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { createDeposit } from "@/lib/deposits";
import { fetchMyProjects, type Project } from "@/lib/projects";

const MAX_AMOUNT = 10000;

function isDoubleInput(raw: string): boolean {
  if (raw.trim() === "") return true;
  return /^-?\d*\.?\d*$/.test(raw);
}

function isAmountWithinMax(raw: string): boolean {
  if (raw.trim() === "" || raw === "-" || raw === "." || raw === "-.") {
    return true;
  }
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= MAX_AMOUNT;
}

export default function DepositPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const rows = await fetchMyProjects();
      setProjects(rows);
      setProjectId((current) => {
        if (rows.length === 0) return "";
        if (current && rows.some((row) => String(row.id) === current)) {
          return current;
        }
        return String(rows[0]!.id);
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

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
    if (Math.abs(amountValue) > MAX_AMOUNT) {
      setError(`Amount must be at most ${MAX_AMOUNT}`);
      return;
    }

    setSaving(true);
    try {
      await createDeposit({
        project_id: selectedProjectId,
        amount: amountValue,
      });
      setAmount("");
      setMessage("Deposit saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save deposit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Deposit
        </h1>
        <p className="mt-1 text-slate-600">Save a project deposit entry.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-900">Project</h2>
        <p className="mt-1 mb-4 text-sm text-slate-600">
          Select one of your projects and enter an amount.
        </p>

        {loading ? (
          <p className="text-sm text-slate-500">Loading projects…</p>
        ) : (
          <form onSubmit={onSubmit} className="max-w-md space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Project
              </span>
              <select
                name="projectId"
                required
                value={projectId}
                disabled={projects.length === 0}
                onChange={(event) => {
                  setMessage(null);
                  setProjectId(event.target.value);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              >
                {projects.length === 0 ? (
                  <option value="">No projects yet</option>
                ) : (
                  projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="block">
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
                  if (!isDoubleInput(next)) return;
                  if (!isAmountWithinMax(next)) return;
                  setMessage(null);
                  setAmount(next);
                }}
                max={MAX_AMOUNT}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving || projects.length === 0}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              {message && (
                <span className="text-sm text-emerald-600">{message}</span>
              )}
              {error && <span className="text-sm text-red-600">{error}</span>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
