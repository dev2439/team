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
    '<code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800">$1</code>',
  );
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-sky-700 underline underline-offset-2">$1</a>',
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  return html;
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const html: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuffer: string[] = [];

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

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push(
          `<pre class="overflow-x-auto rounded-xl bg-slate-900 p-3 text-sm text-slate-100"><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`,
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

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      const sizes =
        level === 1
          ? "text-2xl"
          : level === 2
            ? "text-xl"
            : "text-lg";
      html.push(
        `<h${level} class="${sizes} font-semibold text-slate-900 mt-3 mb-2">${inlineMarkdown(heading[2])}</h${level}>`,
      );
      continue;
    }

    const ul = /^[-*]\s+(.+)$/.exec(line);
    if (ul) {
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul class="my-2 list-disc space-y-1 pl-5 text-slate-700">');
        inUl = true;
      }
      html.push(`<li>${inlineMarkdown(ul[1])}</li>`);
      continue;
    }

    const ol = /^\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push(
          '<ol class="my-2 list-decimal space-y-1 pl-5 text-slate-700">',
        );
        inOl = true;
      }
      html.push(`<li>${inlineMarkdown(ol[1])}</li>`);
      continue;
    }

    if (!line.trim()) {
      closeLists();
      continue;
    }

    closeLists();
    html.push(`<p class="my-2 leading-7 text-slate-700">${inlineMarkdown(line)}</p>`);
  }

  if (inCode) {
    html.push(
      `<pre class="overflow-x-auto rounded-xl bg-slate-900 p-3 text-sm text-slate-100"><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`,
    );
  }
  closeLists();

  return html.join("\n");
}
