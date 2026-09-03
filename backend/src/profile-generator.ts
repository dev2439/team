import { buildResumeDocx } from "./resume/build-resume-docx.ts";
import { parseHourlyRate } from "./resume/overview.ts";
import { parseResumeProfile } from "./resume/parse-profile.ts";

const N8N_PROFILE_WEBHOOK_URL =
  process.env.N8N_PROFILE_WEBHOOK_URL ??
  "https://dev868848.app.n8n.cloud/webhook/profile-generator";

const N8N_TIMEOUT_MS = 280_000;

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ProfileGeneratorInput = {
  stack?: unknown;
  country?: unknown;
  hourlyRate?: unknown;
  systemPrompt?: unknown;
  prompt?: unknown;
};

export type ProfileGeneratorResult =
  | { ok: true; buffer: Buffer }
  | { ok: false; status: number; error: string };

function isDocxBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 2).toString("ascii") === "PK";
}

function messageFromJson(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as {
      error?: unknown;
      value?: unknown;
      message?: unknown;
    };
    const candidates = [parsed.error, parsed.value, parsed.message];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function generateProfileDocx(
  payload: ProfileGeneratorInput,
): Promise<ProfileGeneratorResult> {
  const stack = typeof payload.stack === "string" ? payload.stack.trim() : "";
  const country =
    typeof payload.country === "string" ? payload.country.trim() : "";
  const hourlyRateRaw =
    typeof payload.hourlyRate === "string"
      ? payload.hourlyRate.trim()
      : payload.hourlyRate == null
        ? ""
        : String(payload.hourlyRate).trim();
  const hourlyRate = parseHourlyRate(hourlyRateRaw);
  const systemPromptRaw =
    typeof payload.systemPrompt === "string"
      ? payload.systemPrompt
      : typeof payload.prompt === "string"
        ? payload.prompt
        : "";
  const systemPrompt = systemPromptRaw.trim();

  if (!stack || !country || !hourlyRate) {
    return {
      ok: false,
      status: 400,
      error:
        "Technical stack, education country, and a numeric hourly rate are required.",
    };
  }

  const webhookBody: {
    stack: string;
    country: string;
    hourlyRate: string;
    systemPrompt?: string;
  } = { stack, country, hourlyRate };
  if (systemPrompt) {
    webhookBody.systemPrompt = systemPrompt;
  }

  try {
    const webhookResponse = await fetch(N8N_PROFILE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookBody),
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
    });

    const contentType = webhookResponse.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await webhookResponse.arrayBuffer());
    const text = buffer.toString("utf8");

    if (
      contentType.includes(DOCX_MIME) ||
      contentType.includes("application/octet-stream") ||
      isDocxBuffer(buffer)
    ) {
      if (isDocxBuffer(buffer)) {
        return { ok: true, buffer };
      }
    }

    const parsedMessage = messageFromJson(text);
    const timedOutGateway =
      webhookResponse.status === 524 ||
      text.includes("524: A timeout occurred") ||
      /request timed out/i.test(text) ||
      /request timed out/i.test(parsedMessage ?? "");

    if (timedOutGateway) {
      return {
        ok: false,
        status: 504,
        error:
          "Profile generation timed out while researching companies. Try again in a moment.",
      };
    }

    if (!webhookResponse.ok) {
      return {
        ok: false,
        status: webhookResponse.status >= 400 ? webhookResponse.status : 502,
        error:
          parsedMessage ||
          text.trim() ||
          `Workflow failed with status ${webhookResponse.status}.`,
      };
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    const profile = parseResumeProfile(parsed);
    if (profile) {
      const docx = await buildResumeDocx({ ...profile, hourlyRate });
      return { ok: true, buffer: docx };
    }

    return {
      ok: false,
      status: 502,
      error: parsedMessage || "n8n did not return a Word document.",
    };
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      status: timedOut ? 504 : 500,
      error: timedOut
        ? "n8n timed out. Try again in a moment."
        : error instanceof Error
          ? error.message
          : "Request failed",
    };
  }
}
