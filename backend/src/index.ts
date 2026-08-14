import { readFileSync, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";
import { createToken } from "./auth/jwt.ts";
import {
  changePassword,
  getUserById,
  listSubTeamNames,
  listUsers,
  loginWithEmailPassword,
  updateListedUser,
} from "./auth/login.ts";
import { getAuthPayload } from "./auth/middleware.ts";
import { isUserRole } from "./types/user.ts";
import { createBid, listBidsForSubTeam, listTeamBids } from "./bids.ts";
import { checkDatabase, closePool } from "./db.ts";
import { readJsonBody } from "./http.ts";
import {
  getCurrentWeekReports,
  getSubTeamWeekReports,
  listTeamReports,
  upsertReportForDate,
  upsertTodayReport,
} from "./reports.ts";
import { listSubTeamsWithMembers } from "./sub-teams.ts";
import { getTarget, upsertTarget } from "./targets.ts";
import {
  isFinancialType,
  listFinancialInRange,
  upsertFinancial,
} from "./financials.ts";
import { createDeposit, listDeposits, projectOwnedByUser as depositProjectOwnedByUser } from "./deposits.ts";
import { createProject, deleteProjectForUser, listProjects, listProjectsForUser } from "./projects.ts";
import { upsertEta, listEtas, projectOwnedByUser } from "./etas.ts";
import {
  listUnreadBidNotifications,
  markBidNotificationsRead,
} from "./notifications.ts";

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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, authorization, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function sendJson(
  _req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    ...corsHeaders(),
  });
  res.end(payload);
}

const server = createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(req, res, 400, { error: "Bad request" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
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

    if (req.method === "POST" && url.pathname === "/api/auth/change-password") {
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

      const currentPassword =
        typeof body?.currentPassword === "string" ? body.currentPassword : "";
      const newPassword =
        typeof body?.newPassword === "string" ? body.newPassword : "";

      const result = await changePassword({
        userId: payload.sub,
        currentPassword,
        newPassword,
      });

      if (!result.ok) {
        const status =
          result.error === "Current password is incorrect" ? 401 : 400;
        sendJson(req, res, status, { error: result.error });
        return;
      }

      sendJson(req, res, 200, { ok: true });
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

    if (req.method === "GET" && url.pathname === "/api/team-bids") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const bids = await listTeamBids();
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
      const imageRaw =
        typeof body?.image === "string" ? body.image.trim() : "";
      const image = imageRaw || null;

      if (!bidUrlRaw || !proposal) {
        sendJson(req, res, 400, { error: "URL and proposal are required" });
        return;
      }

      if (
        image &&
        (!image.startsWith("data:image/") || image.length > 3_500_000)
      ) {
        sendJson(req, res, 400, {
          error: "image must be a data URL under ~2.5MB",
        });
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
        image,
      });
      sendJson(req, res, 201, { bid });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/notifications") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const notifications = await listUnreadBidNotifications(payload.sub);
      const recipientUserIds = [
        ...new Set(notifications.map((item) => item.recipient_user_id)),
      ];
      sendJson(req, res, 200, {
        notifications,
        recipient_user_ids: recipientUserIds,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/notifications/read") {
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

      const idsRaw = body?.ids;
      const ids = Array.isArray(idsRaw)
        ? idsRaw
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0)
            .map((value) => Math.trunc(value))
        : undefined;

      const updated = await markBidNotificationsRead(
        payload.sub,
        ids && ids.length > 0 ? ids : undefined,
      );
      sendJson(req, res, 200, { ok: true, updated });
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

    if (req.method === "GET" && url.pathname === "/api/reports/sub-team-week") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const week = await getSubTeamWeekReports(payload.sub);
      sendJson(req, res, 200, week);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/team-reports") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const reports = await listTeamReports();
      sendJson(req, res, 200, { reports });
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
      const day = typeof body?.day === "string" ? body.day.trim() : "";

      if (!Number.isFinite(userId) || !Number.isFinite(amount)) {
        sendJson(req, res, 400, { error: "Invalid user_id or amount" });
        return;
      }

      if (!isFinancialType(typeRaw)) {
        sendJson(req, res, 400, { error: "type is required" });
        return;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        sendJson(req, res, 400, { error: "day must be YYYY-MM-DD" });
        return;
      }

      const today = new Date();
      const todayLocal = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );
      const [yearRaw, monthRaw, dayRaw] = day.split("-");
      const weekStart = new Date(
        Number(yearRaw),
        Number(monthRaw) - 1,
        Number(dayRaw),
      );
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      if (todayLocal < weekStart || todayLocal > weekEnd) {
        sendJson(req, res, 400, {
          error: "Only the current week's financial values can be edited",
        });
        return;
      }

      const entry = await upsertFinancial({
        userId: Math.trunc(userId),
        amount,
        type: typeRaw.trim(),
        day,
      });
      sendJson(req, res, 200, { financial: entry });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/deposits") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const deposits = await listDeposits();
      sendJson(req, res, 200, { deposits });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/deposits") {
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

      const projectId = Math.trunc(Number(body?.project_id));
      const amount = Number(body?.amount);
      const userIdRaw = body?.user_id;
      const parsedBodyUserId =
        typeof userIdRaw === "number"
          ? userIdRaw
          : typeof userIdRaw === "string" && userIdRaw.trim() !== ""
            ? Number(userIdRaw)
            : NaN;
      // Prefer explicit user_id from body (selected Financial member).
      // Fall back to signed-in user only when user_id is omitted (Deposit page).
      const userId = Number.isFinite(parsedBodyUserId)
        ? parsedBodyUserId
        : Number(payload.sub);

      if (!Number.isFinite(projectId) || projectId <= 0) {
        sendJson(req, res, 400, { error: "project_id is required" });
        return;
      }

      if (!Number.isFinite(amount)) {
        sendJson(req, res, 400, { error: "amount must be a valid number" });
        return;
      }

      if (!Number.isFinite(userId)) {
        sendJson(req, res, 400, { error: "user_id must be a valid number" });
        return;
      }

      const targetUserId = Math.trunc(userId);
      const targetUser = await getUserById(targetUserId);
      if (!targetUser) {
        sendJson(req, res, 400, { error: "user_id does not match a user" });
        return;
      }

      const ownsProject = await depositProjectOwnedByUser(
        projectId,
        targetUserId,
      );
      if (!ownsProject) {
        sendJson(req, res, 400, {
          error: "project_id must belong to the deposit user",
        });
        return;
      }

      const deposit = await createDeposit({
        userId: targetUserId,
        projectId,
        amount,
      });
      sendJson(req, res, 201, { deposit });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/projects") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const projects = await listProjects();
      sendJson(req, res, 200, { projects });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/projects/mine") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const userId = Math.trunc(Number(payload.sub));
      if (!Number.isFinite(userId) || userId <= 0) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const projects = await listProjectsForUser(userId);
      sendJson(req, res, 200, { projects });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/projects") {
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

      const name = typeof body?.name === "string" ? body.name.trim() : "";

      if (!name) {
        sendJson(req, res, 400, { error: "name is required" });
        return;
      }

      const userId = Math.trunc(Number(payload.sub));
      if (!Number.isFinite(userId) || userId <= 0) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const project = await createProject({
        userId,
        name,
      });
      sendJson(req, res, 201, { project });
      return;
    }

    {
      const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
      if (req.method === "DELETE" && projectMatch) {
        const payload = getAuthPayload(req);
        if (!payload) {
          sendJson(req, res, 401, { error: "Unauthorized" });
          return;
        }

        const userId = Math.trunc(Number(payload.sub));
        if (!Number.isFinite(userId) || userId <= 0) {
          sendJson(req, res, 401, { error: "Unauthorized" });
          return;
        }

        const projectId = Math.trunc(Number(projectMatch[1]));
        if (!Number.isFinite(projectId) || projectId <= 0) {
          sendJson(req, res, 400, { error: "Invalid project id" });
          return;
        }

        const deleted = await deleteProjectForUser(projectId, userId);
        if (!deleted) {
          sendJson(req, res, 404, { error: "Project not found" });
          return;
        }

        sendJson(req, res, 200, { ok: true });
        return;
      }
    }

    if (req.method === "GET" && url.pathname === "/api/etas") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const etas = await listEtas();
      sendJson(req, res, 200, { etas });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/etas") {
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

      const userId = Math.trunc(Number(payload.sub));
      if (!Number.isFinite(userId) || userId <= 0) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const projectId = Math.trunc(Number(body?.project_id));
      const amount = Number(body?.amount);

      if (!Number.isFinite(projectId) || projectId <= 0) {
        sendJson(req, res, 400, { error: "project_id is required" });
        return;
      }

      if (!Number.isFinite(amount)) {
        sendJson(req, res, 400, { error: "amount must be a valid number" });
        return;
      }

      const ownsProject = await projectOwnedByUser(projectId, userId);
      if (!ownsProject) {
        sendJson(req, res, 400, {
          error: "project_id must be one of your projects",
        });
        return;
      }

      const eta = await upsertEta({
        projectId,
        userId,
        amount,
      });
      sendJson(req, res, 200, { eta });
      return;
    }

    // Financial page: save Bid amount delta for a specific member (user_id required)
    if (req.method === "POST" && url.pathname === "/api/deposits/bid") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      if (payload.role === "Member") {
        sendJson(req, res, 403, { error: "Members cannot edit Bid amounts" });
        return;
      }

      let body: Record<string, unknown> | null;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(req, res, 400, { error: "Invalid JSON body" });
        return;
      }

      const userIdRaw = body?.user_id;
      const amount = Number(body?.amount);
      const userId =
        typeof userIdRaw === "number"
          ? userIdRaw
          : typeof userIdRaw === "string" && userIdRaw.trim() !== ""
            ? Number(userIdRaw)
            : NaN;

      if (!Number.isFinite(userId)) {
        sendJson(req, res, 400, {
          error: "user_id is required for Bid deposit",
        });
        return;
      }

      if (!Number.isFinite(amount)) {
        sendJson(req, res, 400, { error: "amount must be a valid number" });
        return;
      }

      const targetUserId = Math.trunc(userId);
      const targetUser = await getUserById(targetUserId);
      if (!targetUser) {
        sendJson(req, res, 400, { error: "user_id does not match a user" });
        return;
      }

      const deposit = await createDeposit({
        userId: targetUserId,
        projectId: null,
        amount,
      });
      sendJson(req, res, 201, { deposit });
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

    if (
      req.method === "PUT" &&
      (url.pathname === "/api/reports/today" ||
        url.pathname === "/api/reports/day")
    ) {
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
      const dateRaw =
        typeof body?.date === "string" ? body.date.trim() : "";

      if (
        ![workingTime, message, call, offer, accounts].every((value) =>
          Number.isFinite(value),
        )
      ) {
        sendJson(req, res, 400, { error: "Invalid report values" });
        return;
      }

      try {
        const report = dateRaw
          ? await upsertReportForDate({
              userId: payload.sub,
              date: dateRaw,
              workingTime,
              message: Math.trunc(message),
              call: Math.trunc(call),
              offer: Math.trunc(offer),
              accounts: Math.trunc(accounts),
            })
          : await upsertTodayReport({
              userId: payload.sub,
              workingTime,
              message: Math.trunc(message),
              call: Math.trunc(call),
              offer: Math.trunc(offer),
              accounts: Math.trunc(accounts),
            });
        sendJson(req, res, 200, { report });
      } catch (err) {
        const messageText =
          err instanceof Error ? err.message : "Failed to save report";
        if (
          messageText.includes("date must") ||
          messageText.includes("current week")
        ) {
          sendJson(req, res, 400, { error: messageText });
          return;
        }
        throw err;
      }
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
