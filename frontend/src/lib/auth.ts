export type PublicUser = {
  id: number;
  name: string;
  email: string;
  role: "Member" | "SubBoss" | "BigBoss";
  balance?: number;
};

export type LoginResponse = {
  token: string;
  user: PublicUser;
};

export type MeResponse = {
  user: PublicUser;
};

export type AuthError = {
  error: string;
};

const TOKEN_KEY = "team.token";
const AUTH_TIMEOUT_MS = 5_000;

/**
 * Browser calls go through the Next.js `/backend` rewrite (same origin),
 * so LAN access does not hit CORS. Server-side uses the backend directly.
 */
export function getApiBase(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/backend`;
  }

  return process.env.BACKEND_URL ?? "http://127.0.0.1:4000";
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = AUTH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetchWithTimeout(`${getApiBase()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = (await res.json()) as LoginResponse | AuthError;

  if (!res.ok) {
    throw new Error("error" in data ? data.error : "Login failed");
  }

  if (!("token" in data) || !("user" in data)) {
    throw new Error("Unexpected login response");
  }

  return data;
}

export async function fetchCurrentUser(
  token = getToken(),
): Promise<PublicUser | null> {
  if (!token) return null;

  try {
    const res = await fetchWithTimeout(`${getApiBase()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      clearToken();
      return null;
    }

    const data = (await res.json()) as MeResponse | AuthError;
    if (!("user" in data)) {
      clearToken();
      return null;
    }

    return data.user;
  } catch {
    return null;
  }
}

export async function changePasswordRequest(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const token = getToken();
  if (!token) {
    throw new Error("Not signed in");
  }

  const res = await fetchWithTimeout(
    `${getApiBase()}/api/auth/change-password`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  const data = (await res.json()) as { ok?: boolean } | AuthError;

  if (!res.ok) {
    throw new Error(
      "error" in data && typeof data.error === "string"
        ? data.error
        : "Failed to change password",
    );
  }
}

export function logout() {
  clearToken();
}
