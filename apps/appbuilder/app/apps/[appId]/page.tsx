import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getAppOverviewForActor } from "@/lib/repositories/appOverview";
import { getLatestVersionForActor } from "@/lib/repositories/specifications";
import { NotFoundError } from "@/lib/errors";
import { roleGrants } from "@/lib/repositories/authz";
import { GenerationStatusPanel } from "./GenerationStatusPanel";
import { WorkspaceShell } from "./workspace/WorkspaceShell";

export const metadata: Metadata = { title: "Builder workspace" };

interface AppDetailPageProps {
  params: Promise<{ appId: string }>;
  searchParams: Promise<{ actionError?: string }>;
}

/**
 * The M08 builder workspace — replaces the M05 "continuation page"
 * disclaimer entirely. Server-side, this route only ever does the initial
 * actor-scoped, leak-safe load (identical contract to the page it
 * replaces: an unrelated actor gets the same 404 as a nonexistent app,
 * never a distinguishing signal) and hands off to the client-side
 * `WorkspaceShell`, which owns all further reads/writes through the M08 API
 * routes.
 */
export default async function AppDetailPage({ params, searchParams }: AppDetailPageProps) {
  const { appId } = await params;
  const { actionError } = await searchParams;
  const actor = await requireActor({ callbackUrl: `/apps/${encodeURIComponent(appId)}` });

  let overview;
  try {
    overview = await getAppOverviewForActor(getDb(), actor, appId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const { app, role, specification } = overview;
  const hasPreview = specification?.pinnedPreviewBuildId != null;
  const canArchive = roleGrants(role, "app.archive");
  const canRestore = roleGrants(role, "app.restore");

  const latestVersion = specification && specification.currentVersionNumber > 0 ? await getLatestVersionForActor(getDb(), actor, appId) : undefined;

  return (
    <>
      <GenerationStatusPanel appId={appId} canManage={roleGrants(role, "app.requestGeneration")} />
      <WorkspaceShell
        appId={appId}
        appName={app.name}
        appStatus={app.status}
        role={role}
        initialSpec={(latestVersion?.payload as Record<string, unknown>) ?? null}
        initialVersionNumber={specification?.currentVersionNumber ?? 0}
        hasPreview={hasPreview}
        actionError={actionError}
        canArchive={canArchive}
        canRestore={canRestore}
      />
    </>
  );
}
