import { getApiBase, getToken } from "@/lib/auth";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const PROFILE_TIMEOUT_MS = 290_000;

export type ProfileGeneratorInput = {
  stack: string;
  country: string;
  hourlyRate: string;
  systemPrompt?: string;
};

export async function generateProfileDocxRequest(
  input: ProfileGeneratorInput,
): Promise<Blob> {
  const token = getToken();
  if (!token) {
    throw new Error("Not signed in");
  }

  const body: Record<string, string> = {
    stack: input.stack,
    country: input.country,
    hourlyRate: input.hourlyRate,
  };
  if (input.systemPrompt?.trim()) {
    body.systemPrompt = input.systemPrompt.trim();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);

  try {
    const res = await fetch(`${getApiBase()}/api/profile-generator`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const contentType = res.headers.get("content-type") ?? "";
    const isDocx =
      contentType.includes(DOCX_MIME) ||
      contentType.includes("application/octet-stream");

    if (!res.ok || !isDocx) {
      let message =
        res.status === 404
          ? "Profile API was not found. Refresh after the latest deploy."
          : `Request failed (${res.status})`;
      try {
        const data = (await res.json()) as { error?: string };
        message = data.error ?? message;
      } catch {
        // keep default
      }
      throw new Error(message);
    }

    return await res.blob();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Profile generation timed out. Try again in a moment.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
