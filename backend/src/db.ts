import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let resetting: Promise<void> | null = null;

/** Prefer IPv4 — `localhost` can resolve to ::1 while Postgres only listens on 127.0.0.1. */
function normalizeConnectionString(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
    }
    return url.toString();
  } catch {
    return raw.replace("@localhost:", "@127.0.0.1:");
  }
}

function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  const code =
    typeof err === "object" && err && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";
  return (
    message.includes("connection terminated") ||
    message.includes("connection timeout") ||
    message.includes("timeout expired") ||
    message.includes("server closed the connection") ||
    message.includes("cannot use a pool after calling end") ||
    message.includes("client has encountered a connection error") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "57P01" || // admin_shutdown
    code === "57P02" || // crash_shutdown
    code === "57P03" // cannot_connect_now
  );
}

function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add it to backend/.env (see .env.example).",
    );
  }

  const next = new Pool({
    connectionString: normalizeConnectionString(connectionString),
    max: Number(process.env.DATABASE_POOL_MAX) || 20,
    // Recycle idle clients before OS/NAT drops them.
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS) || 10_000,
    connectionTimeoutMillis:
      Number(process.env.DATABASE_CONNECT_TIMEOUT_MS) || 5_000,
    allowExitOnIdle: false,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    // Fail slow queries instead of holding pool slots forever.
    options: "-c statement_timeout=15000",
  });

  next.on("error", (err) => {
    console.error("Unexpected PostgreSQL pool error:", err.message);
  });

  return next;
}

export function getPool(): pg.Pool {
  if (pool) return pool;
  pool = createPool();
  return pool;
}

async function resetPool(): Promise<void> {
  if (resetting) return resetting;
  resetting = (async () => {
    const old = pool;
    pool = null;
    if (old) {
      try {
        await old.end();
      } catch {
        // Ignore close errors while recovering.
      }
    }
    pool = createPool();
  })().finally(() => {
    resetting = null;
  });
  return resetting;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  try {
    return await getPool().query<T>(text, params);
  } catch (err) {
    if (!isTransientDbError(err)) throw err;
    console.warn(
      "PostgreSQL query failed with transient connection error; retrying once…",
      err instanceof Error ? err.message : err,
    );
    await resetPool();
    return getPool().query<T>(text, params);
  }
}

export async function checkDatabase(): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}> {
  const started = Date.now();

  try {
    await query("SELECT 1 AS ok");
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : "Unknown database error",
    };
  }
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
