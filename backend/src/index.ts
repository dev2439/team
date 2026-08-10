import { readFileSync, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";
import { createToken } from "./auth/jwt.ts";
import {
  getUserById,
  listSubTeamNames,
  listUsers,
  loginWithEmailPassword,
  updateListedUser,
} from "./auth/login.ts";
import { getAuthPayload } from "./auth/middleware.ts";
import { isUserRole } from "./types/user.ts";
import { createBid, listBidsForSubTeam } from "./bids.ts";
import { checkDatabase, closePool } from "./db.ts";
import { readJsonBody } from "./http.ts";
import { getCurrentWeekReports, upsertTodayReport } from "./reports.ts";
import { listSubTeamsWithMembers } from "./sub-teams.ts";
import { getTarget, upsertTarget } from "./targets.ts";
import {
  isFinancialType,
  listFinancialInRange,
  upsertFinancial,
} from "./financials.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, "../.env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv();

const PORT = Number(process.env.PORT) || 4000;
const FRONTEND_ORIGINS = (
  process.env.FRONTEND_ORIGIN || "http://localhost:3000"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const DEFAULT_FRONTEND_ORIGIN = FRONTEND_ORIGINS[0] ?? "http://localhost:3000";

function isAllowedOrigin(origin: string): boolean {
  if (FRONTEND_ORIGINS.includes("*") || FRONTEND_ORIGINS.includes(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);
    const host = url.hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
    );
  } catch {
    return false;
  }
}

function corsHeaders(req: IncomingMessage) {
  const origin = req.headers.origin;
  const allowOrigin =
    origin && isAllowedOrigin(origin) ? origin : DEFAULT_FRONTEND_ORIGIN;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, authorization, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    ...corsHeaders(req),
  });
  res.end(payload);
}

const server = createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(req, res, 400, { error: "Bad request" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      const database = await checkDatabase();
      sendJson(req, res, database.ok ? 200 : 503, {
        status: database.ok ? "ok" : "degraded",
        service: "backend",
        timestamp: new Date().toISOString(),
        database,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api") {
      sendJson(req, res, 200, {
        message: "Welcome to the Team API",
        version: "1.0.0",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      let body: Record<string, unknown> | null;

      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(req, res, 400, { error: "Invalid JSON body" });
        return;
      }

      const email = typeof body?.email === "string" ? body.email : "";
      const password = typeof body?.password === "string" ? body.password : "";

      if (!email.trim() || !password) {
        sendJson(req, res, 400, { error: "Email and password are required" });
        return;
      }

      const user = await loginWithEmailPassword(email, password);
      if (!user) {
        sendJson(req, res, 401, { error: "Invalid email or password" });
        return;
      }

      const token = createToken(user);
      sendJson(req, res, 200, { token, user });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const user = await getUserById(payload.sub);
      if (!user) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      sendJson(req, res, 200, { user });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/bids") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const bids = await listBidsForSubTeam(payload.sub);
      sendJson(req, res, 200, { bids });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/bids") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      let body: Record<string, unknown> | null;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(req, res, 400, { error: "Invalid JSON body" });
        return;
      }

      const bidUrlRaw = typeof body?.url === "string" ? body.url.trim() : "";
      const proposal =
        typeof body?.proposal === "string" ? body.proposal.trim() : "";

      if (!bidUrlRaw || !proposal) {
        sendJson(req, res, 400, { error: "URL and proposal are required" });
        return;
      }

      const bidUrl = /^https?:\/\//i.test(bidUrlRaw)
        ? bidUrlRaw
        : `https://${bidUrlRaw}`;

      try {
        new URL(bidUrl);
      } catch {
        sendJson(req, res, 400, { error: "URL must be a valid URL" });
        return;
      }

      const bid = await createBid({
        userId: payload.sub,
        url: bidUrl,
        proposal,
      });
      sendJson(req, res, 201, { bid });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/reports/week") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const week = await getCurrentWeekReports(payload.sub);
      sendJson(req, res, 200, week);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/sub-teams") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const subTeams = await listSubTeamsWithMembers();
      sendJson(req, res, 200, { sub_teams: subTeams });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const [users, subTeams] = await Promise.all([
        listUsers(),
        listSubTeamNames(),
      ]);
      sendJson(req, res, 200, { users, sub_teams: subTeams });
      return;
    }

    {
      const userMatch = /^\/api\/users\/(\d+)$/.exec(url.pathname);
      if (req.method === "PUT" && userMatch) {
        const payload = getAuthPayload(req);
        if (!payload) {
          sendJson(req, res, 401, { error: "Unauthorized" });
          return;
        }

        const userId = Number(userMatch[1]);
        if (!Number.isFinite(userId)) {
          sendJson(req, res, 400, { error: "Invalid user id" });
          return;
        }

        let body: Record<string, unknown> | null;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(req, res, 400, { error: "Invalid JSON body" });
          return;
        }

        const roleRaw = typeof body?.role === "string" ? body.role : undefined;
        const hasSubTeam = Object.prototype.hasOwnProperty.call(
          body ?? {},
          "sub_team",
        );
        const subTeamRaw = hasSubTeam
          ? body?.sub_team === null || body?.sub_team === ""
            ? null
            : typeof body?.sub_team === "string"
              ? body.sub_team
              : undefined
          : undefined;

        if (roleRaw !== undefined && !isUserRole(roleRaw)) {
          sendJson(req, res, 400, {
            error: "role must be Member, SubBoss, or BigBoss",
          });
          return;
        }

        if (hasSubTeam && subTeamRaw === undefined) {
          sendJson(req, res, 400, { error: "Invalid sub_team value" });
          return;
        }

        if (roleRaw === undefined && !hasSubTeam) {
          sendJson(req, res, 400, { error: "Nothing to update" });
          return;
        }

        try {
          const user = await updateListedUser({
            userId,
            role: roleRaw,
            subTeam: hasSubTeam ? subTeamRaw : undefined,
          });

          if (!user) {
            sendJson(req, res, 404, { error: "User not found" });
            return;
          }

          sendJson(req, res, 200, { user });
          return;
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to update user";
          sendJson(
            req,
            res,
            message === "Sub team not found" ? 400 : 500,
            { error: message },
          );
          return;
        }
      }
    }

    if (req.method === "GET" && url.pathname === "/api/targets") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const target = await getTarget();
      sendJson(req, res, 200, { target });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/financial") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const from = url.searchParams.get("from")?.trim() ?? "";
      const to = url.searchParams.get("to")?.trim() ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        sendJson(req, res, 400, {
          error: "from and to query params (YYYY-MM-DD) are required",
        });
        return;
      }

      const entries = await listFinancialInRange({ from, to });
      sendJson(req, res, 200, { financial: entries });
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/financial") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      let body: Record<string, unknown> | null;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(req, res, 400, { error: "Invalid JSON body" });
        return;
      }

      const userId = Number(body?.user_id);
      const amount = Number(body?.amount);
      const typeRaw = typeof body?.type === "string" ? body.type.trim() : "";
      const note = typeof body?.note === "string" ? body.note : "";
      const day = typeof body?.day === "string" ? body.day.trim() : "";

      if (!Number.isFinite(userId) || !Number.isFinite(amount)) {
        sendJson(req, res, 400, { error: "Invalid user_id or amount" });
        return;
      }

      if (!isFinancialType(typeRaw)) {
        sendJson(req, res, 400, { error: "type must be in, ums, or out" });
        return;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        sendJson(req, res, 400, { error: "day must be YYYY-MM-DD" });
        return;
      }

      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      if (day !== todayKey) {
        sendJson(req, res, 400, { error: "Only today's financial values can be edited" });
        return;
      }

      const entry = await upsertFinancial({
        userId: Math.trunc(userId),
        amount,
        type: typeRaw,
        note,
        day,
      });
      sendJson(req, res, 200, { financial: entry });
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/targets") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      let body: Record<string, unknown> | null;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(req, res, 400, { error: "Invalid JSON body" });
        return;
      }

      const raw =
        body?.target && typeof body.target === "object"
          ? (body.target as Record<string, unknown>)
          : body;

      const month = Number(raw?.month);
      const week = Number(raw?.week);
      const sub1 = Number(raw?.sub1);
      const sub2 = Number(raw?.sub2);

      if (![month, week, sub1, sub2].every((value) => Number.isFinite(value))) {
        sendJson(req, res, 400, { error: "Invalid target values" });
        return;
      }

      const target = await upsertTarget({
        month: Math.trunc(month),
        week: Math.trunc(week),
        sub1,
        sub2,
      });
      sendJson(req, res, 200, { target });
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/reports/today") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      let body: Record<string, unknown> | null;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(req, res, 400, { error: "Invalid JSON body" });
        return;
      }

      const workingTime = Number(body?.working_time);
      const message = Number(body?.message);
      const call = Number(body?.call);
      const offer = Number(body?.offer);
      const accounts = Number(body?.accounts);

      if (
        ![workingTime, message, call, offer, accounts].every((value) =>
          Number.isFinite(value),
        )
      ) {
        sendJson(req, res, 400, { error: "Invalid report values" });
        return;
      }

      const report = await upsertTodayReport({
        userId: payload.sub,
        workingTime,
        message: Math.trunc(message),
        call: Math.trunc(call),
        offer: Math.trunc(offer),
        accounts: Math.trunc(accounts),
      });
      sendJson(req, res, 200, { report });
      return;
    }

    sendJson(req, res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    sendJson(req, res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend listening on http://0.0.0.0:${PORT}`);
});

async function shutdown() {
  console.log("Shutting down…");
  server.close();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
