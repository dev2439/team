/**
 * Serve the production Next build over HTTPS on the LAN (for desktop notifications).
 *
 * next start is HTTP-only; this script:
 * 1) ensures the same self-signed LAN certs as dev-https
 * 2) runs `next start` on 127.0.0.1:3001
 * 3) terminates TLS on 0.0.0.0:3000 and proxies to the Next process
 *
 * Usage (from repo root after build):
 *   npm run start:frontend:https
 */
import { createServer as createHttpsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const certDir = resolve(root, "certificates");
const keyPath = resolve(certDir, "dev-key.pem");
const certPath = resolve(certDir, "dev-cert.pem");
const sanPath = resolve(certDir, "dev-san.cnf");

const PUBLIC_HOST = "0.0.0.0";
const PUBLIC_PORT = Number(process.env.PORT) || 3000;
const NEXT_HOST = "127.0.0.1";
const NEXT_PORT = Number(process.env.NEXT_INTERNAL_PORT) || 3001;

function lanIpv4Addresses() {
  const addresses = new Set(["127.0.0.1"]);
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.add(entry.address);
      }
    }
  }
  return [...addresses];
}

function ensureCertificates() {
  mkdirSync(certDir, { recursive: true });

  const ips = lanIpv4Addresses();
  const dnsNames = ["localhost"];
  const sanLines = [
    ...dnsNames.map((name, index) => `DNS.${index + 1} = ${name}`),
    ...ips.map((ip, index) => `IP.${index + 1} = ${ip}`),
  ];

  const config = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = localhost

[v3_req]
subjectAltName = @alt_names
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
${sanLines.join("\n")}
`.trim();

  writeFileSync(sanPath, `${config}\n`, "utf8");

  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-nodes",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "825",
      "-config",
      sanPath,
      "-extensions",
      "v3_req",
    ],
    { stdio: "inherit" },
  );

  console.log("\nHTTPS cert ready for:");
  console.log(`  https://localhost:${PUBLIC_PORT}`);
  for (const ip of ips.filter((value) => value !== "127.0.0.1")) {
    console.log(`  https://${ip}:${PUBLIC_PORT}`);
  }
  console.log(
    "\nOn another machine: open the https:// URL, accept the certificate warning, then enable desktop alerts.\n",
  );
}

function waitForNextReady(timeoutMs = 60_000) {
  const started = Date.now();
  return new Promise((resolveReady, reject) => {
    const tryOnce = () => {
      const req = httpRequest(
        {
          hostname: NEXT_HOST,
          port: NEXT_PORT,
          path: "/",
          method: "GET",
          timeout: 2000,
        },
        (res) => {
          res.resume();
          resolveReady();
        },
      );
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error("Timed out waiting for next start"));
          return;
        }
        setTimeout(tryOnce, 250);
      });
      req.on("timeout", () => {
        req.destroy();
      });
      req.end();
    };
    tryOnce();
  });
}

function proxyRequest(clientReq, clientRes) {
  const headers = { ...clientReq.headers, host: `${NEXT_HOST}:${NEXT_PORT}` };
  const proxyReq = httpRequest(
    {
      hostname: NEXT_HOST,
      port: NEXT_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(clientRes);
    },
  );

  proxyReq.on("error", () => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "Content-Type": "text/plain" });
    }
    clientRes.end("Bad gateway");
  });

  clientReq.pipe(proxyReq);
}

ensureCertificates();

if (!existsSync(keyPath) || !existsSync(certPath)) {
  console.error("Failed to create HTTPS certificates.");
  process.exit(1);
}

const nextChild = spawn(
  "npx",
  ["next", "start", "--hostname", NEXT_HOST, "--port", String(NEXT_PORT)],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);

nextChild.on("exit", (code) => {
  process.exit(code ?? 0);
});

await waitForNextReady();

const key = readFileSync(keyPath);
const cert = readFileSync(certPath);

const httpsServer = createHttpsServer({ key, cert }, (req, res) => {
  proxyRequest(req, res);
});

httpsServer.on("upgrade", (req, socket, head) => {
  const headers = { ...req.headers, host: `${NEXT_HOST}:${NEXT_PORT}` };
  const proxyReq = httpRequest({
    hostname: NEXT_HOST,
    port: NEXT_PORT,
    path: req.url,
    method: req.method,
    headers,
  });

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(proxyRes.headers)
        .flatMap(([name, value]) => {
          if (Array.isArray(value)) {
            return value.map((item) => `${name}: ${item}\r\n`);
          }
          return [`${name}: ${value}\r\n`];
        })
        .join("")}\r\n`,
    );
    if (proxyHead.length) proxySocket.write(proxyHead);
    if (head.length) socket.write(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxyReq.on("error", () => {
    socket.destroy();
  });

  proxyReq.end();
});

httpsServer.listen(PUBLIC_PORT, PUBLIC_HOST, () => {
  console.log(
    `\nProduction HTTPS listening on https://0.0.0.0:${PUBLIC_PORT} → http://${NEXT_HOST}:${NEXT_PORT}\n`,
  );
});

function shutdown() {
  httpsServer.close();
  nextChild.kill("SIGTERM");
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
