import type { Metadata } from "next";
import { Alert, Card, PageHeader } from "@asafarim/ui";
import { explainReasonCode } from "../../lib/documents/pipeline";
import { listDocuments } from "../../lib/documents/service";
import { emptyProfile } from "../../lib/profile/contract";
import { ERASURE_SLA_DAYS } from "../../lib/profile/dataRights";
import { getLatestVersion, listVersions } from "../../lib/profile/versions";
import { getCurrentWorkspace } from "../../lib/workspace";
import { DataRightsPanel } from "./DataRightsPanel";
import { ProfileWorkbench } from "./ProfileWorkbench";
import { UploadPanel } from "./UploadPanel";

export const metadata: Metadata = { title: "Your profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return (
      <>
        <PageHeader kicker="Profile" title="This account cannot open a profile." />
        <Alert tone="warning">
          <strong>Account inactive.</strong> Your platform account is not active, so JobMatch will
          not open a workspace for it.
        </Alert>
      </>
    );
  }

  const [documents, latest, versions] = await Promise.all([
    listDocuments(workspace.id),
    getLatestVersion(workspace.id),
    listVersions(workspace.id),
  ]);

  const confirmed = versions.find((version) => version.isConfirmed) ?? null;

  return (
    <>
      <PageHeader
        kicker="Profile"
        kickerIndex="M2"
        title="Your profile, in your words."
        description="Upload a CV to save typing, then correct whatever it got wrong. Nothing is matched against until you confirm it."
      />

      <UploadPanel
        documents={documents.map((document) => ({
          id: document.id,
          originalFilename: document.originalFilename,
          byteSize: document.byteSize,
          status: document.status,
          reasonCode: document.reasonCode,
          explanation: document.reasonCode ? explainReasonCode(document.reasonCode) : null,
          uploadedAt: document.uploadedAt.toISOString(),
          retainUntil: document.retainUntil?.toISOString() ?? null,
        }))}
      />

      <section style={{ marginTop: "2rem" }}>
        {/* Keyed by version id so a newly extracted profile REPLACES the
            form after router.refresh(). Without the key, the client
            component keeps its initial useState value and a candidate can
            confirm an empty profile moments after uploading a CV — the one
            outcome this whole screen exists to prevent. */}
        <ProfileWorkbench
          key={latest?.id ?? "empty"}
          initialContent={latest?.content ?? emptyProfile()}
          initialConfidence={latest?.confidence ?? {}}
          versionId={latest?.id ?? null}
          versionNumber={latest?.versionNumber ?? null}
          isConfirmed={latest?.isConfirmed ?? false}
          hasDocument={documents.length > 0}
        />
      </section>

      {versions.length > 0 ? (
        <section style={{ marginTop: "2rem" }}>
          <Card title="Version history">
            <p style={{ opacity: 0.85 }}>
              Every correction creates a new version and none are ever overwritten. That is what lets
              JobMatch explain a result you were shown months ago: the profile that produced it still
              exists, exactly as it was.
            </p>
            <ul className="jm-list">
              {versions.map((version) => (
                <li key={version.id}>
                  <span className="jm-mono">v{version.versionNumber}</span>{" "}
                  <span style={{ opacity: 0.8 }}>
                    {version.origin === "EXTRACTED"
                      ? "read from your CV"
                      : version.origin === "CORRECTED"
                        ? "your corrections"
                        : "written by hand"}
                  </span>{" "}
                  <span className="jm-mono" style={{ opacity: 0.6, fontSize: "0.75rem" }}>
                    {version.createdAt.toISOString().slice(0, 10)} · {version.extractorName}@
                    {version.extractorVersion}
                  </span>
                  {version.isConfirmed ? <strong> · confirmed</strong> : null}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <section style={{ marginTop: "2rem" }}>
        <DataRightsPanel erasureSlaDays={ERASURE_SLA_DAYS} hasData={documents.length > 0 || versions.length > 0} />
      </section>

      {confirmed ? null : (
        <p className="jm-note" style={{ marginTop: "2rem" }}>
          No confirmed version yet. Matching will not run against an unreviewed profile — that is
          deliberate, not a missing feature.
        </p>
      )}
    </>
  );
}
