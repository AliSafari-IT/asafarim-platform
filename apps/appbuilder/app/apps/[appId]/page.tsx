import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, ButtonLink, PageHeader } from "@asafarim/ui";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getAppForActor } from "@/lib/repositories/apps";
import { NotFoundError } from "@/lib/errors";

export const metadata: Metadata = { title: "App detail" };

interface AppDetailPageProps {
  params: Promise<{ appId: string }>;
}

export default async function AppDetailPage({ params }: AppDetailPageProps) {
  const { appId } = await params;
  const actor = await requireActor({ callbackUrl: `/apps/${encodeURIComponent(appId)}` });

  // getAppForActor enforces owner/collaborator scoping (M03): an
  // authenticated user unrelated to this app gets the same NotFoundError
  // as a truly nonexistent id, so this route never leaks whether an
  // inaccessible app exists.
  let app;
  try {
    app = await getAppForActor(getDb(), actor, appId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        kicker="App"
        kickerIndex="03"
        title={app.name}
        description="Specification, version history, and settings for this generated app."
      />
      <Alert tone="info">
        Specification editing, version history, and collaborator management
        land with the operation engine (M04) and the builder workspace (M08).
        This route now enforces the real ownership/collaborator boundary
        (M03) rather than resolving every id to the same shell.
      </Alert>
      <p>
        <ButtonLink href={`/apps/${encodeURIComponent(appId)}/preview`} variant="secondary">
          Open preview
        </ButtonLink>
      </p>
    </>
  );
}
