"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Badge, Button } from "@asafarim/ui";
import type { CostTimelineResponse, TimelineItemDTO } from "@asafarim/ai-cost-ledger";
import type { ResumatchCostGroup } from "../../lib/costs/read";
import { amountDisplay, coveragePercent, groupLabel } from "../../lib/costs/format";
import { CostItem } from "./CostItem";

/** Thrown with the HTTP status so the caller can word the message. */
class LoadError extends Error {
  constructor(readonly status: number) {
    super(`Could not load AI usage (${status}).`);
  }
}

async function fetchPage(baseQuery: string, extra: Record<string, string>): Promise<CostTimelineResponse> {
  const params = new URLSearchParams(baseQuery);
  params.delete("cursor");
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const response = await fetch(`/api/ai-usage?${params.toString()}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new LoadError(response.status);
  return (await response.json()) as CostTimelineResponse;
}

function LoadMore({ loading, onClick, label }: { loading: boolean; onClick: () => void; label: string }) {
  const { t } = useTranslation();
  return (
    <div className="rm-cost-more">
      <Button type="button" variant="secondary" size="sm" onClick={onClick} disabled={loading} aria-busy={loading}>
        {loading ? t("resumatch.cost.loading") : label}
      </Button>
    </div>
  );
}

/** A paginated run of line items; "Load more" follows the opaque cursor. */
function ItemPager({
  baseQuery,
  extra,
  initial,
  initialCursor,
  label,
}: {
  baseQuery: string;
  extra: Record<string, string>;
  initial: TimelineItemDTO[];
  initialCursor: string | null;
  label: string;
}) {
  const { t, locale } = useTranslation();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPage(baseQuery, { ...extra, cursor });
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(loadErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ol className="rm-cost-items" aria-label={label}>
        {items.map((item) => (
          <CostItem key={item.id} item={item} t={t} locale={locale} />
        ))}
      </ol>
      {error ? (
        <p role="alert" className="rm-cost-error">
          {error}
        </p>
      ) : null}
      {cursor ? <LoadMore loading={loading} onClick={more} label={t("resumatch.cost.loadMore")} /> : null}
    </>
  );
}

export function CostTimelineList({
  baseQuery,
  items,
  nextCursor,
}: {
  baseQuery: string;
  items: TimelineItemDTO[];
  nextCursor: string | null;
}) {
  const { t } = useTranslation();
  return (
    <ItemPager
      baseQuery={baseQuery}
      extra={{}}
      initial={items}
      initialCursor={nextCursor}
      label={t("resumatch.cost.allCallsAria")}
    />
  );
}

function loadErrorMessage(err: unknown, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return err instanceof LoadError ? t("resumatch.cost.loadError", { status: err.status }) : (err as Error).message;
}

function GroupBody({ baseQuery, groupKey, title }: { baseQuery: string; groupKey: string; title: string }) {
  const { t } = useTranslation();
  const [page, setPage] = useState<CostTimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPage(baseQuery, { group: groupKey, limit: "25" })
      .then((result) => alive && setPage(result))
      .catch((err: unknown) => alive && setError(loadErrorMessage(err, t)));
    return () => {
      alive = false;
    };
  }, [baseQuery, groupKey, t]);

  if (error) {
    return (
      <p role="alert" className="rm-cost-error">
        {error}
      </p>
    );
  }
  if (!page) {
    return (
      <p className="rm-cost-loading" aria-live="polite">
        {t("resumatch.cost.loadingCalls")}
      </p>
    );
  }
  return (
    <ItemPager
      baseQuery={baseQuery}
      extra={{ group: groupKey, limit: "25" }}
      initial={page.items}
      initialCursor={page.nextCursor}
      label={t("resumatch.cost.groupCallsAria", { title })}
    />
  );
}

function applicationBadge(group: ResumatchCostGroup, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (group.kind !== "job") return null;
  if (group.deleted) return <Badge tone="neutral">{t("resumatch.cost.badge.jobDeleted")}</Badge>;
  if (!group.application) return <Badge tone="neutral">{t("resumatch.cost.badge.notSaved")}</Badge>;
  const status = t(`resumatch.app.status.${group.application.status}`);
  return <Badge tone="info">{t("resumatch.cost.badge.application", { status })}</Badge>;
}

/**
 * Job/application subtotals. Native <details> gives keyboard and
 * screen-reader disclosure semantics for free; line items load on first
 * open, so a long history costs nothing until someone looks.
 */
export function CostGroupList({ baseQuery, groups }: { baseQuery: string; groups: ResumatchCostGroup[] }) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <ul className="rm-cost-groups">
      {groups.map((group) => {
        const amount = amountDisplay(group.totals.effectiveKnownMicros, "estimated", t, locale);
        const label = groupLabel(group, t);
        const coverage = coveragePercent(group.totals.coverageBasisPoints);
        const calls = group.totals.eventCount;
        const subtotal = group.totals.knownCount === 0 && calls > 0 ? t("resumatch.cost.amount.notTracked") : amount.text;
        return (
          <li key={group.key}>
            <details
              className="rm-cost-group"
              onToggle={(event) => {
                const isOpen = (event.currentTarget as HTMLDetailsElement).open;
                if (isOpen) setOpen((prev) => ({ ...prev, [group.key]: true }));
              }}
            >
              <summary>
                <span className="rm-cost-group__title">
                  <span className="rm-cost-group__chevron" aria-hidden="true" />
                  <strong>{label}</strong>
                  {group.detail ? <span className="rm-cost-group__detail"> · {group.detail}</span> : null}
                </span>
                <span className="rm-cost-group__badges">
                  {applicationBadge(group, t)}
                  {group.totals.unknownCount > 0 ? (
                    <Badge tone="warning">{t("resumatch.cost.badge.notTrackedCount", { count: group.totals.unknownCount })}</Badge>
                  ) : null}
                  {group.totals.coverage === "partial" && group.totals.unknownCount === 0 ? (
                    <Badge tone="neutral">{t("resumatch.cost.badge.partial")}</Badge>
                  ) : null}
                </span>
                <span className="rm-cost-group__count">
                  {t(`resumatch.cost.calls.${calls === 1 ? "one" : "other"}`, { count: calls })}
                  {coverage !== null && coverage < 100 ? ` · ${t("resumatch.cost.priced", { percent: coverage })}` : ""}
                </span>
                <span className="rm-cost-group__amount" aria-label={t("resumatch.cost.subtotalAria", { amount: subtotal })}>
                  {subtotal}
                </span>
              </summary>
              {open[group.key] ? <GroupBody baseQuery={baseQuery} groupKey={group.key} title={label} /> : null}
            </details>
          </li>
        );
      })}
    </ul>
  );
}
