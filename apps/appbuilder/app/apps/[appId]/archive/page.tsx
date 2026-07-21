import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Button, ButtonLink, Card, PageHeader } from "@asafarim/ui";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getAppForActor } from "@/lib/repositories/apps";
import { NotFoundError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { confirmArchiveAction } from "./actions";

export const metadata: Metadata = { title: "Archive app" };

interface ArchiveAppPageProps {
  params: Promise<{ appId: string }>;
}

/**
 * A dedicated confirmation step (rather than a client-side modal) so
 * archiving works with no client JS, is keyboard/screen-reader navigable by
 * default, and matches this repo's "no native dialogs" convention without
 * introducing a bespoke modal component.
 */
export default async function ArchiveAppPage({ params }: ArchiveAppPageProps) {
  const { appId } = await params;
  const actor = await requireActor({ callbackUrl: routes.appArchive(appId) });

  let app;
  try {
    app = await getAppForActor(getDb(), actor, appId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  if (app.status === "archived") {
    return (
      <>
        <PageHeader kicker="Archive" title={`"${app.name}" is already archived`} />
        <ButtonLink href={routes.appDetail(appId)} variant="secondary">
          Back to app
        </ButtonLink>
      </>
    );
  }

  const boundAction = confirmArchiveAction.bind(null, appId);

  return (
    <>
      <PageHeader
        kicker="Archive"
        title={`Archive "${app.name}"?`}
        description="The app and its version history are kept — nothing is deleted. Archived apps are hidden from the default catalog view but remain visible under the archived filter, and can be restored at any time."
      />
      <Card>
        <Alert tone="info">
          This does not delete any data. Archiving only changes the app's
          lifecycle status and blocks normal edit operations until it is
          restored.
        </Alert>
        <form action={boundAction} style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          <Button type="submit" variant="danger">
            Archive this app
          </Button>
          <ButtonLink href={routes.appDetail(appId)} variant="secondary">
            Cancel
          </ButtonLink>
        </form>
      </Card>
    </>
  );
}
