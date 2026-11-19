import type { Metadata } from "next";
import { Alert, PageHeader } from "@asafarim/ui";
import { listApplicationPage } from "../../lib/applications/service";
import {
  DEFAULT_APPLICATION_LIST_QUERY,
  applicationListHref,
  hasApplicationFilters,
  parseApplicationListQuery,
  type ApplicationListQuery,
} from "../../lib/applications/listQuery";
import { getTranslator } from "../../lib/i18n-server";
import { getCurrentWorkspace } from "../../lib/workspace";
import { ApplicationRow } from "./ApplicationRow";
import { ApplicationListControls, ApplicationPagination } from "./ApplicationListControls";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.app.metaTitle") };
}
export const dynamic = "force-dynamic";

/** List view for issue #432's per-application tracker. Server render of one
 *  page of results (#897): search, filters, sort and page come from the URL
 *  (lib/applications/listQuery.ts, lenient: a malformed value falls back to
 *  its default). Status/notes/date edits happen inline via ApplicationRow's
 *  PATCH calls, whose router.refresh() re-runs this query, so a row edited
 *  out of the current filter leaves the list and the counts follow. */
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  const parsed = parseApplicationListQuery(await searchParams, "lenient");
  const query: ApplicationListQuery = parsed.ok ? parsed.query : DEFAULT_APPLICATION_LIST_QUERY;

  const header = (
    <PageHeader
      kicker={t("resumatch.app.kicker")}
      title={t("resumatch.app.title")}
      description={t("resumatch.app.description")}
    />
  );

  // A due filter without the browser's day: the controls add it to the URL
  // on mount. The server never guesses "today".
  if (query.due && !query.today) {
    return (
      <>
        {header}
        <ApplicationListControls query={query} />
        <p className="rm-app-summary" role="status" aria-live="polite">
          {t("resumatch.app.list.resolvingToday")}
        </p>
      </>
    );
  }

  const result = await listApplicationPage(workspace.id, query, { clampPage: true });
  const shown = { ...query, page: result.page };

  if (result.workspaceTotal === 0) {
    return (
      <>
        {header}
        <Alert tone="info">{t("resumatch.app.empty")}</Alert>
      </>
    );
  }

  const from = (result.page - 1) * result.pageSize + 1;
  const to = from + result.applications.length - 1;

  return (
    <>
      {header}
      <ApplicationListControls query={shown} />

      <p className="rm-app-summary" role="status" aria-live="polite">
        {result.total === 0
          ? t("resumatch.app.list.noMatch")
          : hasApplicationFilters(query)
            ? t("resumatch.app.list.summaryFiltered", { from, to, total: result.total, all: result.workspaceTotal })
            : t("resumatch.app.list.summary", { from, to, total: result.total })}
      </p>

      {result.total === 0 ? (
        <Alert tone="info">
          {t("resumatch.app.list.noMatchBody")}{" "}
          {/* A plain link, like the list controls: see ApplicationListControls. */}
          <a href={applicationListHref({ ...DEFAULT_APPLICATION_LIST_QUERY, sort: query.sort, pageSize: query.pageSize })}>
            {t("resumatch.app.list.clearFilters")}
          </a>
        </Alert>
      ) : (
        <>
          <div className="rm-application-list">
            {result.applications.map((application) => (
              <ApplicationRow key={application.id} application={application} />
            ))}
          </div>
          <ApplicationPagination query={shown} page={result.page} pageCount={result.pageCount} />
        </>
      )}
    </>
  );
}
