"use client";

import { useEffect, useId, useRef, type FormEvent } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Button } from "@asafarim/ui";
import { APPLICATION_STATUSES, type ApplicationStatusName } from "../../lib/applications/constants";
import { todayInTimeZone } from "../../lib/applications/followUp";
import {
  APPLICATION_DUE_FILTERS,
  APPLICATION_SORTS,
  DEFAULT_APPLICATION_LIST_QUERY,
  SEARCH_MAX_LENGTH,
  applicationListHref,
  hasApplicationFilters,
  normalizeSearch,
  withListChange,
  type ApplicationDueFilter,
  type ApplicationListQuery,
  type ApplicationSort,
} from "../../lib/applications/listQuery";

/** The browser's calendar day: the only "today" a due filter may use
 *  (ventures/resumatch/engineering/follow-up-dates.md). */
const browserToday = () => todayInTimeZone(new Date());

/**
 * Moving to another view of the list is a full document navigation (plain
 * links, `location.assign`), not a client-side one. A row holding a notes
 * or date draft that never reached the server (a failed save waiting for
 * Retry, #895) guards itself with `beforeunload`, which only fires on a
 * document navigation. A client-side page change would unmount that row
 * and drop the draft without asking.
 */
function navigate(href: string) {
  window.location.assign(href);
}

/**
 * Search, status, follow-up and sort controls for /applications (#897).
 * Links and submits navigate the whole document (see `navigate`).
 * Everything lives in the URL, so reload, back/forward and shared links
 * show the same view. Applying any change goes back to page 1.
 *
 * A due filter carries the browser's `today`. When the URL has a due
 * filter but no `today`, or a `today` that is no longer the browser's day
 * (a bookmark, or a tab left open past midnight), this replaces the URL
 * with the current day so the server filters against it.
 */
export function ApplicationListControls({ query }: { query: ApplicationListQuery }) {
  const { t } = useTranslation();
  const hintId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  // Back/forward re-opens the previous document, and the browser may show
  // the fields as they were last edited there rather than as that URL's
  // view. `autoComplete="off"` stops form state restoration; a page served
  // from the back/forward cache is reset here. (Not on mount: that would
  // wipe anything typed before hydration.)
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) formRef.current?.reset();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    if (!query.due) return;
    const sync = () => {
      const today = browserToday();
      if (today !== query.today) window.location.replace(applicationListHref(withListChange(query, { today })));
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [query]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" ? value : "";
    };
    const due = (text("due") || null) as ApplicationDueFilter | null;
    const next = withListChange(query, {
      q: normalizeSearch(text("q")).slice(0, SEARCH_MAX_LENGTH),
      status: (text("status") || null) as ApplicationStatusName | null,
      due,
      today: due ? browserToday() : null,
      sort: (text("sort") || DEFAULT_APPLICATION_LIST_QUERY.sort) as ApplicationSort,
    });
    navigate(applicationListHref(next));
  }

  const changed = hasApplicationFilters(query) || query.sort !== DEFAULT_APPLICATION_LIST_QUERY.sort;

  return (
    // Keyed by the URL's view, so a refresh with a new view resets the fields.
    <form
      ref={formRef}
      key={applicationListHref({ ...query, page: 1, today: null })}
      autoComplete="off"
      role="search"
      className="rm-app-filters"
      aria-label={t("resumatch.app.list.aria")}
      onSubmit={onSubmit}
    >
      <label className="jm-field rm-app-filters__search">
        <span>{t("resumatch.app.list.search")}</span>
        <input
          type="search"
          name="q"
          defaultValue={query.q}
          maxLength={SEARCH_MAX_LENGTH}
          aria-describedby={hintId}
          autoComplete="off"
        />
        <small id={hintId}>{t("resumatch.app.list.searchHint")}</small>
      </label>
      <label className="jm-field">
        <span>{t("resumatch.app.list.status")}</span>
        <select name="status" defaultValue={query.status ?? ""}>
          <option value="">{t("resumatch.app.list.statusAll")}</option>
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`resumatch.app.status.${status}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="jm-field">
        <span>{t("resumatch.app.list.due")}</span>
        <select name="due" defaultValue={query.due ?? ""}>
          <option value="">{t("resumatch.app.list.dueAll")}</option>
          {APPLICATION_DUE_FILTERS.map((due) => (
            <option key={due} value={due}>
              {t(`resumatch.app.followUp.due.${due}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="jm-field">
        <span>{t("resumatch.app.list.sort")}</span>
        <select name="sort" defaultValue={query.sort}>
          {APPLICATION_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {t(`resumatch.app.list.sort.${sort}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="rm-app-filters__actions">
        <Button type="submit" size="sm">
          {t("resumatch.app.list.apply")}
        </Button>
        {changed ? (
          <a href={applicationListHref({ ...DEFAULT_APPLICATION_LIST_QUERY, pageSize: query.pageSize })}>
            {t("resumatch.app.list.reset")}
          </a>
        ) : null}
      </div>
    </form>
  );
}

/** Previous/next links plus the position, all plain links in the URL. */
export function ApplicationPagination({
  query,
  page,
  pageCount,
}: {
  query: ApplicationListQuery;
  page: number;
  pageCount: number;
}) {
  const { t } = useTranslation();
  if (pageCount <= 1) return null;
  const href = (n: number) => applicationListHref({ ...query, page: n });
  return (
    <nav className="rm-app-pagination" aria-label={t("resumatch.app.list.pagination")}>
      {page > 1 ? (
        <a href={href(page - 1)} rel="prev" className="ui-btn ui-btn--secondary ui-btn--sm">
          {t("resumatch.app.list.prev")}
        </a>
      ) : (
        <span />
      )}
      <span aria-current="page">{t("resumatch.app.list.page", { page, pages: pageCount })}</span>
      {page < pageCount ? (
        <a href={href(page + 1)} rel="next" className="ui-btn ui-btn--secondary ui-btn--sm">
          {t("resumatch.app.list.next")}
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}
