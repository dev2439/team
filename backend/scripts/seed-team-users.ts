import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../src/auth/password.ts";
import { closePool, query } from "../src/db.ts";
import type { UserRole } from "../src/types/user.ts";

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

const users: { email: string; password: string; role: UserRole; name: string }[] =
  [
    {
      email: "kevinwc@gmail.com",
      password: "123",
      role: "SubBoss",
      name: "Kevin WC",
    },
    {
      email: "katlinij@gmail.com",
      password: "123",
      role: "Member",
      name: "Katlin IJ",
    },
    {
      email: "kevinrs@gmail.com",
      password: "123",
      role: "Member",
      name: "Kevin RS",
    },
    {
      email: "powerjs@gmail.com",
      password: "123",
      role: "Member",
      name: "Power JS",
    },
    {
      email: "yukiic@gmail.com",
      password: "123",
      role: "Member",
      name: "Yuki IC",
    },
    {
      email: "sunjh@gmail.com",
      password: "123",
      role: "BigBoss",
      name: "Sun JH",
    },
    {
      email: "harrywg@gmail.com",
      password: "123",
      role: "Member",
      name: "Harry WG",
    },
    {
      email: "yohanmw@gmail.com",
      password: "123",
      role: "Member",
      name: "Yohan MW",
    },
    {
      email: "koltindh@gmail.com",
      password: "123",
      role: "Member",
      name: "Koltin DH",
    },
    {
      email: "kerrysn@gmail.com",
      password: "123",
      role: "SubBoss",
      name: "Kerry SN",
    },
    {
      email: "chrissj@gmail.com",
      password: "123",
      role: "Member",
      name: "Chris SJ",
    },
    {
      email: "handersongh@gmail.com",
      password: "123",
      role: "Member",
      name: "Handerson GH",
    },
  ];

for (const user of users) {
  const { rows } = await query<{ id: number }>(
    "SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1",
    [user.email],
  );

  if (rows.length > 0) {
    console.log(`skip ${user.email} (already exists)`);
    continue;
  }

  const hashed = await hashPassword(user.password);
  await query(
    `INSERT INTO users (name, email, password, role)
     VALUES ($1, $2, $3, $4)`,
    [user.name, user.email, hashed, user.role],
  );
  console.log(`created ${user.email} (${user.role})`);
}

await closePool();
