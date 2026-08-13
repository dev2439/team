"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { createDeposit } from "@/lib/deposits";

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
  const [projectName, setProjectName] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const name = projectName.trim();
    if (!name) {
      setError("Project name is required");
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
        project_name: name,
        amount: amountValue,
      });
      setProjectName("");
      setAmount("");
      setMessage("Project saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project");
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
          Enter a project name and amount to save to the deposit table.
        </p>

        <form onSubmit={onSubmit} className="max-w-md space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Project Name
            </span>
            <input
              type="text"
              name="projectName"
              required
              value={projectName}
              onChange={(event) => {
                setMessage(null);
                setProjectName(event.target.value);
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
            />
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
              disabled={saving}
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
      </div>
    </div>
  );
}
