"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { ImagePasteArea } from "@/components/ImagePasteArea";
import { createTestBidRequest } from "@/lib/test-bids";

/** Example: https://www.upwork.com/jobs/~022088289986163309012 */
const UPWORK_JOB_URL_PATTERN =
  /^https:\/\/www\.upwork\.com\/jobs\/~\d+$/;

function isValidUpworkJobUrl(value: string): boolean {
  return UPWORK_JOB_URL_PATTERN.test(value.trim());
}

export default function BidTestPage() {
  const [url, setUrl] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const bidUrl = url.trim();
    if (!isValidUpworkJobUrl(bidUrl)) {
      setError(
        "URL must match https://www.upwork.com/jobs/~022088289986163309012",
      );
      return;
    }

    if (!image) {
      setError("Paste a job image before saving");
      return;
    }

    setSubmitting(true);

    try {
      await createTestBidRequest({
        url: bidUrl,
        image,
      });
      setUrl("");
      setImage(null);
      setSuccess("Test bid saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save test bid");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Bid Test
        </h1>
        <p className="mt-1 text-slate-600">
          Create and save a test proposal.
        </p>
      </div>

      <section className="flex min-h-0 flex-1 flex-col">
        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <label className="flex shrink-0 flex-col gap-2 text-sm text-slate-700">
            <span className="font-medium">URL</span>
            <input
              type="text"
              name="url"
              required
              value={url}
              onChange={(e) => {
                setSuccess(null);
                setUrl(e.target.value);
              }}
              placeholder="https://www.upwork.com/jobs/~022088289986163309012"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </label>

          <div className="flex min-h-0 flex-1 flex-col [&_>div]:flex [&_>div]:min-h-0 [&_>div]:flex-1 [&_>div]:flex-col">
            <ImagePasteArea
              value={image}
              onChange={setImage}
              boxClassName="flex min-h-[28rem] flex-1 flex-col"
              previewMaxHeightClassName="max-h-[min(36rem,55vh)]"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="shrink-0 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          {success && (
            <p className="shrink-0 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !image}
            className="shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Submit"}
          </button>
        </form>
      </section>
    </div>
  );
}
