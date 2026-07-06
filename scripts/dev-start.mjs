#!/usr/bin/env node
import { execSync, spawn } from 'node:child_process';
import net from 'node:net';

const DB_HOST = 'localhost';
const DB_PORT = 55435;
const DOCKER_DESKTOP_PATH = 'F:\\\\programs\\\\Docker\\\\Docker\\\\Docker Desktop.exe';
const MAX_WAIT_SECONDS = 90;

function isDbReachable() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => resolve(false));
    socket.connect(DB_PORT, DB_HOST);
  });
}

function isDockerReady() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function waitForDocker() {
  console.log('Waiting for Docker daemon...');
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_SECONDS * 1000) {
    if (isDockerReady()) {
      console.log('Docker is ready.');
      return true;
    }
    execSync('powershell -Command "Start-Sleep 3"');
  }
  throw new Error('Timed out waiting for Docker to start.');
}

function startDockerDesktop() {
  if (isDockerReady()) {
    console.log('Docker is already running.');
    return;
  }
  console.log('Starting Docker Desktop...');
  execSync(
    `powershell -ExecutionPolicy Bypass -Command "Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force; Get-Process 'com.docker.backend','com.docker.proxy','dockerd' -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 3; Start-Process '${DOCKER_DESKTOP_PATH}';"`,
    { stdio: 'inherit' }
  );
  waitForDocker();
}

async function startDatabase() {
  if (await isDbReachable()) {
    console.log('Database is already reachable.');
    return;
  }
  startDockerDesktop();
  console.log('Starting database container...');
  execSync('docker-compose up -d', { stdio: 'inherit' });
  console.log('Waiting for database to be reachable...');
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_SECONDS * 1000) {
    if (await isDbReachable()) {
      console.log('Database is ready.');
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Timed out waiting for database to be reachable.');
}

async function main() {
  console.log('Installing dependencies...');
  execSync('pnpm install', { stdio: 'inherit' });

  await startDatabase();

  console.log('Applying migrations...');
  execSync('pnpm db:push', { stdio: 'inherit' });

  console.log('Building packages...');
  execSync('pnpm build', { stdio: 'inherit' });

  console.log('Killing ports...');
  execSync('kill-port 3000 3001 3002 3003', { stdio: 'inherit' });

  console.log('Starting dev servers...');
  const turbo = spawn('turbo', ['dev'], { stdio: 'inherit', shell: true });
  turbo.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
