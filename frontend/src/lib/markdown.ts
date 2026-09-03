function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function inlineMarkdown(text: string): string {
  let html = escapeHtml(text);

  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-800">$1</code>',
  );
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="font-medium text-sky-700 underline underline-offset-2">$1</a>',
  );
  // **text** and *text* both render as bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>");
  return html;
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const html: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuffer: string[] = [];
  /**
   * Continues across interrupted ordered lists (e.g. `1. Q` + answer + `1. Q`)
   * so markers stay 1, 2, 3… instead of resetting to 1 each time.
   */
  let nextOlNumber = 1;
  /** Soft-wrapped lines within the current paragraph (single Enter). */
  let paragraphLines: string[] = [];
  /** Consecutive quote lines with nesting depth from leading `>` markers. */
  let quoteLines: { depth: number; text: string }[] = [];
  /** Next flushed paragraph should use a larger top gap (after blank Enter). */
  let pendingParagraphBreak = false;

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const body = paragraphLines.map(inlineMarkdown).join("<br />");
    const spacing = pendingParagraphBreak
      ? "mt-6 mb-1"
      : html.length === 0
        ? "mt-0 mb-1"
        : "mt-3 mb-1";
    html.push(
      `<p class="${spacing} text-[0.95rem] leading-7 text-slate-700">${body}</p>`,
    );
    paragraphLines = [];
    pendingParagraphBreak = false;
  };

  const quoteClass =
    "my-0 border-l-4 border-slate-300 bg-slate-50 py-0 pl-4 pr-0 leading-7 text-slate-700";

  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    pendingParagraphBreak = false;

    const parts: string[] = [];
    let currentDepth = 0;

    for (let i = 0; i < quoteLines.length; i++) {
      const { depth, text } = quoteLines[i]!;
      const targetDepth = Math.max(1, depth);

      while (currentDepth < targetDepth) {
        parts.push(`<blockquote class="${quoteClass}">`);
        currentDepth += 1;
      }
      while (currentDepth > targetDepth) {
        parts.push("</blockquote>");
        currentDepth -= 1;
      }

      parts.push(inlineMarkdown(text));
      if (i < quoteLines.length - 1) {
        const nextDepth = Math.max(1, quoteLines[i + 1]!.depth);
        // Same nesting level continues on the next line inside this quote.
        if (nextDepth === currentDepth) {
          parts.push("<br />");
        }
      }
    }

    while (currentDepth > 0) {
      parts.push("</blockquote>");
      currentDepth -= 1;
    }

    html.push(parts.join(""));
    quoteLines = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushQuote();
      if (inCode) {
        html.push(
          `<pre class="my-4 overflow-x-auto rounded-xl bg-slate-900 p-3 text-sm leading-6 text-slate-100"><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`,
        );
        codeBuffer = [];
        inCode = false;
      } else {
        closeLists();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    if (!line.trim()) {
      closeLists();
      flushQuote();
      if (paragraphLines.length > 0) {
        flushParagraph();
        pendingParagraphBreak = true;
      } else if (html.length > 0) {
        // Extra blank Enter — add visible spacer between blocks
        html.push('<div class="h-4" aria-hidden="true"></div>');
      }
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushQuote();
      closeLists();
      nextOlNumber = 1;
      const level = heading[1].length;
      const sizes =
        level === 1
          ? "text-2xl"
          : level === 2
            ? "text-xl"
            : "text-lg";
      const top = pendingParagraphBreak ? "mt-6" : "mt-4";
      pendingParagraphBreak = false;
      html.push(
        `<h${level} class="${sizes} font-semibold tracking-tight text-slate-900 ${top} mb-2 first:mt-0">${inlineMarkdown(heading[2])}</h${level}>`,
      );
      continue;
    }

    // Count leading `>` markers: `> a`, `> > b`, `>>c` → depths 1, 2, 2.
    if (/^>\s?/.test(line)) {
      flushParagraph();
      closeLists();
      let depth = 0;
      let rest = line;
      while (/^>\s?/.test(rest)) {
        const next = /^>\s?(.*)$/.exec(rest);
        if (!next) break;
        depth += 1;
        rest = next[1] ?? "";
      }
      quoteLines.push({ depth: Math.max(1, depth), text: rest });
      continue;
    }

    flushQuote();

    const ul = /^[-*]\s+(.+)$/.exec(line);
    if (ul) {
      flushParagraph();
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        const top = pendingParagraphBreak ? "mt-6" : "mt-3";
        pendingParagraphBreak = false;
        html.push(
          `<ul class="${top} mb-3 list-disc space-y-1.5 pl-5 text-slate-700">`,
        );
        inUl = true;
      }
      html.push(`<li class="leading-7">${inlineMarkdown(ul[1])}</li>`);
      continue;
    }

    const ol = /^\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      flushParagraph();
      if (inUl) {
        html.push("</ul>");
        inUl = false;
        nextOlNumber = 1;
      }
      if (!inOl) {
        const top = pendingParagraphBreak ? "mt-6" : "mt-3";
        pendingParagraphBreak = false;
        html.push(
          `<ol start="${nextOlNumber}" class="${top} mb-3 list-decimal space-y-1.5 pl-5 text-slate-700">`,
        );
        inOl = true;
      }
      html.push(`<li class="leading-7">${inlineMarkdown(ol[1])}</li>`);
      nextOlNumber += 1;
      continue;
    }

    closeLists();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushQuote();

  if (inCode) {
    html.push(
      `<pre class="my-4 overflow-x-auto rounded-xl bg-slate-900 p-3 text-sm leading-6 text-slate-100"><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`,
    );
  }
  closeLists();

  return html.join("\n");
}
