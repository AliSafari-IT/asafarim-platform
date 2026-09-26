import type { Metadata } from "next";
import { Alert, PageHeader } from "@asafarim/ui";
import { listApplications } from "../../lib/applications/service";
import { getTranslator } from "../../lib/i18n-server";
import { getCurrentWorkspace } from "../../lib/workspace";
import { ApplicationRow } from "./ApplicationRow";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.app.metaTitle") };
}
export const dynamic = "force-dynamic";

/** List view for issue #432's per-application tracker. Read-only server
 *  render; status/notes edits happen inline via ApplicationRow's client
 *  PATCH calls to /api/applications/[id]. */
export default async function ApplicationsPage() {
  const { t } = await getTranslator();
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return (
      <>
        <PageHeader kicker={t("resumatch.app.kicker")} title={t("resumatch.inactive.title")} />
        <Alert tone="warning">
          <strong>{t("resumatch.inactive.strong")}</strong> {t("resumatch.inactive.body")}
        </Alert>
      </>
    );
  }

  const applications = await listApplications(workspace.id);

  return (
    <>
      <PageHeader
        kicker={t("resumatch.app.kicker")}
        title={t("resumatch.app.title")}
        description={t("resumatch.app.description")}
      />

      {applications.length === 0 ? (
        <Alert tone="info">
          {t("resumatch.app.empty")}
        </Alert>
      ) : (
        <div className="rm-application-list">
          {applications.map((application) => (
            <ApplicationRow key={application.id} application={application} />
          ))}
        </div>
      )}
    </>
  );
}
