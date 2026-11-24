import type { Metadata } from "next";
import Link from "next/link";
import { Alert, PageHeader } from "@asafarim/ui";
import { listSentEmails } from "../../../lib/applicationEmail/sentList";
import {
  DEFAULT_SENT_QUERY,
  hasSentFilters,
  parseSentQuery,
  sentListHref,
  withSentFilter,
  type SentListQuery,
} from "../../../lib/applicationEmail/sentQuery";
import { getTranslator } from "../../../lib/i18n-server";
import { getCurrentWorkspace } from "../../../lib/workspace";
import { LocalTime } from "../../ai-usage/LocalTime";
import { SentStatusBadge } from "./SentStatusBadge";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.sent.metaTitle") };
}
export const dynamic = "force-dynamic";

/**
 * Sent applications: one read-only row per email (send-application.md).
 * Filters, sort and page live in the URL (lib/applicationEmail/sentQuery.ts),
 * so a filtered view can be bookmarked; clicking a company or a contact
 * narrows the list to it. Plain links throughout, like the application
 * list: every state is a URL, and the page works without JavaScript.
 */
export default async function SentApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getTranslator();
  const workspace = await getCurrentWorkspace();
  const header = <PageHeader kicker={t("resumatch.app.kicker")} title={t("resumatch.sent.title")} description={t("resumatch.sent.description")} />;
  if (!workspace) {
    return (
      <>
        {header}
        <Alert tone="warning">
          <strong>{t("resumatch.inactive.strong")}</strong> {t("resumatch.inactive.body")}
        </Alert>
      </>
    );
  }

  const query = parseSentQuery(await searchParams);
  const result = await listSentEmails(workspace.id, query);
  const shown: SentListQuery = { ...query, page: result.page };
  const filtered = hasSentFilters(query);

  const chips: { key: "company" | "contact" | "application"; label: string; text: string }[] = [];
  if (query.company) chips.push({ key: "company", label: t("resumatch.sent.filter.company"), text: result.labels.company ?? query.company });
  if (query.contact) chips.push({ key: "contact", label: t("resumatch.sent.filter.contact"), text: result.labels.contact ?? query.contact });
  if (query.application) chips.push({ key: "application", label: t("resumatch.sent.filter.application"), text: result.labels.application ?? query.application });

  return (
    <>
      {header}
      <p className="rm-sent-nav">
        <Link href="/applications">{t("resumatch.sent.backToApplications")}</Link>
      </p>

      {result.workspaceTotal === 0 ? (
        <Alert tone="info">{t("resumatch.sent.empty")}</Alert>
      ) : (
        <>
          <div className="rm-sent-controls">
            {chips.length > 0 ? (
              <div className="rm-filter-chips" role="group" aria-label={t("resumatch.sent.filter.active")}>
                <span className="rm-filter-chips__label">{t("resumatch.sent.filter.active")}:</span>
                {chips.map((chip) => (
                  <a
                    key={chip.key}
                    className="rm-filter-chip"
                    href={sentListHref(withSentFilter(shown, { [chip.key]: null }))}
                    aria-label={t("resumatch.sent.filter.remove", { label: chip.label, value: chip.text })}
                    data-testid={`chip-${chip.key}`}
                  >
                    <span className="rm-filter-chip__key">{chip.label}:</span> {chip.text} <span aria-hidden="true">×</span>
                  </a>
                ))}
                <a className="rm-filter-chips__clear" href={sentListHref({ ...DEFAULT_SENT_QUERY, sort: query.sort })} data-testid="clear-filters">
                  {t("resumatch.sent.filter.clear")}
                </a>
              </div>
            ) : null}
            <nav className="rm-sent-sort" aria-label={t("resumatch.sent.sort.label")}>
              <span>{t("resumatch.sent.sort.label")}:</span>{" "}
              {(["newest", "oldest"] as const).map((sort) =>
                sort === query.sort ? (
                  <strong key={sort} aria-current="true">
                    {t(`resumatch.sent.sort.${sort}`)}
                  </strong>
                ) : (
                  <a key={sort} href={sentListHref({ ...shown, sort, page: 1 })}>
                    {t(`resumatch.sent.sort.${sort}`)}
                  </a>
                ),
              )}
            </nav>
          </div>

          <p className="rm-app-summary" role="status" aria-live="polite">
            {result.total === 0
              ? t("resumatch.sent.noMatch")
              : filtered
                ? t("resumatch.sent.summaryFiltered", { total: result.total, all: result.workspaceTotal })
                : t("resumatch.sent.summary", { total: result.total })}
          </p>

          {result.total === 0 ? (
            <Alert tone="info">
              {t("resumatch.sent.noMatchBody")} <a href={sentListHref({ ...DEFAULT_SENT_QUERY, sort: query.sort })}>{t("resumatch.sent.filter.clear")}</a>
            </Alert>
          ) : (
            <div className="rm-sent-table-wrap">
              <table className="rm-sent-table" data-testid="sent-table">
                <caption className="sr-only">{t("resumatch.sent.title")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("resumatch.sent.col.company")}</th>
                    <th scope="col">{t("resumatch.sent.col.job")}</th>
                    <th scope="col">{t("resumatch.sent.col.contact")}</th>
                    <th scope="col">{t("resumatch.sent.col.subject")}</th>
                    <th scope="col">{t("resumatch.sent.col.sent")}</th>
                    <th scope="col">{t("resumatch.sent.col.applied")}</th>
                    <th scope="col">{t("resumatch.sent.col.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.id} data-testid="sent-row">
                      <td data-label={t("resumatch.sent.col.company")}>
                        <a
                          href={sentListHref(withSentFilter(shown, { company: row.companyKey }))}
                          title={t("resumatch.sent.filter.byCompany", { company: row.companyName })}
                          data-testid="filter-company"
                        >
                          {row.companyName}
                        </a>
                      </td>
                      <td data-label={t("resumatch.sent.col.job")}>{row.jobTitle ?? "—"}</td>
                      <td data-label={t("resumatch.sent.col.contact")}>
                        <a
                          href={sentListHref(withSentFilter(shown, { contact: row.contactEmailNormalized }))}
                          title={t("resumatch.sent.filter.byContact", { contact: row.contactEmail })}
                          data-testid="filter-contact"
                        >
                          {row.contactName ? (
                            <>
                              {row.contactName}
                              <br />
                              <span className="rm-sent-table__email">{row.contactEmail}</span>
                            </>
                          ) : (
                            row.contactEmail
                          )}
                        </a>
                        {row.additionalRecipients.length > 0 ? (
                          <>
                            {" "}
                            <span
                              className="rm-sent-table__more"
                              title={row.additionalRecipients.join(", ")}
                              data-testid="more-recipients"
                            >
                              {t("resumatch.sent.moreRecipients", { count: String(row.additionalRecipients.length) })}
                              <span className="sr-only">: {row.additionalRecipients.join(", ")}</span>
                            </span>
                          </>
                        ) : null}
                      </td>
                      <td data-label={t("resumatch.sent.col.subject")}>
                        <Link href={`/applications/sent/${encodeURIComponent(row.id)}`} data-testid="open-sent">
                          {row.subject}
                        </Link>
                        <span className="rm-sent-table__id">{row.id}</span>
                      </td>
                      <td data-label={t("resumatch.sent.col.sent")}>
                        <LocalTime iso={(row.sentAt ?? row.attemptedAt).toISOString()} />
                      </td>
                      <td data-label={t("resumatch.sent.col.applied")}>{row.appliedAt ? <LocalTime iso={row.appliedAt.toISOString()} /> : "—"}</td>
                      <td data-label={t("resumatch.sent.col.status")}>
                        <SentStatusBadge status={row.status} delivery={row.deliveryStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.pageCount > 1 ? (
            <nav className="rm-app-pagination" aria-label={t("resumatch.app.list.pagination")}>
              {result.page > 1 ? (
                <a href={sentListHref({ ...shown, page: result.page - 1 })} rel="prev" className="ui-btn ui-btn--secondary ui-btn--sm">
                  {t("resumatch.app.list.prev")}
                </a>
              ) : (
                <span />
              )}
              <span aria-current="page">{t("resumatch.app.list.page", { page: result.page, pages: result.pageCount })}</span>
              {result.page < result.pageCount ? (
                <a href={sentListHref({ ...shown, page: result.page + 1 })} rel="next" className="ui-btn ui-btn--secondary ui-btn--sm">
                  {t("resumatch.app.list.next")}
                </a>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
