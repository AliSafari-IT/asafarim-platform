"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";

/**
 * URL-searchParam-driven filters for the Issues list (status, GitHub open/
 * closed state, fixture/case, free-text search) plus a bulk "refresh GitHub
 * states" action. Filters live in the URL so a filtered view is shareable —
 * the page itself (a server component) reads them back via `searchParams`
 * and applies them to the query.
 */
export function IssuesFilterBar({
  caseOptions,
  publishedIssueIds,
}: {
  caseOptions: ComboboxOption[];
  publishedIssueIds: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get("status") ?? "all";
  const gh = searchParams.get("gh") ?? "all";
  const caseId = searchParams.get("case") ?? "all";

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Skip the debounced push on mount — only fire when the user actually types.
  const mounted = useRef(false);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
  }

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParam("q", q.trim() || null);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const [refreshing, setRefreshing] = useState(false);
  async function refreshAll() {
    setRefreshing(true);
    try {
      await Promise.all(
        publishedIssueIds.map((id) => fetch(`/api/issues/${id}/github-state`).catch(() => null)),
      );
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  function segmented(
    current: string,
    entries: { value: string; label: string }[],
    onPick: (value: string) => void,
  ) {
    return (
      <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1">
        {entries.map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => onPick(entry.value)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              current === entry.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search title or body…"
        className="w-56"
        aria-label="Search issues"
      />

      {segmented(
        status,
        [
          { value: "all", label: "All" },
          { value: "draft", label: "Draft" },
          { value: "published", label: "Published" },
        ],
        (v) => setParam("status", v),
      )}

      {segmented(
        gh,
        [
          { value: "all", label: "Any state" },
          { value: "open", label: "Open" },
          { value: "closed", label: "Closed" },
        ],
        (v) => setParam("gh", v),
      )}

      {caseOptions.length > 0 && (
        <Combobox
          options={[{ value: "all", label: "All fixtures/cases" }, ...caseOptions]}
          value={caseId}
          onChange={(v) => setParam("case", v)}
          triggerClassName="w-64"
        />
      )}

      {publishedIssueIds.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => void refreshAll()}
          disabled={refreshing}
          title="Re-check open/closed state for every published issue from GitHub"
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh GitHub states
        </Button>
      )}
    </div>
  );
}
