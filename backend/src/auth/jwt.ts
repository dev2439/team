import { createHmac, timingSafeEqual } from "node:crypto";
import type { UserRole } from "../types/user.ts";

export type JwtPayload = {
  sub: number;
  email: string;
  name: string;
  role: UserRole;
  iat: number;
  exp: number;
};

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set. Add it to backend/.env");
  }
  return secret;
}

function getExpiresInSeconds(): number {
  return Number(process.env.JWT_EXPIRES_IN) || 60 * 60 * 24 * 7;
}

function encode(value: object | string): string {
  const input = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.from(input).toString("base64url");
}

function decodeJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function sign(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

export function createToken(user: {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    iat: now,
    exp: now + getExpiresInSeconds(),
  };

  const header = encode({ alg: "HS256", typ: "JWT" });
  const body = encode(payload);
  const signature = sign(`${header}.${body}`, getSecret());
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  if (!header || !body || !signature) return null;

  const expected = sign(`${header}.${body}`, getSecret());
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);

  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return null;
  }

  try {
    const payload = decodeJson<JwtPayload>(body);
    if (
      typeof payload.sub !== "number" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
