"use client";

import { useState, type ChangeEvent } from "react";
import { MarkdownView } from "@/components/MarkdownView";

type LiveMarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  required?: boolean;
  placeholder?: string;
};

type EditorMode = "markdown" | "preview";

export function LiveMarkdownEditor({
  value,
  onChange,
  name = "proposal",
  required,
  placeholder = "Write your proposal in Markdown…",
}: LiveMarkdownEditorProps) {
  const [mode, setMode] = useState<EditorMode>("markdown");

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 text-sm text-slate-700 dark:text-slate-300">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <span className="font-medium">Proposal</span>
        <div
          role="tablist"
          aria-label="Proposal view"
          className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-600 dark:bg-slate-800"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "markdown"}
            onClick={() => setMode("markdown")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              mode === "markdown"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Markdown
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "preview"}
            onClick={() => setMode("preview")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              mode === "preview"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Preview
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:focus-within:border-slate-500 dark:focus-within:ring-slate-700">
        {mode === "markdown" ? (
          <textarea
            name={name}
            required={required}
            value={value}
            onChange={handleChange}
            spellCheck
            className="markdown-editor-input h-full max-h-[calc(100vh-22rem)] min-h-[12rem] w-full resize-none overflow-auto bg-transparent px-3.5 py-3 font-mono text-sm leading-6 text-slate-900 outline-none dark:text-slate-100"
            placeholder={placeholder}
          />
        ) : (
          <>
            {/* Keep value in the form while Preview is active */}
            <textarea
              name={name}
              required={required}
              value={value}
              onChange={handleChange}
              tabIndex={-1}
              aria-hidden
              className="sr-only"
            />
            <div className="h-full max-h-[calc(100vh-22rem)] min-h-[12rem] overflow-auto px-3.5 py-3">
              {value.trim() ? (
                <MarkdownView content={value} />
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Nothing to preview yet. Switch to Markdown to write.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
