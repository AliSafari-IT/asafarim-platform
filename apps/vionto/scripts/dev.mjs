import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";

const isWindows = process.platform === "win32";
const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const tsxCli = require.resolve("tsx/cli");

const children = new Set();
let shuttingDown = false;

function prefixStream(stream, prefix, target) {
  const lines = createInterface({ input: stream });
  lines.on("line", (line) => {
    target.write(`[${prefix}] ${line}\n`);
  });
}

function run(name, cli, args, env = {}) {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["inherit", "pipe", "pipe"],
    shell: false,
  });

  children.add(child);
  prefixStream(child.stdout, name, process.stdout);
  prefixStream(child.stderr, name, process.stderr);

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      const reason = signal ? `signal ${signal}` : `code ${code}`;
      console.error(`[${name}] exited with ${reason}`);
      if (name === "web" || name === "worker") {
        shutdown(code ?? 1);
      }
    }
  });

  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    child.kill("SIGTERM");
  }

  setTimeout(() => {
    if (isWindows) {
      for (const child of children) {
        if (child.pid) {
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
        }
      }
    }
    process.exit(code);
  }, 1500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const localViontoUrl = process.env.LOCAL_VIONTO_URL ?? "http://localhost:3004";
const viontoAuthEnv = {
  AUTH_URL: localViontoUrl,
  NEXTAUTH_URL: localViontoUrl,
  AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? "true",
};

run("web", nextCli, ["dev", "--port", "3004"], viontoAuthEnv);
run(
  "worker",
  tsxCli,
  ["--import", "./scripts/preload-env.mjs", "worker.ts"],
  viontoAuthEnv
);
