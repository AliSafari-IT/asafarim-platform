"use client";

import { useEffect, useState } from "react";
import { Badge, Button } from "@asafarim/ui";
import type { CostTimelineResponse, TimelineItemDTO } from "@asafarim/ai-cost-ledger";
import type { ResumatchCostGroup } from "../../lib/costs/read";
import { amountDisplay, coveragePercent } from "../../lib/costs/format";
import { CostItem } from "./CostItem";

async function fetchPage(baseQuery: string, extra: Record<string, string>): Promise<CostTimelineResponse> {
  const params = new URLSearchParams(baseQuery);
  params.delete("cursor");
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const response = await fetch(`/api/ai-usage?${params.toString()}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Could not load AI usage (${response.status}).`);
  return (await response.json()) as CostTimelineResponse;
}

function LoadMore({ loading, onClick, label }: { loading: boolean; onClick: () => void; label: string }) {
  return (
    <div className="rm-cost-more">
      <Button type="button" variant="secondary" size="sm" onClick={onClick} disabled={loading} aria-busy={loading}>
        {loading ? "Loading…" : label}
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
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ol className="rm-cost-items" aria-label={label}>
        {items.map((item) => (
          <CostItem key={item.id} item={item} />
        ))}
      </ol>
      {error ? (
        <p role="alert" className="rm-cost-error">
          {error}
        </p>
      ) : null}
      {cursor ? <LoadMore loading={loading} onClick={more} label="Load more calls" /> : null}
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
  return (
    <ItemPager baseQuery={baseQuery} extra={{}} initial={items} initialCursor={nextCursor} label="All AI calls, newest first" />
  );
}

function GroupBody({ baseQuery, groupKey, title }: { baseQuery: string; groupKey: string; title: string }) {
  const [page, setPage] = useState<CostTimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPage(baseQuery, { group: groupKey, limit: "25" })
      .then((result) => alive && setPage(result))
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [baseQuery, groupKey]);

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
        Loading calls…
      </p>
    );
  }
  return (
    <ItemPager
      baseQuery={baseQuery}
      extra={{ group: groupKey, limit: "25" }}
      initial={page.items}
      initialCursor={page.nextCursor}
      label={`AI calls for ${title}`}
    />
  );
}

function applicationBadge(group: ResumatchCostGroup) {
  if (group.kind !== "job") return null;
  if (group.deleted) return <Badge tone="neutral">Job deleted</Badge>;
  if (!group.application) return <Badge tone="neutral">Not saved as an application</Badge>;
  const status = group.application.status.charAt(0) + group.application.status.slice(1).toLowerCase();
  return <Badge tone="info">Application · {status}</Badge>;
}

/**
 * Job/application subtotals. Native <details> gives keyboard and
 * screen-reader disclosure semantics for free; line items load on first
 * open, so a long history costs nothing until someone looks.
 */
export function CostGroupList({ baseQuery, groups }: { baseQuery: string; groups: ResumatchCostGroup[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <ul className="rm-cost-groups">
      {groups.map((group) => {
        const amount = amountDisplay(group.totals.effectiveKnownMicros, "estimated");
        const coverage = coveragePercent(group.totals.coverageBasisPoints);
        const calls = group.totals.eventCount;
        const subtotal = group.totals.knownCount === 0 && calls > 0 ? "Not tracked" : amount.text;
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
                  <strong>{group.label}</strong>
                  {group.detail ? <span className="rm-cost-group__detail"> · {group.detail}</span> : null}
                </span>
                <span className="rm-cost-group__badges">
                  {applicationBadge(group)}
                  {group.totals.unknownCount > 0 ? (
                    <Badge tone="warning">{group.totals.unknownCount} not tracked</Badge>
                  ) : null}
                  {group.totals.coverage === "partial" && group.totals.unknownCount === 0 ? (
                    <Badge tone="neutral">Partially tracked</Badge>
                  ) : null}
                </span>
                <span className="rm-cost-group__count">
                  {calls} {calls === 1 ? "call" : "calls"}
                  {coverage !== null && coverage < 100 ? ` · ${coverage}% priced` : ""}
                </span>
                <span className="rm-cost-group__amount" aria-label={`Subtotal: ${subtotal}`}>
                  {subtotal}
                </span>
              </summary>
              {open[group.key] ? <GroupBody baseQuery={baseQuery} groupKey={group.key} title={group.label} /> : null}
            </details>
          </li>
        );
      })}
    </ul>
  );
}
