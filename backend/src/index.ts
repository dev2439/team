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
  updateProfile,
} from "./auth/login.ts";
import { getAuthPayload } from "./auth/middleware.ts";
import { isUserRole } from "./types/user.ts";
import {
  assertBidDateKey,
  bidsVisibleToViewer,
  createBid,
  listBidDaysForSubTeam,
  listBidsForSubTeam,
  listTeamBidDays,
  listTeamBids,
} from "./bids.ts";
import {
  createFreelancerBid,
  listFreelancerBidDaysForSubTeam,
  listFreelancerBidsForSubTeam,
  listTeamFreelancerBidDays,
  listTeamFreelancerBids,
} from "./freelancer-bids.ts";
import {
  createTestBid,
  createTestBidProposal,
  getProposalForParentAndUser,
  listTestBidProposals,
  listTestBids,
  listRatingsForProposal,
  listTestBidViewers,
  recordTestBidView,
  setTestBidResultsVisible,
  toggleTestBidFavorite,
  upsertTestBidRating,
} from "./test-bids.ts";
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
  createPlanItem,
  deletePlanItem,
  listPlanItemsForMonth,
  listPlanItemsInRange,
  updatePlanItem,
} from "./plans.ts";
import type { PlanItemScope, PlanItemStatus } from "./types/plan.ts";
import {
  isFinancialType,
  listFinancialInRange,
  upsertFinancial,
} from "./financials.ts";
import { createDeposit, listDeposits, projectOwnedByUser as depositProjectOwnedByUser } from "./deposits.ts";
import { createProject, deleteProjectForUser, listProjects, listProjectsForUser } from "./projects.ts";
import { upsertEta, listEtas, projectOwnedByUser } from "./etas.ts";
import {
  createBidTestNotifications,
  listUnreadBidNotifications,
  markBidNotificationsRead,
  type NotificationReadItem,
} from "./notifications.ts";
import type { NotificationKind } from "./types/notification.ts";
import {
  createEvent,
  deleteEvent,
  getEventById,
  listEventsInRange,
  notifyDueEvents,
  updateEvent,
} from "./events.ts";
import { notifyDueBirthdays } from "./birthdays.ts";
import {
  DOCX_MIME,
  generateProfileDocx,
} from "./profile-generator.ts";

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
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
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
  if (res.headersSent || res.writableEnded) {
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    ...corsHeaders(),
  });
  res.end(payload);
}

function sendBinary(
  _req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: Buffer,
  headers: Record<string, string>,
) {
  if (res.headersSent || res.writableEnded) {
    return;
  }
  res.writeHead(status, {
    ...headers,
    "Content-Length": body.length,
    ...corsHeaders(),
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  req.on("error", () => {
    // Client aborted or reset the socket — ignore to avoid crashing the process.
  });
  res.on("error", () => {
    // Response stream errors (e.g. ECONNRESET from proxy) — ignore.
  });

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

    if (req.method === "PUT" && url.pathname === "/api/auth/profile") {
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

      try {
        const user = await updateProfile({
          userId: payload.sub,
          name: String(body?.name ?? ""),
          email: String(body?.email ?? ""),
          phone: body?.phone === undefined ? undefined : String(body.phone),
          jobTitle:
            body?.job_title === undefined ? "" : String(body.job_title),
          location:
            body?.location === undefined ? undefined : String(body.location),
          bio: body?.bio === undefined ? "" : String(body.bio),
          birthday:
            body?.birthday === undefined || body?.birthday === null
              ? null
              : String(body.birthday),
        });
        try {
          await notifyDueBirthdays();
        } catch (err) {
          console.error("Failed to notify due birthdays:", err);
        }
        sendJson(req, res, 200, { user });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update profile";
        const status = message.includes("not found") ? 404 : 400;
        sendJson(req, res, status, { error: message });
      }
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

    if (req.method === "GET" && url.pathname === "/api/bids/days") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const days = await listBidDaysForSubTeam(payload.sub);
      sendJson(req, res, 200, { days });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/bids") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const dateRaw = String(url.searchParams.get("date") ?? "").trim();
      try {
        const date = assertBidDateKey(dateRaw);
        const bids = bidsVisibleToViewer(
          await listBidsForSubTeam(payload.sub, date),
          { userId: payload.sub, role: payload.role },
        );
        sendJson(req, res, 200, { bids });
      } catch (err) {
        sendJson(req, res, 400, {
          error: err instanceof Error ? err.message : "date must be YYYY-MM-DD",
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/team-bids/days") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const days = await listTeamBidDays();
      sendJson(req, res, 200, { days });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/team-bids") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const dateRaw = String(url.searchParams.get("date") ?? "").trim();
      if (dateRaw) {
        try {
          const date = assertBidDateKey(dateRaw);
          const bids = await listTeamBids(date);
          sendJson(req, res, 200, { bids });
        } catch (err) {
          sendJson(req, res, 400, {
            error:
              err instanceof Error ? err.message : "date must be YYYY-MM-DD",
          });
        }
        return;
      }

      const bids = await listTeamBids();
      sendJson(req, res, 200, { bids });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/team-freelancer-bids/days") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }
      if (payload.role !== "BigBoss") {
        sendJson(req, res, 403, { error: "Forbidden" });
        return;
      }

      const days = await listTeamFreelancerBidDays();
      sendJson(req, res, 200, { days });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/team-freelancer-bids") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }
      if (payload.role !== "BigBoss") {
        sendJson(req, res, 403, { error: "Forbidden" });
        return;
      }

      const dateRaw = String(url.searchParams.get("date") ?? "").trim();
      if (dateRaw) {
        try {
          const date = assertBidDateKey(dateRaw);
          const bids = await listTeamFreelancerBids(date);
          sendJson(req, res, 200, { bids });
        } catch (err) {
          sendJson(req, res, 400, {
            error:
              err instanceof Error ? err.message : "date must be YYYY-MM-DD",
          });
        }
        return;
      }

      const bids = await listTeamFreelancerBids();
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
        !/^https:\/\/www\.upwork\.com\/jobs\/~\d+$/.test(bidUrlRaw)
      ) {
        sendJson(req, res, 400, {
          error:
            "URL must match https://www.upwork.com/jobs/~022088289986163309012",
        });
        return;
      }

      if (!image) {
        sendJson(req, res, 400, { error: "Image is required" });
        return;
      }

      if (
        !image.startsWith("data:image/") ||
        image.length > 3_500_000
      ) {
        sendJson(req, res, 400, {
          error: "image must be a data URL under ~2.5MB",
        });
        return;
      }

      const bid = await createBid({
        userId: payload.sub,
        url: bidUrlRaw,
        proposal,
        image,
      });
      sendJson(req, res, 201, { bid });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/freelancer-bids/days") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const days = await listFreelancerBidDaysForSubTeam(payload.sub);
      sendJson(req, res, 200, { days });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/freelancer-bids") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const dateRaw = String(url.searchParams.get("date") ?? "").trim();
      try {
        const date = assertBidDateKey(dateRaw);
        const bids = bidsVisibleToViewer(
          await listFreelancerBidsForSubTeam(payload.sub, date),
          { userId: payload.sub, role: payload.role },
        );
        sendJson(req, res, 200, { bids });
      } catch (err) {
        sendJson(req, res, 400, {
          error: err instanceof Error ? err.message : "date must be YYYY-MM-DD",
        });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/freelancer-bids") {
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

      if (!image) {
        sendJson(req, res, 400, { error: "Image is required" });
        return;
      }

      if (
        !image.startsWith("data:image/") ||
        image.length > 3_500_000
      ) {
        sendJson(req, res, 400, {
          error: "image must be a data URL under ~2.5MB",
        });
        return;
      }

      const bid = await createFreelancerBid({
        userId: payload.sub,
        url: bidUrlRaw,
        proposal,
        image,
      });
      sendJson(req, res, 201, { bid });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/test-bids") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const testBids = await listTestBids(payload.sub);
      sendJson(req, res, 200, { test_bids: testBids });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/test-bid-proposals") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      // BigBoss sees all proposals; others only published parents (+ their own).
      const proposals = await listTestBidProposals(payload.sub, {
        includeHiddenResults: payload.role === "BigBoss",
      });
      sendJson(req, res, 200, {
        proposals,
      });
      return;
    }

    {
      const resultsVisibleMatch =
        /^\/api\/test-bids\/(\d+)\/results-visible$/.exec(url.pathname);
      if (resultsVisibleMatch && req.method === "POST") {
        const payload = getAuthPayload(req);
        if (!payload) {
          sendJson(req, res, 401, { error: "Unauthorized" });
          return;
        }
        if (payload.role !== "BigBoss") {
          sendJson(req, res, 403, {
            error: "Only BigBoss can publish test results",
          });
          return;
        }

        const testBidId = Number(resultsVisibleMatch[1]);
        if (!Number.isFinite(testBidId) || testBidId <= 0) {
          sendJson(req, res, 400, { error: "Invalid test bid id" });
          return;
        }

        let body: Record<string, unknown> | null;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(req, res, 400, { error: "Invalid JSON body" });
          return;
        }

        const resultsVisible = Boolean(body?.results_visible);
        try {
          const testBid = await setTestBidResultsVisible({
            id: testBidId,
            resultsVisible,
          });
          sendJson(req, res, 200, { test_bid: testBid });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to update visibility";
          sendJson(
            req,
            res,
            message.includes("not found") ? 404 : 400,
            { error: message },
          );
        }
        return;
      }
    }

    {
      const favoriteMatch = /^\/api\/test-bid-proposals\/(\d+)\/favorite$/.exec(
        url.pathname,
      );
      if (favoriteMatch && req.method === "POST") {
        const payload = getAuthPayload(req);
        if (!payload) {
          sendJson(req, res, 401, { error: "Unauthorized" });
          return;
        }

        const testBidId = Number(favoriteMatch[1]);
        if (!Number.isFinite(testBidId) || testBidId <= 0) {
          sendJson(req, res, 400, { error: "Invalid proposal id" });
          return;
        }

        try {
          const result = await toggleTestBidFavorite({
            userId: payload.sub,
            testBidId,
          });
          sendJson(req, res, 200, result);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to update favorite";
          const status = message.includes("not found") ? 404 : 400;
          sendJson(req, res, status, { error: message });
        }
        return;
      }
    }

    {
      const viewersMatch = /^\/api\/test-bid-proposals\/(\d+)\/viewers$/.exec(
        url.pathname,
      );
      if (viewersMatch && req.method === "GET") {
        const payload = getAuthPayload(req);
        if (!payload) {
          sendJson(req, res, 401, { error: "Unauthorized" });
          return;
        }

        const testBidId = Number(viewersMatch[1]);
        if (!Number.isFinite(testBidId) || testBidId <= 0) {
          sendJson(req, res, 400, { error: "Invalid proposal id" });
          return;
        }

        const viewers = await listTestBidViewers(testBidId);
        sendJson(req, res, 200, { viewers });
        return;
      }
    }

    {
      const viewMatch = /^\/api\/test-bid-proposals\/(\d+)\/view$/.exec(
        url.pathname,
      );
      if (viewMatch && req.method === "POST") {
        const payload = getAuthPayload(req);
        if (!payload) {
          sendJson(req, res, 401, { error: "Unauthorized" });
          return;
        }

        const testBidId = Number(viewMatch[1]);
        if (!Number.isFinite(testBidId) || testBidId <= 0) {
          sendJson(req, res, 400, { error: "Invalid proposal id" });
          return;
        }

        try {
          const result = await recordTestBidView({
            userId: payload.sub,
            testBidId,
          });
          sendJson(req, res, 200, result);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to record view";
          const status = message.includes("not found") ? 404 : 400;
          sendJson(req, res, status, { error: message });
        }
        return;
      }
    }

    {
      const ratingMatch = /^\/api\/test-bid-proposals\/(\d+)\/rating$/.exec(
        url.pathname,
      );
      if (ratingMatch) {
        const payload = getAuthPayload(req);
        if (!payload) {
          sendJson(req, res, 401, { error: "Unauthorized" });
          return;
        }

        const testBidId = Number(ratingMatch[1]);
        if (!Number.isFinite(testBidId) || testBidId <= 0) {
          sendJson(req, res, 400, { error: "Invalid proposal id" });
          return;
        }

        if (req.method === "GET") {
          const ratings = await listRatingsForProposal(testBidId);
          sendJson(req, res, 200, { ratings });
          return;
        }

        if (req.method === "POST") {
          let body: Record<string, unknown> | null;
          try {
            body = await readJsonBody(req);
          } catch {
            sendJson(req, res, 400, { error: "Invalid JSON body" });
            return;
          }

          const rating = Number(body?.rating);
          const comment =
            typeof body?.comment === "string" ? body.comment : "";

          try {
            const row = await upsertTestBidRating({
              userId: payload.sub,
              testBidId,
              rating,
              comment,
            });
            sendJson(req, res, 200, { rating: row });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to save rating";
            const status = message.includes("not found") ? 404 : 400;
            sendJson(req, res, status, { error: message });
          }
          return;
        }
      }
    }

    if (req.method === "POST" && url.pathname === "/api/test-bids") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }
      if (payload.role !== "BigBoss") {
        sendJson(req, res, 403, {
          error: "Only BigBoss can create bid tests",
        });
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
      const imageRaw =
        typeof body?.image === "string" ? body.image.trim() : "";
      const image = imageRaw || null;

      if (!bidUrlRaw) {
        sendJson(req, res, 400, { error: "URL is required" });
        return;
      }

      if (
        !/^https:\/\/www\.upwork\.com\/jobs\/~\d+$/.test(bidUrlRaw)
      ) {
        sendJson(req, res, 400, {
          error:
            "URL must match https://www.upwork.com/jobs/~022088289986163309012",
        });
        return;
      }

      if (!image) {
        sendJson(req, res, 400, { error: "Image is required" });
        return;
      }

      if (
        !image.startsWith("data:image/") ||
        image.length > 3_500_000
      ) {
        sendJson(req, res, 400, {
          error: "image must be a data URL under ~2.5MB",
        });
        return;
      }

      try {
        const testBid = await createTestBid({
          url: bidUrlRaw,
          image,
          userId: payload.sub,
        });
        await createBidTestNotifications({
          bidTestId: testBid.id,
          actorUserId: payload.sub,
        });
        sendJson(req, res, 201, { test_bid: testBid });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create test bid";
        sendJson(req, res, 400, { error: message });
      }
      return;
    }

    {
      const proposalMatch = /^\/api\/test-bids\/(\d+)\/proposals$/.exec(
        url.pathname,
      );
      if (proposalMatch) {
        const payload = getAuthPayload(req);
        if (!payload) {
          sendJson(req, res, 401, { error: "Unauthorized" });
          return;
        }

        const parentId = Number(proposalMatch[1]);
        if (!Number.isFinite(parentId) || parentId <= 0) {
          sendJson(req, res, 400, { error: "Invalid test bid id" });
          return;
        }

        if (req.method === "GET") {
          const proposal = await getProposalForParentAndUser(
            parentId,
            payload.sub,
          );
          sendJson(req, res, 200, { proposal });
          return;
        }

        if (req.method === "POST") {
          if (
            payload.role !== "Member" &&
            payload.role !== "SubBoss" &&
            payload.role !== "Tester"
          ) {
            sendJson(req, res, 403, {
              error: "Only Member, SubBoss, and Tester can submit test bids",
            });
            return;
          }

          let body: Record<string, unknown> | null;
          try {
            body = await readJsonBody(req);
          } catch {
            sendJson(req, res, 400, { error: "Invalid JSON body" });
            return;
          }

          const proposalText =
            typeof body?.proposal === "string" ? body.proposal.trim() : "";
          if (!proposalText) {
            sendJson(req, res, 400, { error: "Proposal is required" });
            return;
          }

          try {
            const row = await createTestBidProposal({
              parentId,
              userId: payload.sub,
              proposal: proposalText,
            });
            sendJson(req, res, 201, { proposal: row });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to save proposal";
            const status = message.includes("not found") ? 404 : 400;
            sendJson(req, res, status, { error: message });
          }
          return;
        }
      }
    }

    if (req.method === "GET" && url.pathname === "/api/notifications") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      try {
        await notifyDueEvents();
        await notifyDueBirthdays();
      } catch (err) {
        console.error("Failed to notify due events:", err);
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

      const itemsRaw = body?.items;
      let items: NotificationReadItem[] | undefined;

      if (Array.isArray(itemsRaw)) {
        items = itemsRaw
          .map((value) => {
            if (!value || typeof value !== "object") return null;
            const record = value as Record<string, unknown>;
            const id = Number(record.id);
            const kind = record.kind;
            if (
              !Number.isFinite(id) ||
              id <= 0 ||
              (kind !== "bid" &&
                kind !== "bid_test" &&
                kind !== "event" &&
                kind !== "birthday")
            ) {
              return null;
            }
            return {
              id: Math.trunc(id),
              kind: kind as NotificationKind,
            };
          })
          .filter((value): value is NotificationReadItem => value != null);
      } else {
        // Backward compatible: { ids: number[] } means bid notifications.
        const idsRaw = body?.ids;
        if (Array.isArray(idsRaw)) {
          items = idsRaw
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0)
            .map((value) => ({
              id: Math.trunc(value),
              kind: "bid" as const,
            }));
        }
      }

      const updated = await markBidNotificationsRead(
        payload.sub,
        items && items.length > 0 ? items : undefined,
      );
      sendJson(req, res, 200, { ok: true, updated });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }

      const from = String(url.searchParams.get("from") ?? "").trim();
      const to = String(url.searchParams.get("to") ?? "").trim();
      try {
        const events = await listEventsInRange({ from, to });
        sendJson(req, res, 200, { events });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load events";
        sendJson(req, res, 400, { error: message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/events") {
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

      try {
        const event = await createEvent({
          userId: payload.sub,
          title: String(body?.title ?? ""),
          note: body?.note === undefined ? "" : String(body.note),
          startsAt: String(body?.starts_at ?? ""),
          endsAt: String(body?.ends_at ?? ""),
        });
        try {
          await notifyDueEvents();
        } catch (err) {
          console.error("Failed to notify due events:", err);
        }
        sendJson(req, res, 201, { event });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create event";
        sendJson(req, res, 400, { error: message });
      }
      return;
    }

    {
      const eventMatch = /^\/api\/events\/(\d+)$/.exec(url.pathname);
      if (eventMatch) {
        const payload = getAuthPayload(req);
        if (!payload) {
          sendJson(req, res, 401, { error: "Unauthorized" });
          return;
        }

        const eventId = Number(eventMatch[1]);
        if (!Number.isFinite(eventId) || eventId <= 0) {
          sendJson(req, res, 400, { error: "Invalid event id" });
          return;
        }

        const existing = await getEventById(eventId);
        if (!existing) {
          sendJson(req, res, 404, { error: "Event not found" });
          return;
        }

        const canManage =
          existing.user_id === payload.sub || payload.role === "BigBoss";
        if (!canManage) {
          sendJson(req, res, 403, {
            error: "You can only change your own events",
          });
          return;
        }

        if (req.method === "PUT") {
          let body: Record<string, unknown> | null;
          try {
            body = await readJsonBody(req);
          } catch {
            sendJson(req, res, 400, { error: "Invalid JSON body" });
            return;
          }

          try {
            const event = await updateEvent({
              id: eventId,
              title: body?.title === undefined ? undefined : String(body.title),
              note: body?.note === undefined ? undefined : String(body.note),
              startsAt:
                body?.starts_at === undefined
                  ? undefined
                  : String(body.starts_at),
              endsAt:
                body?.ends_at === undefined
                  ? undefined
                  : String(body.ends_at),
            });
            try {
              await notifyDueEvents();
            } catch (err) {
              console.error("Failed to notify due events:", err);
            }
            sendJson(req, res, 200, { event });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to update event";
            sendJson(
              req,
              res,
              message.includes("not found") ? 404 : 400,
              { error: message },
            );
          }
          return;
        }

        if (req.method === "DELETE") {
          try {
            await deleteEvent(eventId);
            sendJson(req, res, 200, { ok: true });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to delete event";
            sendJson(
              req,
              res,
              message.includes("not found") ? 404 : 400,
              { error: message },
            );
          }
          return;
        }
      }
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
            error: "role must be Member, SubBoss, BigBoss, or Tester",
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

    if (req.method === "GET" && url.pathname === "/api/plans") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }
      if (
        payload.role !== "Member" &&
        payload.role !== "SubBoss" &&
        payload.role !== "BigBoss" &&
        payload.role !== "Tester"
      ) {
        sendJson(req, res, 403, { error: "Forbidden" });
        return;
      }

      const from = String(url.searchParams.get("from") ?? "").trim();
      const to = String(url.searchParams.get("to") ?? "").trim();
      const month = String(url.searchParams.get("month") ?? "").trim();
      const requestedUserId = Number(url.searchParams.get("user_id"));
      const canViewOthers =
        payload.role === "BigBoss" || payload.role === "Tester";
      const userId =
        canViewOthers &&
        Number.isFinite(requestedUserId) &&
        requestedUserId > 0
          ? requestedUserId
          : payload.sub;

      try {
        const plans =
          from && to
            ? await listPlanItemsInRange({ from, to, userId })
            : month
              ? await listPlanItemsForMonth(month, userId)
              : null;
        if (plans == null) {
          sendJson(req, res, 400, {
            error: "Provide from & to (YYYY-MM-DD) or month (YYYY-MM)",
          });
          return;
        }
        sendJson(req, res, 200, { plans });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load plans";
        sendJson(req, res, 400, { error: message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/plans") {
      const payload = getAuthPayload(req);
      if (!payload) {
        sendJson(req, res, 401, { error: "Unauthorized" });
        return;
      }
      if (payload.role !== "Member" && payload.role !== "SubBoss") {
        sendJson(req, res, 403, {
          error: "Only members can create plans",
        });
        return;
      }

      let body: Record<string, unknown> | null;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(req, res, 400, { error: "Invalid JSON body" });
        return;
      }

      try {
        const scopeRaw = body?.scope;
        const scope =
          scopeRaw === undefined || scopeRaw === null
            ? "day"
            : String(scopeRaw);
        if (scope !== "day" && scope !== "week" && scope !== "month") {
          sendJson(req, res, 400, {
            error: "scope must be day, week, or month",
          });
          return;
        }

        const plan = await createPlanItem({
          userId: payload.sub,
          planDate: String(body?.plan_date ?? ""),
          title: String(body?.title ?? ""),
          scope: scope as PlanItemScope,
        });
        sendJson(req, res, 201, { plan });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create plan";
        sendJson(req, res, 400, { error: message });
      }
      return;
    }

    {
      const planMatch = /^\/api\/plans\/(\d+)$/.exec(url.pathname);
      if (planMatch) {
        const payload = getAuthPayload(req);
        if (!payload) {
          sendJson(req, res, 401, { error: "Unauthorized" });
          return;
        }
        if (
          payload.role !== "Member" &&
          payload.role !== "SubBoss"
        ) {
          sendJson(req, res, 403, {
            error: "Only members can edit or delete plans",
          });
          return;
        }

        const planId = Number(planMatch[1]);
        if (!Number.isFinite(planId) || planId <= 0) {
          sendJson(req, res, 400, { error: "Invalid plan id" });
          return;
        }

        if (req.method === "PUT") {
          let body: Record<string, unknown> | null;
          try {
            body = await readJsonBody(req);
          } catch {
            sendJson(req, res, 400, { error: "Invalid JSON body" });
            return;
          }

          const statusRaw = body?.status;
          const status =
            statusRaw === undefined || statusRaw === null
              ? undefined
              : String(statusRaw);
          if (
            status !== undefined &&
            status !== "pending" &&
            status !== "done" &&
            status !== "not_done"
          ) {
            sendJson(req, res, 400, {
              error: "status must be pending, done, or not_done",
            });
            return;
          }

          try {
            const plan = await updatePlanItem({
              id: planId,
              title:
                body?.title === undefined ? undefined : String(body.title),
              status: status as PlanItemStatus | undefined,
              note: body?.note === undefined ? undefined : String(body.note),
              notDoneReason:
                body?.not_done_reason === undefined
                  ? undefined
                  : String(body.not_done_reason),
            });
            sendJson(req, res, 200, { plan });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to update plan";
            sendJson(
              req,
              res,
              message.includes("not found") ? 404 : 400,
              { error: message },
            );
          }
          return;
        }

        if (req.method === "DELETE") {
          try {
            await deletePlanItem(planId);
            sendJson(req, res, 200, { ok: true });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to delete plan";
            sendJson(
              req,
              res,
              message.includes("not found") ? 404 : 400,
              { error: message },
            );
          }
          return;
        }
      }
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

      const dayRaw = typeof body?.day === "string" ? body.day.trim() : "";
      let createdAt: string | undefined;
      if (dayRaw) {
        if (payload.role !== "BigBoss") {
          sendJson(req, res, 403, {
            error: "Only BigBoss can set Bid amounts for other weeks",
          });
          return;
        }
        // Accept YYYY-MM-DD or full ISO timestamp from the client.
        const parsed = new Date(dayRaw);
        if (Number.isNaN(parsed.getTime())) {
          sendJson(req, res, 400, {
            error: "day must be a valid date",
          });
          return;
        }
        createdAt = parsed.toISOString();
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
        createdAt,
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

    if (req.method === "POST" && url.pathname === "/api/profile-generator") {
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

      const result = await generateProfileDocx(body ?? {});
      if (!result.ok) {
        sendJson(req, res, result.status, { error: result.error });
        return;
      }

      sendBinary(req, res, 200, result.buffer, {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": 'attachment; filename="upwork-profile.docx"',
      });
      return;
    }

    sendJson(req, res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : "";
      const isDb =
        message.toLowerCase().includes("connection") ||
        message.toLowerCase().includes("timeout") ||
        message.toLowerCase().includes("econn");
      sendJson(req, res, isDb ? 503 : 500, {
        error: isDb
          ? "Database temporarily unavailable"
          : "Internal server error",
      });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

// Profile generator waits on n8n (~280s); keep request sockets open long enough.
server.requestTimeout = 300_000;
server.headersTimeout = 305_000;
server.keepAliveTimeout = 65_000;
server.timeout = 0;

const EVENT_NOTIFY_MS = 15_000;
const eventNotifyTimer = setInterval(() => {
  void notifyDueEvents().catch((err) => {
    console.error("Failed to notify due events:", err);
  });
  void notifyDueBirthdays().catch((err) => {
    console.error("Failed to notify due birthdays:", err);
  });
}, EVENT_NOTIFY_MS);
eventNotifyTimer.unref?.();

if (process.env.VERCEL) {
  server.listen(PORT);
} else {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend listening on http://0.0.0.0:${PORT}`);
  });
}

export default server;

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

async function shutdown() {
  console.log("Shutting down…");
  clearInterval(eventNotifyTimer);
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
