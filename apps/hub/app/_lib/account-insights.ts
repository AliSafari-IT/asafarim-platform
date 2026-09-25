import { prisma } from "@asafarim/db";

/**
 * Read-side helpers for the Hub's dashboard and settings pages. Everything
 * here comes from the "sign_in" audit events that @asafarim/auth records on
 * each successful sign-in (see packages/auth/src/config.ts), so it is the
 * user's own real history — never sample data.
 */

export interface SignInEvent {
  id: string;
  at: Date;
  provider: string;
  device: string;
  deviceClass: string;
  ip: string | null;
}

interface SignInChanges {
  provider?: string;
  device?: {
    browserFamily?: string | null;
    osFamily?: string | null;
    deviceClass?: string | null;
  } | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  credentials: "Email & password",
  google: "Google",
  "email-code": "Email code",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

function describeDevice(device: SignInChanges["device"]): string {
  if (!device) return "Unknown device";
  const { browserFamily, osFamily } = device;
  if (browserFamily && osFamily) return `${browserFamily} on ${osFamily}`;
  return browserFamily ?? osFamily ?? "Unknown device";
}

/** Keep enough of the address to recognise a network, not to pinpoint it. */
export function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : ip;
  }
  const groups = ip.split(":").filter(Boolean);
  return groups.length > 2 ? `${groups[0]}:${groups[1]}:…` : ip;
}

export async function getRecentSignIns(userId: string, take = 8): Promise<SignInEvent[]> {
  const rows = await prisma.auditLog.findMany({
    where: { userId, action: "sign_in" },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, createdAt: true, changes: true, ipAddress: true },
  });
  return rows.map((row) => {
    const changes = (row.changes ?? {}) as SignInChanges;
    return {
      id: row.id,
      at: row.createdAt,
      provider: providerLabel(changes.provider ?? "credentials"),
      device: describeDevice(changes.device),
      deviceClass: changes.device?.deviceClass ?? "desktop",
      ip: maskIp(row.ipAddress),
    };
  });
}

export async function countSignInsSince(userId: string, since: Date): Promise<number> {
  return prisma.auditLog.count({
    where: { userId, action: "sign_in", createdAt: { gte: since } },
  });
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 hours ago", "yesterday", "just now". Rendered on the server. */
export function timeAgo(date: Date, now = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
