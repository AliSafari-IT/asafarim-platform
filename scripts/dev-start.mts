#!/usr/bin/env tsx
import { execFileSync, execSync, spawn, spawnSync } from "node:child_process";
import { rmSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import net from "node:net";

const DB_HOST = "127.0.0.1";
const DB_PORT = 55435;
const DOCKER_DESKTOP_PATH =
  "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
const DOCKER_CLI_PATH =
  "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
const DOCKER_BIN_DIR = "C:\\Program Files\\Docker\\Docker\\resources\\bin";
const DOCKER_ENV = {
  ...process.env,
  Path: `${DOCKER_BIN_DIR};${process.env.Path ?? ""}`,
};
const MAX_WAIT_SECONDS = 180;

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
    execFileSync(DOCKER_CLI_PATH, ["info"], {
      stdio: "ignore",
      env: DOCKER_ENV,
    });
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

  // Check if Docker Desktop is already starting (processes exist but daemon not ready yet).
  // If so, just wait for it instead of killing and restarting.
  let dockerProcessRunning = false;
  try {
    const result = execSync(
      'powershell -Command "(Get-Process \'Docker Desktop\' -ErrorAction SilentlyContinue).Count"',
      { encoding: "utf-8" }
    ).trim();
    dockerProcessRunning = parseInt(result, 10) > 0;
  } catch {
    // ignore
  }

  if (!dockerProcessRunning) {
    console.log("Starting Docker Desktop...");
    execSync(
      `powershell -ExecutionPolicy Bypass -Command "Start-Process '${DOCKER_DESKTOP_PATH}';"`,
      { stdio: "inherit" }
    );
  } else {
    console.log("Docker Desktop is starting, waiting for daemon...");
  }
  waitForDocker();
}

async function startDatabase(): Promise<void> {
  if (await isDbReachable()) {
    console.log("Database is already reachable.");
    return;
  }
  startDockerDesktop();
  console.log("Starting database container...");
  execFileSync(
    DOCKER_CLI_PATH,
    ["compose", "--env-file", ".env.local", "up", "-d"],
    { stdio: "inherit", env: DOCKER_ENV }
  );
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

/**
 * Apps with their own isolated Drizzle database. `pnpm db:migrate:deploy`
 * above is Prisma only — it migrates the SHARED platform database and knows
 * nothing about these, so before #64 nothing in dev startup ever migrated
 * them.
 *
 * That was not a cosmetic gap. Drizzle builds `SELECT *` from the schema
 * definition, so pulling a branch that adds a column left every read of that
 * table failing with a bare "Internal server error" and no hint that a
 * migration was the cause — which is exactly how the M13 slice G merge broke
 * the AppBuilder conversation panel.
 */
const DRIZZLE_APPS = [
  { name: "@asafarim/appbuilder", port: 55436 },
  { name: "@asafarim/testora", port: 55434 },
] as const;

function isPortReachable(port: number): boolean {
  const probe = spawnSync(
    process.execPath,
    [
      "-e",
      `const net=require("net");const s=new net.Socket();s.setTimeout(1500);` +
        `s.once("connect",()=>{s.destroy();process.exit(0)});` +
        `s.once("error",()=>process.exit(1));s.once("timeout",()=>process.exit(1));` +
        `s.connect(${port},"${DB_HOST}")`,
    ],
    { stdio: "ignore" },
  );
  return probe.status === 0;
}

/**
 * Never fatal. An app whose database container is not up is a normal state —
 * someone working only on the public website should not have `pnpm dev`
 * refuse to start because AppBuilder's Postgres is stopped. A skip or a
 * failure is reported loudly enough to act on and then stepped over.
 */
function applyAppDrizzleMigrations(): void {
  for (const app of DRIZZLE_APPS) {
    if (!isPortReachable(app.port)) {
      console.log(
        `  [skip] ${app.name}: no database reachable on :${app.port}. ` +
          `Start it with \`pnpm db:up\`, then \`pnpm --filter ${app.name} db:migrate\`.`,
      );
      continue;
    }
    try {
      console.log(`  ${app.name}: applying Drizzle migrations...`);
      execSync(`pnpm --filter ${app.name} db:migrate`, { stdio: "inherit" });
    } catch {
      console.error(
        `  [FAILED] ${app.name}: migrations did not apply. This app's reads will fail ` +
          `until they do — run \`pnpm --filter ${app.name} db:migrate\` and read the error.`,
      );
    }
  }
}

async function main(): Promise<void> {
  console.log("Installing dependencies...");
  execSync("pnpm install", { stdio: "inherit" });

  await startDatabase();

  console.log("Applying migrations...");
  execSync("pnpm db:migrate:deploy", { stdio: "inherit" });
  applyAppDrizzleMigrations();

  // Kill any dev servers left running from a previous session BEFORE
  // cleaning caches and rebuilding: a live Turbopack process can regenerate
  // .next/dev/types/*.d.ts mid-cleanup/build, silently reintroducing the
  // exact broken files this step exists to remove.
  console.log("Killing ports...");
  execSync("kill-port 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 3011 3012", { stdio: "inherit" });

  // Clean stale .next directories before building. Turbopack's dev server
  // generates .next/dev/types/*.d.ts files that can contain broken content
  // from a previous session; if left around, `next build` picks them up and
  // fails with "Declaration or statement expected" type errors.
  console.log("Cleaning .next caches...");
  const appsDir = join(process.cwd(), "apps");
  for (const app of readdirSync(appsDir)) {
    const nextDir = join(appsDir, app, ".next");
    try {
      rmSync(nextDir, { recursive: true, force: true });
    } catch {
      // ignore if directory doesn't exist
    }
  }

  console.log("Building packages...");
  execSync("pnpm turbo build --no-cache --concurrency=3", { stdio: "inherit" });

  // Kill ports AGAIN after the build: zombie dev servers from a previous
  // session can re-grab ports during the multi-minute build step, even
  // though we killed them at the top. This second kill ensures the ports
  // are clear right before we start the new dev servers.
  console.log("Re-killing ports after build...");
  execSync("kill-port 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 3011 3012", {
    stdio: "inherit",
  });

  // Clean .next directories AGAIN after the build: `next build` produces
  // production artifacts in .next/ that have a different structure than
  // what `next dev` (Turbopack) expects. If left in place, dev server
  // throws ENOENT errors for dev-specific files like
  // .next/dev/server/app/<route>/page/build-manifest.json.
  console.log("Cleaning .next caches after build...");
  for (const app of readdirSync(appsDir)) {
    const nextDir = join(appsDir, app, ".next");
    try {
      rmSync(nextDir, { recursive: true, force: true });
    } catch {
      // ignore if directory doesn't exist
    }
  }

  console.log("Starting dev servers...");
  const require = createRequire(import.meta.url);
  const turboCli = require.resolve("turbo/bin/turbo");
  const turbo = spawn(process.execPath, [turboCli, "dev", "@asafarim/appbuilder#worker:dev"], {
    stdio: "inherit",
    shell: false,
  });
  let shuttingDown = false;
  let forceExitTimer: NodeJS.Timeout | undefined;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;

    if (process.platform !== "win32") {
      turbo.kill("SIGTERM");
    }

    forceExitTimer = setTimeout(() => {
      if (turbo.exitCode === null && turbo.pid) {
        if (process.platform === "win32") {
          spawnSync("taskkill", ["/PID", String(turbo.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
        } else {
          turbo.kill("SIGKILL");
        }
      }
      process.exit(0);
    }, 3000);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  turbo.on("exit", (code) => {
    if (forceExitTimer) clearTimeout(forceExitTimer);
    process.exit(shuttingDown ? 0 : (code ?? 0));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
