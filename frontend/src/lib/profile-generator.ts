import { getToken } from "@/lib/auth";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const PROFILE_TIMEOUT_MS = 290_000;

const DEFAULT_N8N_PROFILE_WEBHOOK_URL =
  "https://dev868848.app.n8n.cloud/webhook/profile-generator";

function getN8nProfileWebhookUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_N8N_PROFILE_WEBHOOK_URL?.trim();
  return fromEnv || DEFAULT_N8N_PROFILE_WEBHOOK_URL;
}

export type ProfileGeneratorInput = {
  stack: string;
  country: string;
  hourlyRate: string;
  systemPrompt?: string;
};

function messageFromN8nBody(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder().decode(bytes);
    const data = JSON.parse(text) as {
      error?: unknown;
      value?: unknown;
      message?: unknown;
    };
    for (const candidate of [data.error, data.value, data.message]) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function generateProfileDocxRequest(
  input: ProfileGeneratorInput,
): Promise<Blob> {
  if (!getToken()) {
    throw new Error("Not signed in");
  }

  const stack = input.stack.trim();
  const country = input.country.trim();
  const hourlyRate = input.hourlyRate.trim();
  if (!stack || !country || !hourlyRate) {
    throw new Error(
      "Technical stack, education country, and hourly rate are required.",
    );
  }

  const body: Record<string, string> = { stack, country, hourlyRate };
  if (input.systemPrompt?.trim()) {
    body.systemPrompt = input.systemPrompt.trim();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);

  try {
    const res = await fetch(getN8nProfileWebhookUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const contentType = res.headers.get("content-type") ?? "";
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isZipMagic =
      bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    const isDocxHeader =
      contentType.includes(DOCX_MIME) ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("application/zip");

    if (!res.ok || (!isDocxHeader && !isZipMagic)) {
      throw new Error(
        messageFromN8nBody(bytes) ||
          (res.status === 404
            ? "Profile webhook was not found."
            : `Request failed (${res.status})`),
      );
    }

    if (!isZipMagic) {
      throw new Error("n8n did not return a Word document.");
    }

    return new Blob([bytes], { type: DOCX_MIME });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Profile generation timed out. Try again in a moment.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
