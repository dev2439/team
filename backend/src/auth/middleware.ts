import type { IncomingMessage } from "node:http";
import { verifyToken, type JwtPayload } from "./jwt.ts";

export function getBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export function getAuthPayload(req: IncomingMessage): JwtPayload | null {
  const token = getBearerToken(req);
  if (!token) return null;
  return verifyToken(token);
}
