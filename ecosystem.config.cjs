/**
 * PM2 process file for Team app (backend + HTTPS frontend).
 *
 * Usage (from repo root):
 *   npm install
 *   npm run build
 *   npm run pm2:start
 *   npm run pm2:logs
 *   npm run pm2:stop
 */
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "team-backend",
      cwd: path.join(__dirname, "backend"),
      script: "src/index.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      max_restarts: 20,
      min_uptime: "5s",
      kill_timeout: 5_000,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "team-frontend",
      cwd: path.join(__dirname, "frontend"),
      script: "scripts/start-https.mjs",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      max_restarts: 20,
      min_uptime: "10s",
      kill_timeout: 10_000,
      env: {
        NODE_ENV: "production",
        PORT: "2439",
        NEXT_INTERNAL_PORT: "2440",
        BACKEND_URL: "http://127.0.0.1:6017",
      },
    },
  ],
};
