import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, PageHeader } from "@asafarim/ui";
import { getTranslator } from "../../lib/i18n-server";
import { getCurrentWorkspace } from "../../lib/workspace";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.nav.workspace") };
}

// The workspace reads the session and touches the database on every visit.
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const { t } = await getTranslator();
  const workspace = await getCurrentWorkspace();

  // The proxy already redirects anonymous visitors to Hub; reaching this
  // branch means a valid JWT for an account that is no longer active.
  if (!workspace) {
    return (
      <>
        <PageHeader kicker={t("resumatch.workspace.kicker")} title={t("resumatch.inactive.title")} />
        <Alert tone="warning">
          <strong>{t("resumatch.inactive.strong")}</strong> {t("resumatch.workspace.inactiveBody")}
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        kicker={t("resumatch.workspace.kicker")}
        title={t("resumatch.workspace.title")}
        description={t("resumatch.workspace.description")}
      />

      <section className="jm-grid" style={{ margin: "2rem 0" }}>
        <Card title={t("resumatch.workspace.card")}>
          <p className="jm-mono" style={{ fontSize: "0.8rem", opacity: 0.7 }}>
            {workspace.id}
          </p>
          <p style={{ opacity: 0.85 }}>
            {t("resumatch.workspace.created", { date: workspace.createdAt.toISOString().slice(0, 10) })}
          </p>
        </Card>
        <Card title={t("resumatch.workspace.profileCard")}>
          <p style={{ opacity: 0.85 }}>
            {t("resumatch.workspace.profileBody")}
          </p>
          <Link href="/profile" className="ui-btn ui-btn--secondary ui-btn--sm">
            {t("resumatch.tailor.confirmFirst.cta")}
          </Link>
        </Card>
        <Card title={t("resumatch.workspace.tailorCard")}>
          <p style={{ opacity: 0.85 }}>
            {t("resumatch.workspace.tailorBody")}
          </p>
          <Link href="/tailor" className="ui-btn ui-btn--primary ui-btn--sm">
            {t("resumatch.insights.next.cta")}
          </Link>
        </Card>
      </section>
    </>
  );
}
