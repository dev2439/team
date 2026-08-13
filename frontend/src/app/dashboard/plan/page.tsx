"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchTarget, saveTarget } from "@/lib/targets";

type TargetForm = {
  month: string;
  week: string;
  sub1: string;
  sub2: string;
};

function emptyForm(): TargetForm {
  const now = new Date();
  return {
    month: String(now.getMonth() + 1),
    week: "1",
    sub1: "0",
    sub2: "0",
  };
}

function toNumber(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

const FIELDS = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "sub1", label: "Sub1" },
  { key: "sub2", label: "Sub2" },
] as const;

export default function PlanPage() {
  const [form, setForm] = useState<TargetForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadTarget = useCallback(async () => {
    try {
      const target = await fetchTarget();
      if (target) {
        setForm({
          month: String(target.month),
          week: String(target.week),
          sub1: String(target.sub1),
          sub2: String(target.sub2),
        });
      } else {
        setForm(emptyForm());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load target");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTarget();
  }, [loadTarget]);

  function updateField(key: (typeof FIELDS)[number]["key"], value: string) {
    setMessage(null);
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSave() {
    setError(null);
    setMessage(null);

    const month = toNumber(form.month);
    const week = toNumber(form.week);
    const sub1 = toNumber(form.sub1);
    const sub2 = toNumber(form.sub2);

    if (![month, week, sub1, sub2].every((value) => Number.isFinite(value))) {
      setError("All fields must be valid numbers");
      return;
    }

    setSaving(true);
    try {
      const saved = await saveTarget({ month, week, sub1, sub2 });
      setForm({
        month: String(saved.month),
        week: String(saved.week),
        sub1: String(saved.sub1),
        sub2: String(saved.sub2),
      });
      setMessage("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save target");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Plan
        </h1>
        <p className="mt-1 text-slate-600">
          Edit target values used by the Financial page date range.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        {loading ? (
          <p className="text-sm text-slate-500">Loading target…</p>
        ) : (
          <div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {field.label}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form[field.key]}
                    onChange={(event) =>
                      updateField(field.key, event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
                  />
                </label>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void onSave()}
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
          </div>
        )}
      </div>
    </div>
  );
}
