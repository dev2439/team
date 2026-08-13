import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  // Allow opening the dev server via any host/LAN IP (e.g. http://192.168.x.x:3000)
  allowedDevOrigins: ["localhost", "127.0.0.1", "*.*.*.*"],
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
