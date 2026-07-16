#!/usr/bin/env tsx
import { execSync, spawn } from "node:child_process";
import { rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";

const DB_HOST = "localhost";
const DB_PORT = 55435;
const DOCKER_DESKTOP_PATH = "F:\\\\programs\\\\Docker\\\\Docker\\\\Docker Desktop.exe";
const MAX_WAIT_SECONDS = 90;

function isDbReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => resolve(false));
    socket.connect(DB_PORT, DB_HOST);
  });
}

function isDockerReady(): boolean {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function waitForDocker(): true {
  console.log("Waiting for Docker daemon...");
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_SECONDS * 1000) {
    if (isDockerReady()) {
      console.log("Docker is ready.");
      return true;
    }
    execSync('powershell -Command "Start-Sleep 3"');
  }
  throw new Error("Timed out waiting for Docker to start.");
}

function startDockerDesktop(): void {
  if (isDockerReady()) {
    console.log("Docker is already running.");
    return;
  }
  console.log("Starting Docker Desktop...");
  execSync(
    `powershell -ExecutionPolicy Bypass -Command "Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force; Get-Process 'com.docker.backend','com.docker.proxy','dockerd' -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 3; Start-Process '${DOCKER_DESKTOP_PATH}';"`,
    { stdio: "inherit" },
  );
  waitForDocker();
}

async function startDatabase(): Promise<void> {
  if (await isDbReachable()) {
    console.log("Database is already reachable.");
    return;
  }
  startDockerDesktop();
  console.log("Starting database container...");
  execSync("docker compose up -d", { stdio: "inherit" });
  console.log("Waiting for database to be reachable...");
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_SECONDS * 1000) {
    if (await isDbReachable()) {
      console.log("Database is ready.");
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Timed out waiting for database to be reachable.");
}

async function main(): Promise<void> {
  console.log("Installing dependencies...");
  execSync("pnpm install", { stdio: "inherit" });

  await startDatabase();

  console.log("Applying migrations...");
  execSync("pnpm db:migrate:deploy", { stdio: "inherit" });

  console.log("Building packages...");
  execSync("pnpm build --no-cache", { stdio: "inherit" });

  console.log("Killing ports...");
  execSync("kill-port 3000 3001 3002 3003 3004", { stdio: "inherit" });

  // Clean stale .next/dev directories to prevent Turbopack cache conflicts
  // after the build step above. Build artifacts can confuse the dev server.
  console.log("Cleaning .next/dev caches...");
  const appsDir = join(process.cwd(), "apps");
  for (const app of readdirSync(appsDir)) {
    const devDir = join(appsDir, app, ".next", "dev");
    try {
      rmSync(devDir, { recursive: true, force: true });
    } catch {
      // ignore if directory doesn't exist
    }
  }

  console.log("Starting dev servers...");
  const turbo = spawn("turbo", ["dev"], { stdio: "inherit", shell: true });
  turbo.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
