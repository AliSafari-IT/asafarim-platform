import type { Metadata } from "next";
import { Alert, PageHeader } from "@asafarim/ui";
import { canRetryScan, explainReasonCode } from "../../lib/documents/pipeline";
import { getJobmatchDb } from "../../lib/db/client";
import { listDocuments } from "../../lib/documents/service";
import { getJourneyCounts } from "../../lib/journey";
import { emptyProfile } from "../../lib/profile/contract";
import { ERASURE_SLA_DAYS } from "../../lib/profile/dataRights";
import { getLatestVersion, listVersions } from "../../lib/profile/versions";
import { getCurrentWorkspace, getSessionAccountInfo } from "../../lib/workspace";
import { JourneyTracker } from "../components/app/JourneyTracker";
import { PageHero } from "../components/app/PageHero";
import { ShowcaseNotice } from "../components/ShowcaseNotice";
import { DataRightsPanel } from "./DataRightsPanel";
import { NextStepTrack, ProfileCompleteness, VersionTimeline } from "./ProfileInsights";
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
          <strong>Account inactive.</strong> Your platform account is not active, so ResuMatch will
          not open a workspace for it.
        </Alert>
      </>
    );
  }

  const [documents, latest, versions, journey, jobsCount] = await Promise.all([
    listDocuments(workspace.id),
    getLatestVersion(workspace.id),
    listVersions(workspace.id),
    getJourneyCounts(workspace.id),
    getJobmatchDb().targetJob.count({ where: { workspaceId: workspace.id } }),
  ]);

  const confirmed = versions.find((version) => version.isConfirmed) ?? null;

  // A brand-new profile is prefilled from the platform account so a
  // candidate with no CV yet isn't asked to retype their own name and
  // email. Only applied before the first save: once a version exists, its
  // content — including a field the candidate deliberately cleared — is
  // what's shown, never silently overwritten by the account record.
  let initialContent = latest?.content ?? emptyProfile();
  if (!latest) {
    const account = await getSessionAccountInfo();
    initialContent = {
      ...initialContent,
      fullName: initialContent.fullName ?? account.fullName,
      email: initialContent.email ?? account.email,
    };
  }

  return (
    <div className="rx">
      <PageHero
        kicker="Profile"
        title="Your profile,"
        accent="in your words."
        lead="Upload a CV to save typing, then correct whatever it got wrong. Nothing is matched against until you confirm it."
        aside={<JourneyTracker counts={journey} current="profile" />}
      />

      <ShowcaseNotice />

      <div className="rx-duo">
        <ProfileCompleteness content={initialContent} />
        {confirmed ? (
          <NextStepTrack />
        ) : (
          <section className="rx-panel rx-panel--warm" aria-labelledby="rx-unconfirmed-title">
            <h2 id="rx-unconfirmed-title" className="rx-panel__title">
              Confirm your profile to unlock tailoring
            </h2>
            <p className="rx-panel__sub">
              Tailoring never runs against an unreviewed profile — that is deliberate, not a missing
              feature. Check what was read below, fix anything wrong, then press{" "}
              <strong>Save and confirm</strong>.
            </p>
          </section>
        )}
      </div>

      <UploadPanel
        documents={documents.map((document) => ({
          id: document.id,
          originalFilename: document.originalFilename,
          byteSize: document.byteSize,
          status: document.status,
          reasonCode: document.reasonCode,
          explanation: document.reasonCode ? explainReasonCode(document.reasonCode) : null,
          canRetryScan: canRetryScan(document.status as never, document.reasonCode),
          uploadedAt: document.uploadedAt.toISOString(),
          retainUntil: document.retainUntil?.toISOString() ?? null,
        }))}
      />

      <section>
        {/* Keyed by version id so a newly extracted profile REPLACES the
            form after router.refresh(). Without the key, the client
            component keeps its initial useState value and a candidate can
            confirm an empty profile moments after uploading a CV — the one
            outcome this whole screen exists to prevent. */}
        <ProfileWorkbench
          key={latest?.id ?? "empty"}
          initialContent={initialContent}
          initialConfidence={latest?.confidence ?? {}}
          versionId={latest?.id ?? null}
          versionNumber={latest?.versionNumber ?? null}
          isConfirmed={latest?.isConfirmed ?? false}
          hasDocument={documents.length > 0}
        />
      </section>

      {versions.length > 0 ? <VersionTimeline versions={versions} /> : null}

      <DataRightsPanel
        erasureSlaDays={ERASURE_SLA_DAYS}
        hasData={documents.length > 0 || versions.length > 0 || jobsCount > 0 || journey.tailoredCount > 0}
        holdings={{
          documents: documents.length,
          versions: versions.length,
          jobs: jobsCount,
          tailored: journey.tailoredCount,
        }}
      />
    </div>
  );
}
