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
module.exports = {
  apps: [
    {
      name: "team-backend",
      cwd: "./backend",
      script: "src/index.ts",
      interpreter: "node",
      interpreter_args:
        "--experimental-strip-types --experimental-transform-types",
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
      cwd: "./frontend",
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
        PORT: "3000",
        NEXT_INTERNAL_PORT: "3001",
        BACKEND_URL: "http://127.0.0.1:4000",
      },
    },
  ],
};
