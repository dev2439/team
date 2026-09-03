import type { IncomingMessage } from "node:http";

export async function readJsonBody(
  req: IncomingMessage & { body?: unknown },
): Promise<Record<string, unknown> | null> {
  if (req.body !== undefined && req.body !== null && req.body !== "") {
    if (Buffer.isBuffer(req.body)) {
      const raw = req.body.toString("utf8").trim();
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    }
    if (typeof req.body === "string") {
      const raw = req.body.trim();
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    }
    if (typeof req.body === "object" && !Array.isArray(req.body)) {
      return req.body as Record<string, unknown>;
    }
  }

  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;

  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
}
