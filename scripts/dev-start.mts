#!/usr/bin/env tsx
import { execFileSync, execSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
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
 * Wait up to maxWaitSeconds for a TCP port to accept connections. On a first
 * run the app-specific Postgres containers (testora, appbuilder) are still
 * initializing their fresh volumes while the main database is already up —
 * migrating them immediately would misreport "no database reachable" and
 * leave the app with an empty schema ("relation ... does not exist").
 */
async function waitForPort(port: number, maxWaitSeconds: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitSeconds * 1000) {
    if (isPortReachable(port)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/**
 * Never fatal. An app whose database container is not up is a normal state —
 * someone working only on the public website should not have `pnpm dev`
 * refuse to start because AppBuilder's Postgres is stopped. A skip or a
 * failure is reported loudly enough to act on and then stepped over.
 */
async function applyAppDrizzleMigrations(): Promise<void> {
  for (const app of DRIZZLE_APPS) {
    if (!(await waitForPort(app.port, 60))) {
      console.log(
        `  [skip] ${app.name}: no database reachable on :${app.port} after 60s. ` +
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

/**
 * Copy `example` to `target` when the plaintext env file is missing. Returns
 * true when a copy was made. Env files are gitignored, so a fresh clone has
 * none — but `docker compose --env-file .env.local` and every
 * `dotenv -e .env.local` script in packages/db hard-require them.
 */
function ensurePlaintextEnv(target: string, example: string): boolean {
  if (existsSync(target)) return false;
  if (!existsSync(example)) {
    console.error(
      `  [warn] Neither ${target} nor ${example} exists — create ${target} manually.`,
    );
    return false;
  }
  copyFileSync(example, target);
  console.log(`  Created ${target} from ${example}.`);
  return true;
}

/**
 * First-run detection is state-based (missing node_modules / env files), not a
 * marker file, so it also self-heals a checkout that lost its env files or was
 * re-cloned. Returns true when this looks like a first run.
 *
 * Ordering matters: env files are restored BEFORE the database starts (docker
 * compose reads `--env-file .env.local`), but AFTER `pnpm install` in main()
 * because the envage CLI itself is a devDependency.
 */
function bootstrapEnvironment(): boolean {
  const nodeModulesMissing = !existsSync(join(process.cwd(), "node_modules"));
  const envLocalMissing = !existsSync(".env.local");
  const envMissing = !existsSync(".env");
  if (!nodeModulesMissing && !envLocalMissing && !envMissing) return false;

  console.log("First run detected — bootstrapping environment...");

  if (envLocalMissing) {
    // The committed ciphertext is the source of truth, but only a machine
    // with the private key (.age/key.txt, never committed) can decrypt it.
    const canDecrypt =
      existsSync(join(".age", "key.txt")) && existsSync(".env.local.age");
    if (canDecrypt) {
      console.log("  Private key found — decrypting env files via envage...");
      try {
        execSync("pnpm env:decrypt:local", { stdio: "inherit" });
      } catch {
        console.error("  [warn] envage decryption failed — falling back to the example env.");
      }
    }
    if (!existsSync(".env.local")) {
      const copied = ensurePlaintextEnv(".env.local", ".env.local.example");
      if (copied && !canDecrypt) {
        console.error(
          "  [warn] .env.local was created from .env.local.example with PLACEHOLDER secrets.\n" +
            "  Real secrets live in .env.local.age — restore .age/key.txt from the team vault,\n" +
            "  then run `pnpm env:decrypt:local` to replace the placeholders.",
        );
      }
    }
  }
  if (envMissing) ensurePlaintextEnv(".env", ".env.example");

  return true;
}

/**
 * Sync the shared Postgres superuser password to POSTGRES_PASSWORD from
 * .env.local. A Postgres volume only sets its superuser password on FIRST
 * initialization, so a volume created while .env.local still held example
 * credentials keeps accepting only the old password forever — every migration
 * then fails with Prisma P1000 even though the env file is self-consistent.
 * Non-destructive: it changes a password, never data. Local dev only.
 */
function syncPostgresPasswordFromEnv(): boolean {
  try {
    const password = readFileSync(".env.local", "utf-8")
      .split(/\r?\n/)
      .find((line) => line.startsWith("POSTGRES_PASSWORD="))
      ?.slice("POSTGRES_PASSWORD=".length)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!password) return false;
    const containerId = execFileSync(
      DOCKER_CLI_PATH,
      ["compose", "--env-file", ".env.local", "ps", "-q", "postgres"],
      { encoding: "utf-8", env: DOCKER_ENV },
    ).trim();
    if (!containerId) return false;
    execFileSync(
      DOCKER_CLI_PATH,
      [
        "exec", "-i", containerId,
        "psql", "-U", "asafarim", "-d", "asafarim", "-v", "ON_ERROR_STOP=1",
      ],
      {
        input: `ALTER USER asafarim WITH PASSWORD '${password.replace(/'/g, "''")}';\n`,
        env: DOCKER_ENV,
      },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * `prisma migrate deploy` with one self-heal: on P1000 (bad credentials),
 * sync the container's password from .env.local and retry once before giving
 * up. Any other failure is rethrown with the captured output.
 */
function applyPrismaMigrations(): void {
  const result = spawnSync("pnpm", ["db:migrate:deploy"], {
    stdio: "pipe",
    shell: true,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (output.trim()) process.stdout.write(output);
  if (result.status === 0) return;

  if (output.includes("P1000") && syncPostgresPasswordFromEnv()) {
    console.log(
      "  Database credentials were stale (the Postgres volume was initialized with an\n" +
        "  older password). Synced the 'asafarim' user password from .env.local — retrying...",
    );
    execSync("pnpm db:migrate:deploy", { stdio: "inherit" });
    return;
  }
  throw new Error(`Prisma migrations failed with exit code ${result.status}.`);
}

async function main(): Promise<void> {
  // Install FIRST: the envage CLI that decrypts the committed .env.local.age
  // is itself a devDependency, so a fresh clone cannot decrypt (or fall back
  // to the example env) until node_modules exists. Env restoration must still
  // happen BEFORE startDatabase() — docker compose reads --env-file .env.local.
  console.log("Installing dependencies...");
  execSync("pnpm install", { stdio: "inherit" });

  bootstrapEnvironment();

  // Generate the Prisma client up front: the seed step below and any app that
  // imports @asafarim/db need it BEFORE `turbo build` gets to packages/db.
  console.log("Generating Prisma client...");
  execSync("pnpm db:generate", { stdio: "inherit" });

  await startDatabase();

  console.log("Applying migrations...");
  applyPrismaMigrations();
  await applyAppDrizzleMigrations();

  // Idempotent by design (seed-manager upserts; existing admin is left
  // untouched), so this is safe on every startup and rescues a wiped Docker
  // volume that still has node_modules — state detection alone can't catch
  // that case, but an empty RBAC table would break every app.
  console.log("Seeding database (idempotent)...");
  try {
    execSync("pnpm db:seed", { stdio: "inherit" });
  } catch {
    console.error(
      "  [warn] Seeding failed — RBAC roles/permissions may be missing. " +
        "Run `pnpm db:seed` to see the underlying error.",
    );
  }

  // Kill any dev servers left running from a previous session BEFORE
  // cleaning caches and rebuilding: a live Turbopack process can regenerate
  // .next/dev/types/*.d.ts mid-cleanup/build, silently reintroducing the
  // exact broken files this step exists to remove.
  console.log("Killing ports...");
  execSync("kill-port 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 3011 3012 3013", { stdio: "inherit" });

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
  execSync("kill-port 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 3011 3012 3013", {
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

  const killTurboTree = () => {
    try {
      if (process.platform === "win32") {
        // Force-kill immediately: turbo's graceful shutdown hangs on
        // watch-mode tasks (tsup --watch never exits; cmd/pnpm wrappers sit
        // at "Terminate batch job (Y/N)?"), which is why "13 tasks shutting
        // down..." used to spin forever. Every descendant already received
        // the console Ctrl+C directly, so nothing graceful is lost — the
        // /T tree-walk reaps whatever is still stuck.
        if (turbo.pid) {
          spawnSync("taskkill", ["/PID", String(turbo.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
        }
      } else {
        turbo.kill("SIGTERM");
      }
    } catch {
      // ignore — the backup timer below still force-exits
    }
  };

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;

    killTurboTree();

    forceExitTimer = setTimeout(() => {
      if (process.platform !== "win32" && turbo.exitCode === null) {
        turbo.kill("SIGKILL");
      }
      process.exit(0);
    }, 1500);
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
