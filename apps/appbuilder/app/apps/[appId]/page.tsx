import type { Metadata } from "next";
import { Alert, ButtonLink, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "App detail" };

interface AppDetailPageProps {
  params: Promise<{ appId: string }>;
}

export default async function AppDetailPage({ params }: AppDetailPageProps) {
  const { appId } = await params;

  // No metadata store yet (M02) and no authorization/app registry yet (M03),
  // so every appId resolves to the same defined "not implemented" shell
  // rather than a real lookup or a bare 404.
  return (
    <>
      <PageHeader
        kicker="App"
        kickerIndex="03"
        title={appId}
        description="Specification, version history, and settings for this generated app."
      />
      <Alert tone="info">
        App detail loads from the metadata store shipping in M02, gated by
        the authorization work in M03. This route contract exists so the
        preview and builder milestones can link to it.
      </Alert>
      <p>
        <ButtonLink href={`/apps/${encodeURIComponent(appId)}/preview`} variant="secondary">
          Open preview
        </ButtonLink>
      </p>
    </>
  );
}
