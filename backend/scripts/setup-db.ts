import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const dbName = new URL(databaseUrl).pathname.replace(/^\//, "") || "team";
const adminUrl = databaseUrl.replace(/\/[^/?]+(\?.*)?$/, "/postgres$1");
const admin = new pg.Pool({ connectionString: adminUrl });

try {
  const { rows } = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbName],
  );

  if (rows.length === 0) {
    await admin.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
    console.log(`Created database "${dbName}"`);
  } else {
    console.log(`Database "${dbName}" already exists`);
  }
} finally {
  await admin.end();
}

function quoteIdent(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe database name: ${value}`);
  }
  return `"${value}"`;
}
