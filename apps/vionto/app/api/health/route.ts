import { prisma } from "@asafarim/db";
import Redis from "ioredis";
import { NextResponse } from "next/server";
import { getStorageStatus } from "../../../lib/server/storage";

export async function GET() {
  const checks = {
    database: false,
    redis: false,
    storage: getStorageStatus(),
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {}

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    connectTimeout: 1000,
  });

  try {
    await redis.connect();
    checks.redis = (await redis.ping()) === "PONG";
  } catch {
  } finally {
    redis.disconnect();
  }

  const ok = checks.database && checks.redis && checks.storage.configured;

  return NextResponse.json({
    ok,
    service: "vionto",
    version: "0.2.0",
    checks,
    timestamp: new Date().toISOString(),
  }, { status: ok ? 200 : 503 });
}
