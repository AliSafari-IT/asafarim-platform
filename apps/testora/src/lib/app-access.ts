import "server-only";
import { eq } from "drizzle-orm";
import { auth } from "@asafarim/auth";
import { db } from "@/db/client";
import { projects } from "@/db/schema";

// Server-only access control for private apps. Access is managed by the
// platform SSO: a private app's catalog and results are withheld until the
// viewer is signed in through the ASafarIM identity (any authenticated, active
// user). Public apps are always viewable. There are no per-app keys.

/** Whether the current viewer is a signed-in, active platform user. */
export async function isViewerAuthenticated(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user?.id) && session?.user?.isActive !== false;
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
  /** private && the viewer is not signed in. */
  locked: boolean;
  seeded: boolean;
  // Only present when the app is viewable (public or the viewer is signed in).
  baseUrl?: string;
  apiUrl?: string;
  productName?: string | null;
  companyName?: string | null;
  // The configured GitHub repo ("owner/name") and whether a token is stored.
  // The token itself is never exposed — only this boolean.
  githubRepo?: string | null;
  githubConfigured?: boolean;
}

function toViewer(row: ProjectRow, authenticated: boolean): ViewerProject {
  const locked = row.visibility === "private" && !authenticated;
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
  const authenticated = await isViewerAuthenticated();
  return rows.map((row) => toViewer(row, authenticated));
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
  const authenticated = await isViewerAuthenticated();
  const view = toViewer(row, authenticated);
  return { exists: true, locked: view.locked, project: view };
}

/**
 * Whether the current viewer may see an app's data. Public apps and unknown ids
 * (e.g. legacy catalog rows whose app predates this table) are always viewable;
 * private apps require a signed-in platform user.
 */
export async function isProjectViewable(id: string | undefined | null): Promise<boolean> {
  if (!id) return true;
  const row = await getRow(id);
  if (!row) return true;
  if (row.visibility === "public") return true;
  return isViewerAuthenticated();
}
