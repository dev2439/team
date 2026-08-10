"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchTarget, saveTarget } from "@/lib/targets";

const TABS = [
  { id: "target", label: "Target" },
  { id: "general", label: "General" },
] as const;

type TabId = (typeof TABS)[number]["id"];

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

function TargetTab() {
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

  if (loading) {
    return <p className="text-sm text-slate-500">Loading target…</p>;
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Edit target values used by the Financial page date range.
      </p>
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
              onChange={(event) => updateField(field.key, event.target.value)}
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
        {message && <span className="text-sm text-emerald-600">{message}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

function GeneralTab() {
  return (
    <p className="text-sm text-slate-600">General settings will live here.</p>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("target");

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Settings
        </h1>
        <p className="mt-1 text-slate-600">Manage team settings by section.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 pt-2"
        >
          {TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                id={`settings-tab-${tab.id}`}
                aria-controls={`settings-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${
                  selected
                    ? "bg-white text-slate-900 shadow-[0_-1px_0_0_#fff]"
                    : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`settings-panel-${activeTab}`}
          aria-labelledby={`settings-tab-${activeTab}`}
          className="p-5"
        >
          {activeTab === "target" ? <TargetTab /> : null}
          {activeTab === "general" ? <GeneralTab /> : null}
        </div>
      </div>
    </div>
  );
}
