import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink, EmptyState, PageHeader } from "@asafarim/ui";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getAppOverviewForActor } from "@/lib/repositories/appOverview";
import { getLatestVersionForActor } from "@/lib/repositories/specifications";
import { NotFoundError } from "@/lib/errors";
import { roleGrants } from "@/lib/repositories/authz";
import { routes } from "@/lib/routes";
import { GenerationStatusPanel } from "./GenerationStatusPanel";
import { WorkspaceShell } from "./workspace/WorkspaceShell";
import styles from "./workspace.module.css";

export const metadata: Metadata = { title: "Builder workspace" };

interface AppDetailPageProps {
  params: Promise<{ appId: string }>;
  searchParams: Promise<{ actionError?: string; generationBlocked?: string }>;
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
  const { actionError, generationBlocked } = await searchParams;
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

  // An archived app's builder workspace is intentionally never shown, even
  // to a collaborator who could restore it — editing/generating/deploying an
  // archived app makes no sense, and this used to silently render the full
  // live editor (AI conversation panel included — the assistant would even
  // accept and attempt modification requests against it) with only a small
  // status badge as the only sign anything was different. Viewing the last
  // pinned PREVIEW stays allowed while archived (unchanged, documented
  // policy — see the preview route's own docstring); only the editing
  // surface is gated here.
  if (app.status === "archived") {
    return (
      <div className={styles.workspacePage} data-appbuilder-workspace>
        <PageHeader kicker="App" kickerIndex="04" title={app.name} />
        <EmptyState
          title="This app is archived"
          description={
            canRestore
              ? "Restore it to resume editing, generation, and deployment — or come back to it later from the apps catalog."
              : "Its owner archived this app. Ask them to restore it if you need to keep working on it."
          }
        />
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {canRestore ? (
            <ButtonLink href={routes.appRestore(appId)}>Restore this app</ButtonLink>
          ) : null}
          {hasPreview ? (
            <ButtonLink href={routes.appPreview(appId)} variant="secondary" newTab>
              View last preview
            </ButtonLink>
          ) : null}
          <ButtonLink href={routes.apps()} variant="ghost">
            Back to apps
          </ButtonLink>
        </div>
      </div>
    );
  }

  const latestVersion = specification && specification.currentVersionNumber > 0 ? await getLatestVersionForActor(getDb(), actor, appId) : undefined;

  return (
    <div className={styles.workspacePage} data-appbuilder-workspace>
      <GenerationStatusPanel appId={appId} canManage={roleGrants(role, "app.requestGeneration")} initialBlockedReason={generationBlocked} />
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
    </div>
  );
}
