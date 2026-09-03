"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  fetchCurrentUser,
  getToken,
  loginRequest,
  saveToken,
} from "@/lib/auth";

function go(path: string, router: ReturnType<typeof useRouter>) {
  router.replace(path);
  window.setTimeout(() => {
    if (window.location.pathname !== path) {
      window.location.replace(path);
    }
  }, 250);
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkExistingSession() {
      const token = getToken();
      if (!token) {
        return;
      }

      const user = await fetchCurrentUser(token);
      if (user) {
        go("/dashboard/overview", router);
      }
    }

    void checkExistingSession().finally(() => setChecking(false));
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { token } = await loginRequest(email, password);
      saveToken(token);
      go("/dashboard/overview", router);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-[#f4f6f8] px-6">
        <p className="text-sm text-slate-500">Checking session…</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[#0b1220] bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/frelavia-login-bg.png)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/75 via-slate-950/55 to-slate-900/40 dark:from-slate-950/80 dark:via-slate-950/65 dark:to-slate-950/50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(#ffffff14_1px,transparent_1px),linear-gradient(90deg,#ffffff14_1px,transparent_1px)] [background-size:32px_32px]"
      />

      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <main className="page-enter relative mx-auto w-full max-w-md">
        <div className="mb-10 text-center">
          <p className="text-4xl font-semibold tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
            Frelavia
          </p>
          <h1 className="mt-3 text-lg text-slate-200/90">Sign in to continue</h1>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-white/20 bg-white/85 p-8 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/75"
        >
          <div className="flex flex-col gap-5">
            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              <span className="font-medium">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                placeholder="you@example.com"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              <span className="font-medium">Password</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
