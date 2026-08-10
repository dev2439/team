import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, query } from "../src/db.ts";

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

const sqlDir = resolve(__dirname, "../sql");
const files = readdirSync(sqlDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

await query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

for (const file of files) {
  const { rows } = await query<{ id: string }>(
    "SELECT id FROM schema_migrations WHERE id = $1",
    [file],
  );

  if (rows.length > 0) {
    console.log(`skip ${file}`);
    continue;
  }

  const sql = readFileSync(join(sqlDir, file), "utf8");
  await query(sql);
  await query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
  console.log(`applied ${file}`);
}

await closePool();
console.log("Migrations complete");
