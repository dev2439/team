import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../src/auth/password.ts";
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

const email = "demo@team.local";
const password = "demo1234";
const name = "Demo User";
const role = "Member";

const { rows } = await query<{ id: number }>(
  "SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1",
  [email],
);

if (rows.length > 0) {
  console.log(`User already exists: ${email}`);
} else {
  const hashed = await hashPassword(password);
  await query(
    `INSERT INTO users (name, email, password, role)
     VALUES ($1, $2, $3, $4)`,
    [name, email, hashed, role],
  );
  console.log(`Created demo user ${email} / ${password}`);
}

await closePool();
