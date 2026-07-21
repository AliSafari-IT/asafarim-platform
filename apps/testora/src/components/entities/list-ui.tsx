"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Globe, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type AggregateResult,
  domainLabel,
  formatStamp,
  isLocalDomain,
} from "@/lib/run-status";

export type StatusFilter = "all" | "passed" | "failed" | "mixed" | "none";

export function matchesStatus(result: AggregateResult | null, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "none") return result === null;
  return result?.status === filter;
}

/** Pass / fail / mixed pill + the last-run timestamp, or "not run". */
export function ResultBadge({ result }: { result: AggregateResult | null }) {
  if (!result) return <span className="text-xs text-muted-foreground">not run</span>;
  const variant =
    result.status === "passed" ? "success" : result.status === "failed" ? "destructive" : "muted";
  return (
    <span className="inline-flex items-center gap-1.5" title={`Last run ${formatStamp(result.at)} UTC`}>
      <Badge variant={variant}>{result.status}</Badge>
      <span className="hidden text-xs text-muted-foreground sm:inline">{formatStamp(result.at)}</span>
    </span>
  );
}

/** The deployment a result ran against (Local muted, web amber). */
export function DomainBadge({ baseUrl }: { baseUrl: string | null | undefined }) {
  const label = domainLabel(baseUrl);
  if (!label) return null;
  const web = !isLocalDomain(baseUrl);
  return (
    <span
      title={baseUrl ?? undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        web
          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      <Globe className="h-3 w-3" />
      {label}
    </span>
  );
}

export function ListToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  shown,
  total,
  placeholder,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  status: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  shown: number;
  total: number;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-md border border-border bg-muted pl-9 pr-3 text-sm"
        />
      </div>
      <select
        value={status}
        onChange={(event) => onStatusChange(event.target.value as StatusFilter)}
        className="h-9 rounded-md border border-border bg-muted px-3 text-sm"
      >
        <option value="all">All statuses</option>
        <option value="passed">Passed</option>
        <option value="failed">Failed</option>
        <option value="mixed">Mixed</option>
        <option value="none">Not run</option>
      </select>
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {shown} / {total}
      </span>
    </div>
  );
}

/** One row of the list view: title + meta on the left, result/domain badges and
 *  actions on the right. Stacks on mobile, single row from lg up. */
export function EntityRow({
  title,
  href,
  meta,
  typeBadge,
  result,
  actions,
}: {
  title: string;
  href?: string;
  meta: ReactNode;
  typeBadge?: ReactNode;
  result: AggregateResult | null;
  actions: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 lg:flex-row lg:items-center lg:gap-4">
      <div className="min-w-0 lg:flex-1">
        <div className="flex items-center gap-2">
          {href ? (
            <Link href={href} className="truncate font-medium hover:underline">
              {title}
            </Link>
          ) : (
            <span className="truncate font-medium">{title}</span>
          )}
          {typeBadge}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
        <ResultBadge result={result} />
        {result && <DomainBadge baseUrl={result.targetBaseUrl} />}
      </div>
      <div className="flex items-center gap-1.5 lg:shrink-0 lg:justify-end">{actions}</div>
    </div>
  );
}
