"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { generateProfileDocxRequest } from "@/lib/profile-generator";

const fieldClass =
  "min-h-0 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500";

const inputClass =
  "h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-200 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500";

export default function ProfileGeneratorPage() {
  const [stack, setStack] = useState("");
  const [country, setCountry] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [docxUrl, setDocxUrl] = useState("");

  useEffect(() => {
    return () => {
      if (docxUrl) URL.revokeObjectURL(docxUrl);
    };
  }, [docxUrl]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("");

    if (docxUrl) {
      URL.revokeObjectURL(docxUrl);
      setDocxUrl("");
    }

    try {
      const blob = await generateProfileDocxRequest({
        stack,
        country,
        hourlyRate,
        systemPrompt: systemPrompt.trim() || undefined,
      });
      const url = URL.createObjectURL(blob);
      setDocxUrl(url);
      setStatus("DOCX ready");

      // Defer click so the object URL is registered; some browsers block
      // immediate downloads after a long async wait.
      window.setTimeout(() => {
        const link = document.createElement("a");
        link.href = url;
        link.download = "upwork-profile.docx";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, 0);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit =
    !isSubmitting &&
    stack.trim() !== "" &&
    country.trim() !== "" &&
    hourlyRate.trim() !== "";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Profile Generator
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Generate an Upwork profile Word document from your stack, education
          country, and hourly rate.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto md:flex-row md:overflow-hidden">
        <section className="flex min-h-[min(28rem,70vh)] min-w-0 flex-1 flex-col border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/70 md:min-h-0">
          <h2 className="mb-3 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Profile details
          </h2>
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            <label
              htmlFor="technical-stack"
              className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-300"
            >
              Technical stack
            </label>
            <textarea
              id="technical-stack"
              value={stack}
              onChange={(event) => setStack(event.target.value)}
              placeholder="AI Full-Stack CMS integration Expert & MVP | Next.js, Supabase, Claude"
              disabled={isSubmitting}
              className={`${fieldClass} flex-1`}
            />
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
              <label
                htmlFor="education-country"
                className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-300"
              >
                Education country
              </label>
              <input
                id="education-country"
                type="text"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                placeholder="Poland"
                disabled={isSubmitting}
                className={inputClass}
              />
              <label
                htmlFor="hourly-rate"
                className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-300"
              >
                Hourly rate
              </label>
              <input
                id="hourly-rate"
                type="text"
                value={hourlyRate}
                onChange={(event) => setHourlyRate(event.target.value)}
                placeholder="45"
                disabled={isSubmitting}
                className={inputClass}
              />
              <button
                type="submit"
                disabled={!canSubmit}
                className="h-10 min-w-28 bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {isSubmitting ? "Generating..." : "Submit"}
              </button>
            </div>
            <p className="min-h-5 shrink-0 text-sm text-slate-500 dark:text-slate-400">
              {isSubmitting
                ? "Waiting for n8n..."
                : docxUrl
                  ? "Word file downloaded. Click below if you need it again."
                  : status}
            </p>
            {docxUrl ? (
              <a
                href={docxUrl}
                download="upwork-profile.docx"
                className="shrink-0 text-sm font-medium text-sky-700 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300"
              >
                Download DOCX
              </a>
            ) : null}
          </form>
        </section>

        <section className="flex min-h-[min(28rem,70vh)] min-w-0 flex-1 flex-col border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/70 md:min-h-0">
          <h2
            id="system-prompt-heading"
            className="mb-3 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            System prompt
          </h2>
          <label htmlFor="system-prompt" className="sr-only">
            System prompt
          </label>
          <textarea
            id="system-prompt"
            aria-labelledby="system-prompt-heading"
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder="Paste or edit a system prompt..."
            disabled={isSubmitting}
            className={`${fieldClass} flex-1`}
          />
        </section>
      </div>
    </div>
  );
}
