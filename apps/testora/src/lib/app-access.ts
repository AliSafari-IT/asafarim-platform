import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";

// Server-only access control for private apps. A private app is locked behind a
// key; its catalog and results are withheld until a viewer proves knowledge of
// the key, after which a signed cookie keeps it unlocked for ~7 days. The key is
// never stored in plaintext (salted scrypt hash) and the cookie is HMAC-signed so
// it can't be forged client-side.

// Signing secret for the unlock cookie. Set TESTORA_SECRET in production — the
// dev fallback is fine locally but anyone who knows it could forge unlock cookies.
const SECRET = process.env.TESTORA_SECRET || "testora-insecure-dev-secret-change-me";

export const UNLOCK_COOKIE_NAME = "e2e_unlocked";
const UNLOCK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const UNLOCK_COOKIE_MAX_AGE = Math.floor(UNLOCK_TTL_MS / 1000);

// ── Key hashing (salted scrypt) ──────────────────────────────────────────────

export function hashKey(key: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(key, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyKey(key: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const derived = crypto.scryptSync(key, salt, 64);
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

// ── Signed unlock cookie (list of unlocked app ids + expiry) ──────────────────

interface UnlockData {
  ids: string[];
  exp: number;
}

function sign(body: string): string {
  return crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
}

/** Encode + sign an unlock cookie value granting access to `ids` for the TTL. */
export function encodeUnlock(ids: string[]): string {
  const data: UnlockData = { ids: [...new Set(ids)], exp: Date.now() + UNLOCK_TTL_MS };
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeUnlock(raw: string | undefined): string[] {
  if (!raw) return [];
  const [body, sig] = raw.split(".");
  if (!body || !sig || sign(body) !== sig) return [];
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as UnlockData;
    if (!data || typeof data.exp !== "number" || data.exp < Date.now()) return [];
    return Array.isArray(data.ids) ? data.ids : [];
  } catch {
    return [];
  }
}

/** The app ids the current viewer has unlocked (from the signed cookie). */
export async function getUnlockedProjectIds(): Promise<string[]> {
  const store = await cookies();
  return decodeUnlock(store.get(UNLOCK_COOKIE_NAME)?.value);
}

/** New cookie value with `id` added to the viewer's unlocked set. */
export async function unlockCookieValue(id: string): Promise<string> {
  return encodeUnlock([...(await getUnlockedProjectIds()), id]);
}

/** New cookie value with `id` removed from the viewer's unlocked set. */
export async function lockCookieValue(id: string): Promise<string> {
  return encodeUnlock((await getUnlockedProjectIds()).filter((x) => x !== id));
}

// ── Project access ────────────────────────────────────────────────────────────

export type ProjectVisibility = "public" | "private";

export interface ProjectRow {
  id: string;
  name: string;
  baseUrl: string;
  apiUrl: string;
  visibility: ProjectVisibility;
  keyHash: string | null;
  productName: string | null;
  companyName: string | null;
  githubRepo: string | null;
  // Encrypted PAT — server-only, never surfaced to a viewer.
  githubTokenEnc: string | null;
  seeded: boolean;
}

/** A client-safe view of an app — sensitive fields are withheld while locked. */
export interface ViewerProject {
  id: string;
  name: string;
  visibility: ProjectVisibility;
  /** private && not unlocked by this viewer. */
  locked: boolean;
  seeded: boolean;
  // Only present when the app is viewable (public or unlocked).
  baseUrl?: string;
  apiUrl?: string;
  productName?: string | null;
  companyName?: string | null;
  // The configured GitHub repo ("owner/name") and whether a token is stored.
  // The token itself is never exposed — only this boolean.
  githubRepo?: string | null;
  githubConfigured?: boolean;
}

function toViewer(row: ProjectRow, unlockedIds: string[]): ViewerProject {
  const locked = row.visibility === "private" && !unlockedIds.includes(row.id);
  const base: ViewerProject = {
    id: row.id,
    name: row.name,
    visibility: row.visibility,
    locked,
    seeded: row.seeded,
  };
  if (locked) return base; // withhold URLs + branding while locked
  return {
    ...base,
    baseUrl: row.baseUrl,
    apiUrl: row.apiUrl,
    productName: row.productName,
    companyName: row.companyName,
    githubRepo: row.githubRepo,
    githubConfigured: Boolean(row.githubTokenEnc),
  };
}

async function getRow(id: string): Promise<ProjectRow | undefined> {
  const row = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  return row as ProjectRow | undefined;
}

/** All apps as client-safe views (locked apps expose only id/name/visibility). */
export async function listProjectsForViewer(): Promise<ViewerProject[]> {
  const rows = (await db.select().from(projects).orderBy(projects.createdAt)) as ProjectRow[];
  const unlocked = await getUnlockedProjectIds();
  return rows.map((row) => toViewer(row, unlocked));
}

export interface ProjectAccess {
  exists: boolean;
  locked: boolean;
  project: ViewerProject | null;
}

/** Access state for one app — used to gate pages/routes for the active project. */
export async function getProjectAccess(id: string): Promise<ProjectAccess> {
  const row = await getRow(id);
  if (!row) return { exists: false, locked: false, project: null };
  const unlocked = await getUnlockedProjectIds();
  const view = toViewer(row, unlocked);
  return { exists: true, locked: view.locked, project: view };
}

/**
 * Whether the current viewer may see an app's data. Public apps and unknown ids
 * (e.g. legacy catalog rows whose app predates this table) are always viewable;
 * private apps require an unlock cookie.
 */
export async function isProjectViewable(id: string | undefined | null): Promise<boolean> {
  if (!id) return true;
  const row = await getRow(id);
  if (!row) return true;
  if (row.visibility === "public") return true;
  return (await getUnlockedProjectIds()).includes(id);
}
