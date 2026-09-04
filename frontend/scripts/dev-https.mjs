import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
  for (const extra of String(process.env.PUBLIC_IP || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    addresses.add(extra);
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

  // Always regenerate so LAN/public IP changes are picked up on restart.
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

  const publicPort = Number(process.env.PORT) || 2439;
  console.log("\nHTTPS cert ready for:");
  console.log(`  https://localhost:${publicPort}`);
  for (const ip of ips.filter((value) => value !== "127.0.0.1")) {
    console.log(`  https://${ip}:${publicPort}`);
  }
  console.log(
    "\nOn another machine: open the https:// URL, accept the certificate warning, then enable desktop alerts.\n",
  );
}

ensureCertificates();

if (!existsSync(keyPath) || !existsSync(certPath)) {
  console.error("Failed to create HTTPS certificates.");
  process.exit(1);
}

const PUBLIC_PORT = String(Number(process.env.PORT) || 2439);

const child = spawn(
  "npx",
  [
    "next",
    "dev",
    "--hostname",
    "0.0.0.0",
    "--port",
    PUBLIC_PORT,
    "--experimental-https",
    "--experimental-https-key",
    keyPath,
    "--experimental-https-cert",
    certPath,
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
