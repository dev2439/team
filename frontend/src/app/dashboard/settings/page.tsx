"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  changePasswordRequest,
  fetchCurrentUser,
  updateProfileRequest,
  type PublicUser,
} from "@/lib/auth";
import { fetchUsers, type ListedUser } from "@/lib/users";

type SettingsTab = "profile" | "account";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "account", label: "Account" },
];

const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200 disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500 dark:disabled:bg-slate-800";

function FieldLabel({ children }: { children: string }) {
  return (
    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {children}
    </span>
  );
}

function ProfileTab() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [birthday, setBirthday] = useState("");
  const [bio, setBio] = useState("");
  const [members, setMembers] = useState<ListedUser[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await fetchCurrentUser();
        if (cancelled) return;
        if (!current) {
          setError("Not signed in");
          return;
        }
        setUser(current);
        setName(current.name);
        setEmail(current.email);
        setJobTitle(current.job_title ?? "");
        setBirthday(current.birthday ?? "");
        setBio(current.bio ?? "");
        try {
          const listed = await fetchUsers();
          if (cancelled) return;
          const memberUsers = listed.users
            .filter(
              (entry) =>
                entry.id !== current.id &&
                (entry.role === "Member" || entry.role === "SubBoss"),
            )
            .sort((a, b) => a.name.localeCompare(b.name));
          setMembers(memberUsers);
        } catch {
          if (!cancelled) setMembers([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfileRequest({
        name,
        email,
        jobTitle,
        bio,
        birthday: birthday || null,
      });
      setUser(updated);
      setMessage("Profile saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  function toggleMember(id: number) {
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Loading profile…
      </p>
    );
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Personal profile
      </h2>
      <p className="mt-1 mb-4 text-sm text-slate-600 dark:text-slate-400">
        Your name and personal details. Role is set by BigBoss.
      </p>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <form onSubmit={onSubmit} className="min-w-0 max-w-xl flex-1 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <FieldLabel>Full name</FieldLabel>
            <input
              type="text"
              name="name"
              autoComplete="name"
              required
              value={name}
              onChange={(change) => {
                setMessage(null);
                setName(change.target.value);
              }}
              className={fieldClass}
            />
          </label>

          <label className="block sm:col-span-2">
            <FieldLabel>Email</FieldLabel>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(change) => {
                setMessage(null);
                setEmail(change.target.value);
              }}
              className={fieldClass}
            />
          </label>

          <label className="block">
            <FieldLabel>Job title</FieldLabel>
            <input
              type="text"
              name="jobTitle"
              autoComplete="organization-title"
              value={jobTitle}
              onChange={(change) => {
                setMessage(null);
                setJobTitle(change.target.value);
              }}
              placeholder="Optional"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <FieldLabel>Birthday</FieldLabel>
            <input
              type="date"
              name="birthday"
              autoComplete="bday"
              value={birthday}
              onChange={(change) => {
                setMessage(null);
                setBirthday(change.target.value);
              }}
              className={fieldClass}
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
              The team is notified when this date starts in Japan time (JST).
            </span>
          </label>

          <label className="block sm:col-span-2">
            <FieldLabel>About</FieldLabel>
            <textarea
              name="bio"
              rows={4}
              value={bio}
              onChange={(change) => {
                setMessage(null);
                setBio(change.target.value);
              }}
              placeholder="A short note about you"
              className={`${fieldClass} resize-y`}
            />
          </label>
        </div>

        {user ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Role: {user.role}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
          {message ? (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">
              {message}
            </span>
          ) : null}
          {error ? (
            <span className="text-sm text-red-600 dark:text-red-400">
              {error}
            </span>
          ) : null}
        </div>
        </form>

        <aside className="w-full shrink-0 lg:w-72">
          {members.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No members found.
            </p>
          ) : (
            <ul>
              {members.map((member) => {
                const checked = selectedMemberIds.has(member.id);
                return (
                  <li key={member.id}>
                    <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMember(member.id)}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 dark:border-slate-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-800 dark:text-slate-100">
                          {member.name}
                        </span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {member.role}
                          {member.sub_team ? ` · ${member.sub_team}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function AccountTab() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!currentPassword || !newPassword) {
      setError("Current and new password are required");
      return;
    }

    if (newPassword.length < 3) {
      setError("New password must be at least 3 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match");
      return;
    }

    if (currentPassword === newPassword) {
      setError("New password must be different from the current password");
      return;
    }

    setSaving(true);
    try {
      await changePasswordRequest({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Change password
      </h2>
      <p className="mt-1 mb-4 text-sm text-slate-600 dark:text-slate-400">
        Update the password for your signed-in account.
      </p>

      <form onSubmit={onSubmit} className="max-w-md space-y-3">
        <label className="block">
          <FieldLabel>Current password</FieldLabel>
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(change) => {
              setMessage(null);
              setCurrentPassword(change.target.value);
            }}
            className={fieldClass}
          />
        </label>

        <label className="block">
          <FieldLabel>New password</FieldLabel>
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(change) => {
              setMessage(null);
              setNewPassword(change.target.value);
            }}
            className={fieldClass}
          />
        </label>

        <label className="block">
          <FieldLabel>Confirm new password</FieldLabel>
          <input
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(change) => {
              setMessage(null);
              setConfirmPassword(change.target.value);
            }}
            className={fieldClass}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {saving ? "Updating…" : "Update password"}
          </button>
          {message ? (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">
              {message}
            </span>
          ) : null}
          {error ? (
            <span className="text-sm text-red-600 dark:text-red-400">
              {error}
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("profile");

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Settings
        </h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Manage your profile and account.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div
          role="tablist"
          aria-label="Settings"
          className="flex gap-1 border-b border-slate-200 bg-slate-50 px-3 pt-2 dark:border-slate-700 dark:bg-slate-800/80"
        >
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                id={`settings-tab-${item.id}`}
                onClick={() => setTab(item.id)}
                className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition ${
                  selected
                    ? "bg-white text-slate-900 shadow-[0_-1px_0_#fff] dark:bg-slate-900 dark:text-slate-100 dark:shadow-none"
                    : "text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/50 dark:hover:text-slate-200"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab}`}
          className="p-5"
        >
          {tab === "profile" ? <ProfileTab /> : <AccountTab />}
        </div>
      </div>
    </div>
  );
}
