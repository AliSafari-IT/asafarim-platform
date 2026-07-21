import type { Metadata } from "next";
import { Alert, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Preview" };

interface AppPreviewPageProps {
  params: Promise<{ appId: string }>;
}

export default async function AppPreviewPage({ params }: AppPreviewPageProps) {
  const { appId } = await params;

  // Route contract only: the metadata-driven preview runtime that actually
  // renders a generated app from its specification ships in M06.
  return (
    <>
      <PageHeader
        kicker="Preview"
        kickerIndex="04"
        title={`Preview — ${appId}`}
        description="Live render of this app's current specification, from the approved template/component registry."
      />
      <Alert tone="info">
        The metadata-driven preview runtime ships in M06, built on the
        template/component registry it introduces. Nothing here executes
        AI-generated code — see docs/adr/0001-appbuilder-managed-runtime.md.
      </Alert>
    </>
  );
}
