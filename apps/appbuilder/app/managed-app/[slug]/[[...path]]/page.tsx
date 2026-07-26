import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { resolveActiveDomainForHost, managedAppsBaseDomain } from "@/lib/routing/resolveAppHost";
import { resolveRuntimeContext, NotAMemberError, type RuntimeContext } from "@/lib/generated-data/runtimeAuth";
import { NotFoundError } from "@/lib/errors";
import { renderLiveOrAccessDenied } from "../../../apps/[appId]/preview/[[...path]]/page";

export const metadata: Metadata = { title: "App" };

interface ManagedAppPageProps {
  /**
   * `slug` is the already-validated (by proxy.ts, via
   * lib/routing/resolveAppHost.ts) managed-app slug — NEVER an appId, and
   * never trusted as one. This route re-resolves the app id, and the
   * ACTIVE production release, fresh from the persisted `app_domains` table
   * itself; a client can never select or hint at a release id.
   */
  params: Promise<{ slug: string; path?: string[] }>;
}

/**
 * M11 production render route for a managed app
 * (`https://{slug}.apps.asafarim.com/...`, rewritten here by proxy.ts as
 * `/managed-app/{slug}/...`). This path is NOT a Next.js "private folder"
 * (an underscore-prefixed name is excluded from routing entirely) and is
 * therefore directly navigable on the builder's own domain too — proxy.ts's
 * own direct-hit guard already 404s that outright before this component
 * ever runs; the header check below is defense in depth in case that guard
 * is ever changed. Deliberately reuses
 * `renderLiveOrAccessDenied`/`LiveShell` from the preview route verbatim
 * (see that function's docstring) — a generated app is served by the SAME
 * controlled metadata runtime in both preview and production; only the
 * resolved `environment`/specification source differ
 * (`resolveRuntimeContext`'s `production` branch resolves the app's ACTIVE
 * RELEASE, never a draft or the pinned preview build).
 *
 * Authorization is layered exactly like preview: an unauthenticated visitor
 * never reaches this Server Component at all (proxy.ts's
 * `managedAppAuthProxy` already redirected them to sign-in); an
 * authenticated visitor with no real generated-app membership for THIS
 * environment gets the same leak-safe 404 an unknown app would — never a
 * distinguishing "you're not a member" panel (unlike preview's builder-only
 * seed-data affordance, which has no production equivalent).
 */
export default async function ManagedAppPage({ params }: ManagedAppPageProps) {
  const { slug, path = [] } = await params;
  const requestHeaders = await headers();
  if (requestHeaders.get("x-appbuilder-managed-app-verified") !== "1") notFound();

  const actor = await getActor();
  if (!actor) notFound(); // defensive — proxy.ts already gates this

  const db = getDb();
  const host = `${slug}.${managedAppsBaseDomain()}`;
  const resolved = await resolveActiveDomainForHost(db, host);
  if (!resolved || !resolved.activeReleaseId) notFound();

  let ctx: RuntimeContext;
  try {
    ctx = await resolveRuntimeContext(db, actor, resolved.appId, { environment: "production" });
  } catch (err) {
    if (err instanceof NotAMemberError || err instanceof NotFoundError) notFound();
    throw err;
  }

  return renderLiveOrAccessDenied({ appId: resolved.appId, ctx, path, isEndUser: true, basePath: "" });
}
