"use client";

import { useRef, type ChangeEvent, type UIEvent } from "react";

type LiveMarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  required?: boolean;
  placeholder?: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Inline markdown only — keeps 1 line in / 1 line out for caret alignment. */
function styleLine(line: string): string {
  if (!line) return "&nbsp;";

  let html = escapeHtml(line);

  const heading = /^(#{1,3})\s+(.*)$/.exec(line);
  if (heading) {
    const size =
      heading[1].length === 1
        ? "text-xl font-semibold"
        : heading[1].length === 2
          ? "text-lg font-semibold"
          : "text-base font-semibold";
    let title = escapeHtml(heading[2]);
    title = title.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    title = title.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    title = title.replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-slate-100 px-1 font-mono text-[0.9em]">$1</code>',
    );
    return `<span class="${size} text-slate-900">${title}</span>`;
  }

  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-slate-100 px-1 font-mono text-[0.9em] text-slate-800">$1</code>',
  );
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a class="text-sky-700 underline">$1</a>',
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(
    /^[-*]\s+(.*)$/,
    '<span class="text-slate-700">• $1</span>',
  );
  html = html.replace(/^(\d+)\.\s+(.*)$/, '<span class="text-slate-700">$1. $2</span>');

  return html;
}

export function LiveMarkdownEditor({
  value,
  onChange,
  name = "proposal",
  required,
  placeholder = "Write your proposal in Markdown…",
}: LiveMarkdownEditorProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lines = value.split("\n");

  function syncScroll(event: UIEvent<HTMLTextAreaElement>) {
    if (!previewRef.current) return;
    previewRef.current.scrollTop = event.currentTarget.scrollTop;
    previewRef.current.scrollLeft = event.currentTarget.scrollLeft;
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 text-sm text-slate-700">
      <span className="font-medium">Proposal (Markdown)</span>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-200">
        <div
          ref={previewRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-auto px-3.5 py-3 font-mono text-sm leading-6 text-slate-900"
        >
          {value ? (
            lines.map((line, index) => (
              <div
                key={index}
                className="min-h-[1.5rem] whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ __html: styleLine(line) }}
              />
            ))
          ) : (
            <div className="min-h-[1.5rem] text-slate-400">{placeholder}</div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          name={name}
          required={required}
          value={value}
          onChange={handleChange}
          onScroll={syncScroll}
          spellCheck
          className="relative z-10 h-full min-h-[12rem] w-full max-h-[calc(100vh-22rem)] resize-none overflow-auto bg-transparent px-3.5 py-3 font-mono text-sm leading-6 text-transparent caret-slate-900 outline-none"
          style={{ WebkitTextFillColor: "transparent" }}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
