import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Badge, Button, ButtonLink, Card, PageHeader } from "@asafarim/ui";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getAppOverviewForActor } from "@/lib/repositories/appOverview";
import { NotFoundError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { STARTER_FAMILY_LABELS, type StarterFamily } from "@/lib/validation/createApp";
import { roleGrants } from "@/lib/repositories/authz";
import { requestPreviewBuildAction } from "./previewActions";

export const metadata: Metadata = { title: "App detail" };

interface AppDetailPageProps {
  params: Promise<{ appId: string }>;
  searchParams: Promise<{ actionError?: string }>;
}

function formatDateTime(date: Date): string {
  return new Date(date).toISOString().slice(0, 16).replace("T", " ");
}

export default async function AppDetailPage({ params, searchParams }: AppDetailPageProps) {
  const { appId } = await params;
  const { actionError } = await searchParams;
  const actor = await requireActor({ callbackUrl: `/apps/${encodeURIComponent(appId)}` });

  // getAppOverviewForActor enforces owner/collaborator scoping (M03): an
  // authenticated user unrelated to this app gets the same NotFoundError as
  // a truly nonexistent id, so this route never leaks whether an
  // inaccessible app exists.
  let overview;
  try {
    overview = await getAppOverviewForActor(getDb(), actor, appId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const { app, role, specification, latestPreviewBuild, latestRelease, creationRequest } = overview;
  // Independent from `latestPreviewBuild.status`: a failed rebuild attempt
  // must never take away an app's still-working, previously pinned preview.
  const hasPreview = specification?.pinnedPreviewBuildId != null;
  const latestAttemptFailed = latestPreviewBuild?.status === "failed";
  const canArchive = roleGrants(role, "app.archive");
  const canRestore = roleGrants(role, "app.restore");
  const canRequestPreview = roleGrants(role, "app.editSpecification") && app.status === "active";

  return (
    <>
      <PageHeader
        kicker="App"
        kickerIndex="03"
        title={app.name}
        description={app.description || "No description yet."}
      />

      {actionError === "forbidden" ? (
        <Alert tone="error">
          You don&apos;t have permission to perform that action on this app.
        </Alert>
      ) : null}
      {actionError === "archived" ? (
        <Alert tone="error">Restore this app before requesting a new preview build.</Alert>
      ) : null}

      <Card title="Overview">
        <dl className="ui-descriptionlist" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))", gap: "var(--space-4)" }}>
          <div>
            <dt className="ui-hint">Status</dt>
            <dd>
              <Badge tone={app.status === "active" ? "success" : "warning"}>
                {app.status === "active" ? "Active" : "Archived"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="ui-hint">Your access</dt>
            <dd>
              <Badge tone={role === "owner" ? "success" : role === "editor" ? "info" : "neutral"}>
                {role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="ui-hint">Current draft version</dt>
            <dd>{specification && specification.currentVersionNumber > 0 ? `v${specification.currentVersionNumber}` : "No version yet"}</dd>
          </div>
          <div>
            <dt className="ui-hint">Starter family</dt>
            <dd>{creationRequest ? STARTER_FAMILY_LABELS[creationRequest.starterFamily as StarterFamily] : "—"}</dd>
          </div>
          <div>
            <dt className="ui-hint">Last updated</dt>
            <dd>{formatDateTime(app.updatedAt)}</dd>
          </div>
          <div>
            <dt className="ui-hint">Preview status</dt>
            <dd>
              {hasPreview ? (
                <Badge tone="success">Ready</Badge>
              ) : latestPreviewBuild ? (
                <Badge tone={latestAttemptFailed ? "warning" : "neutral"}>{latestPreviewBuild.status}</Badge>
              ) : (
                "No preview requested yet"
              )}
            </dd>
          </div>
          <div>
            <dt className="ui-hint">Latest release</dt>
            <dd>{latestRelease ? `${latestRelease.versionLabel} (${latestRelease.status})` : "No release yet"}</dd>
          </div>
        </dl>
      </Card>

      {latestAttemptFailed ? (
        <Alert tone="error">
          <strong>The most recent preview build failed{hasPreview ? " — the last successful preview is still available below." : "."}</strong>
          {latestPreviewBuild?.errorMessage ? <p>{latestPreviewBuild.errorMessage}</p> : null}
        </Alert>
      ) : null}

      <Alert tone="info">
        This is a truthful overview, not the full builder: specification
        editing, version history, and collaborator management arrive with
        the operation engine surfaced in the UI and the builder workspace
        (M08). Nothing shown here implies AI-generated content exists yet —
        M07 interprets your initial prompt in a later milestone.
      </Alert>

      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginTop: "var(--space-4)" }}>
        <ButtonLink href={routes.appDetail(appId)} variant="secondary">
          Continue development
        </ButtonLink>
        {hasPreview ? (
          <ButtonLink href={routes.appPreview(appId)} variant="secondary">
            Open preview
          </ButtonLink>
        ) : null}
        {canRequestPreview ? (
          <form action={requestPreviewBuildAction.bind(null, appId)}>
            <Button type="submit" variant="secondary">
              {hasPreview ? "Rebuild preview" : "Build preview"}
            </Button>
          </form>
        ) : null}
        {app.status === "active" && canArchive ? (
          <ButtonLink href={routes.appArchive(appId)} variant="danger">
            Archive
          </ButtonLink>
        ) : null}
        {app.status === "archived" && canRestore ? (
          <ButtonLink href={routes.appRestore(appId)}>Restore</ButtonLink>
        ) : null}
        <ButtonLink href={routes.apps()} variant="ghost">
          Back to catalog
        </ButtonLink>
      </div>
    </>
  );
}
