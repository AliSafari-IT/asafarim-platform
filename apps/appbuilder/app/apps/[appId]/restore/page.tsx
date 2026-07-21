import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Button, ButtonLink, Card, PageHeader } from "@asafarim/ui";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getAppForActor } from "@/lib/repositories/apps";
import { NotFoundError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { confirmRestoreAction } from "./actions";

export const metadata: Metadata = { title: "Restore app" };

interface RestoreAppPageProps {
  params: Promise<{ appId: string }>;
}

export default async function RestoreAppPage({ params }: RestoreAppPageProps) {
  const { appId } = await params;
  const actor = await requireActor({ callbackUrl: routes.appRestore(appId) });

  let app;
  try {
    app = await getAppForActor(getDb(), actor, appId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  if (app.status === "active") {
    return (
      <>
        <PageHeader kicker="Restore" title={`"${app.name}" is already active`} />
        <ButtonLink href={routes.appDetail(appId)} variant="secondary">
          Back to app
        </ButtonLink>
      </>
    );
  }

  const boundAction = confirmRestoreAction.bind(null, appId);

  return (
    <>
      <PageHeader
        kicker="Restore"
        title={`Restore "${app.name}"?`}
        description="Restoring returns this app to an active draft state. Its full version history is intact and unaffected by the archive/restore cycle."
      />
      <Card>
        <Alert tone="info">
          The app becomes editable again immediately after restoring.
        </Alert>
        <form action={boundAction} style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          <Button type="submit">Restore this app</Button>
          <ButtonLink href={routes.appDetail(appId)} variant="secondary">
            Cancel
          </ButtonLink>
        </form>
      </Card>
    </>
  );
}
