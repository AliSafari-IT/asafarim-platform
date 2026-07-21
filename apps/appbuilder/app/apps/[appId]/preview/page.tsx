import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@asafarim/ui";
import { requireActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { assertCapability } from "@/lib/repositories/authz";
import { NotFoundError } from "@/lib/errors";

export const metadata: Metadata = { title: "Preview" };

interface AppPreviewPageProps {
  params: Promise<{ appId: string }>;
}

export default async function AppPreviewPage({ params }: AppPreviewPageProps) {
  const { appId } = await params;
  const actor = await requireActor({
    callbackUrl: `/apps/${encodeURIComponent(appId)}/preview`,
  });

  // "app.viewPreview" is its own named capability in the M03 policy layer
  // (lib/repositories/authz.ts), distinct from "app.view" — the metadata
  // preview runtime (M06) can tighten its minimum role later without
  // touching every other call site.
  let app;
  try {
    ({ app } = await assertCapability(getDb(), actor, appId, "app.viewPreview"));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return (
    <>
      <PageHeader
        kicker="Preview"
        kickerIndex="04"
        title={`Preview — ${app.name}`}
        description="Live render of this app's current specification, from the approved template/component registry."
      />
      <Alert tone="info">
        The metadata-driven preview runtime ships in M06, built on the
        template/component registry it introduces. Nothing here executes
        AI-generated code — see docs/adr/0001-appbuilder-managed-runtime.md.
        This route now enforces the real viewPreview capability (M03).
      </Alert>
    </>
  );
}
