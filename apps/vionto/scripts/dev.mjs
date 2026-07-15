import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";

const children = new Set();
let shuttingDown = false;

function prefixStream(stream, prefix, target) {
  const lines = createInterface({ input: stream });
  lines.on("line", (line) => {
    target.write(`[${prefix}] ${line}\n`);
  });
}

function run(name, args, env = {}) {
  const child = spawn(pnpm, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["inherit", "pipe", "pipe"],
    shell: isWindows,
  });

  children.add(child);
  prefixStream(child.stdout, name, process.stdout);
  prefixStream(child.stderr, name, process.stderr);

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      const reason = signal ? `signal ${signal}` : `code ${code}`;
      console.error(`[${name}] exited with ${reason}`);
      if (name === "web") {
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

  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const localViontoUrl = process.env.LOCAL_VIONTO_URL ?? "http://localhost:3004";
const viontoAuthEnv = {
  AUTH_URL: localViontoUrl,
  NEXTAUTH_URL: localViontoUrl,
  AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? "true",
};

run("web", ["exec", "next", "dev", "--port", "3004"], viontoAuthEnv);
run("worker", ["run", "worker:dev"], viontoAuthEnv);
