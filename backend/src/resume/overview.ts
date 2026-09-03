export type OverviewBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; text: string };

export function cleanLine(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[\s]*(?:[★📌✦✔✓*]|##)\s*/, "")
    .replace(/^[-–—*•▸ㆍ>]\s+/, "")
    .trim();
}

export function isDivider(line: string): boolean {
  return /^[-*_]{3,}$/.test(line.trim());
}

export function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (/^#{1,6}\s+\S/.test(trimmed)) return true;
  if (/^[★📌✦✔]/.test(trimmed)) return true;
  if (/^##\s/.test(trimmed)) return true;
  if (/^(tech stack|typical challenges|key results|how these tools|strategic )/i.test(cleanLine(trimmed))) {
    return true;
  }
  return false;
}

export function isBullet(line: string): boolean {
  return /^[-–—*•▸ㆍ>]\s+\S/.test(line.trim());
}

function looksLikeHook(line: string): boolean {
  const text = cleanLine(line);
  return (
    text.length > 40 &&
    text.length < 280 &&
    (/[—–-]/.test(text) || /\bneeded\b|\brequired\b|\blacked\b/i.test(text))
  );
}

export function parseOverview(overview: string): { hooks: string[]; blocks: OverviewBlock[] } {
  const rawLines = overview.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim());
  const lines = rawLines.filter((line, index) => line.length > 0 || (index > 0 && rawLines[index - 1]));
  const hooks: string[] = [];
  let i = 0;

  while (i < lines.length && hooks.length < 3) {
    const line = lines[i];
    if (!line) {
      i += 1;
      continue;
    }
    if (isHeading(line) && !looksLikeHook(line)) break;
    if (looksLikeHook(line) || (isBullet(line) && hooks.length < 3)) {
      hooks.push(cleanLine(line));
      i += 1;
      continue;
    }
    break;
  }

  const blocks: OverviewBlock[] = [];
  while (i < lines.length) {
    const line = lines[i];
    if (!line || isDivider(line)) {
      i += 1;
      continue;
    }
    if (isHeading(line)) {
      blocks.push({ type: "heading", text: cleanLine(line) });
      i += 1;
      continue;
    }
    if (/^>\s*/.test(line) || /^solution:/i.test(line)) {
      blocks.push({ type: "callout", text: cleanLine(line.replace(/^solution:\s*/i, "Solution: ")) });
      i += 1;
      continue;
    }
    if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i])) {
        items.push(cleanLine(lines[i]));
        i += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }
    blocks.push({ type: "paragraph", text: cleanLine(line) });
    i += 1;
  }

  return { hooks, blocks };
}

export function lastMonthLabel(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function closeLastJobPeriod(period: string): string {
  const end = lastMonthLabel();
  const text = period.trim();
  if (!text) return `${end} — ${end}`;
  const replaced = text.replace(/\bPresent\b/gi, end);
  const parts = replaced.split(/\s*[—–-]\s*/);
  if (parts.length >= 2) {
    return `${parts[0].trim()} — ${end}`;
  }
  return `${replaced} — ${end}`;
}

export function splitJobDescription(description: string): { summary: string; bullets: string[] } {
  const lines = description
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/illustrative employment/i.test(line));
  const bullets: string[] = [];
  const summaryParts: string[] = [];
  for (const line of lines) {
    if (isBullet(line) || line.startsWith("•")) {
      bullets.push(cleanLine(line));
    } else {
      summaryParts.push(cleanLine(line));
    }
  }
  return { summary: summaryParts.join(" "), bullets };
}

export function parseHourlyRate(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/[$,]/g, "")
    .replace(/\b(usd|us\$)\b/gi, "")
    .replace(/\s*(\/\s*h(ou)?r|per\s*hour|\/hr|hr)\s*/gi, "")
    .trim();
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function formatHourlyRate(rate: string): string {
  return `$${rate} USD / hour`;
}
