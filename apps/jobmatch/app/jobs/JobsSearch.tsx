"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card } from "@asafarim/ui";
import type { SearchResult, SearchResultItem } from "../../lib/search/service";

/**
 * The candidate search screen (JM-035).
 *
 * The one design rule that matters here: an ineligible posting is shown,
 * not hidden, with the exact reason it does not fit. That is what makes
 * eligibility "explainable" rather than merely a filter — a candidate who
 * sees "requires sponsorship" has learned something, where a job that
 * silently vanished from the list would have taught them nothing.
 */

const REASON_LABELS: Record<string, string> = {
  REQUIRES_SPONSORSHIP_NOT_OFFERED: "No visa sponsorship",
  LANGUAGE_NOT_MET: "Language requirement",
  CERTIFICATION_NOT_MET: "Certification requirement",
  REMOTE_ONLY_PREFERENCE: "Not remote",
  LOCATION_NOT_MATCHED: "Location",
  BELOW_SALARY_FLOOR: "Below salary floor",
  CONTRACT_TYPE_NOT_WANTED: "Contract type",
};

function formatSalary(item: SearchResultItem): string | null {
  if (item.salaryMin === null && item.salaryMax === null) return null;
  const parts = [item.salaryMin, item.salaryMax].filter((value): value is number => value !== null);
  const range = parts.length === 2 ? `${parts[0].toLocaleString()}–${parts[1].toLocaleString()}` : parts[0].toLocaleString();
  const period = item.salaryPeriod ? `/${item.salaryPeriod}` : "";
  return `${item.salaryCurrency ?? ""} ${range}${period}`.trim();
}

type TrackedJobStatus = "SAVED" | "REJECTED" | "APPLIED";

function ResultCard({
  item,
  initialStatus,
  onStatusChanged,
}: {
  item: SearchResultItem;
  initialStatus: TrackedJobStatus | null;
  onStatusChanged: () => void;
}) {
  const eligible = item.eligibility?.eligible ?? null;
  const salary = formatSalary(item);
  const [status, setStatus] = useState<TrackedJobStatus | null>(initialStatus);
  const [pending, setPending] = useState(false);

  // A new search response can carry the same job with tracking state that
  // changed since it was last rendered (e.g. tracked from another tab, or
  // from the /my-jobs page) — sync local state to what the caller now knows.
  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  const setTrackedStatus = useCallback(
    async (next: TrackedJobStatus) => {
      setPending(true);
      try {
        const response = await fetch("/api/tracking", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobPostingId: item.id, status: next }),
        });
        if (response.ok) {
          setStatus(next);
          onStatusChanged();
        }
      } finally {
        setPending(false);
      }
    },
    [item.id, onStatusChanged],
  );

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>{item.title}</h3>
          <p className="jm-mono" style={{ margin: "0.2rem 0", opacity: 0.8 }}>
            {item.employer}
            {item.locationRaw ? ` · ${item.locationRaw}` : ""}
            {item.isRemote ? " · remote" : ""}
          </p>
        </div>
        {eligible === false ? (
          <Badge tone="warning">not a fit</Badge>
        ) : eligible === true ? (
          <Badge tone="success">eligible</Badge>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "0.5rem 0" }}>
        {item.contractType ? <Badge tone="neutral">{item.contractType}</Badge> : null}
        {salary ? <Badge tone="neutral">{salary}</Badge> : null}
        {item.freshnessLabel ? <Badge tone="warning">{item.freshnessLabel}</Badge> : null}
      </div>

      {item.eligibility && !item.eligibility.eligible ? (
        <ul className="jm-list" style={{ marginTop: "0.5rem" }}>
          {item.eligibility.reasons.map((reason) => (
            <li key={reason.code}>
              <strong>{REASON_LABELS[reason.code] ?? reason.code}:</strong> {reason.message}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="jm-mono" style={{ fontSize: "0.75rem", opacity: 0.65, margin: "0.75rem 0 0.25rem" }}>
        {item.sourceName}
        {item.attributionText ? ` — ${item.attributionText}` : ""}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.6rem", flexWrap: "wrap" }}>
        <a
          href={item.canonicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ui-btn ui-btn--secondary ui-btn--sm"
        >
          View and apply at the source →
        </a>
        <Button
          variant={status === "SAVED" ? "primary" : "secondary"}
          size="sm"
          disabled={pending || status === "APPLIED"}
          onClick={() => void setTrackedStatus("SAVED")}
        >
          {status === "SAVED" ? "Saved" : "Save"}
        </Button>
        <Button
          variant={status === "REJECTED" ? "primary" : "secondary"}
          size="sm"
          disabled={pending || status === "APPLIED"}
          onClick={() => void setTrackedStatus("REJECTED")}
        >
          {status === "REJECTED" ? "Rejected" : "Not interested"}
        </Button>
        <Button
          variant={status === "APPLIED" ? "primary" : "secondary"}
          size="sm"
          disabled={pending || status === "APPLIED"}
          onClick={() => void setTrackedStatus("APPLIED")}
        >
          {status === "APPLIED" ? "Applied" : "Mark applied"}
        </Button>
      </div>
    </Card>
  );
}

export function JobsSearch() {
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState("any");
  const [contractType, setContractType] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [skills, setSkills] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [trackedByPosting, setTrackedByPosting] = useState<Record<string, TrackedJobStatus>>({});
  const requestId = useRef(0);

  const loadTracked = useCallback(async () => {
    try {
      const response = await fetch("/api/tracking");
      if (!response.ok) return;
      const body = (await response.json()) as {
        items: { jobPostingId: string; status: TrackedJobStatus }[];
      };
      setTrackedByPosting(Object.fromEntries(body.items.map((entry) => [entry.jobPostingId, entry.status])));
    } catch {
      // Tracking hydration failing is not a search failure — cards simply
      // render untracked until the next successful fetch.
    }
  }, []);

  useEffect(() => {
    void loadTracked();
  }, [loadTracked]);

  const runSearch = useCallback(async () => {
    const id = ++requestId.current;
    setState("loading");
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (q.trim()) params.set("q", q.trim());
    if (location.trim()) params.set("location", location.trim());
    if (remote !== "any") params.set("remote", remote);
    if (contractType.trim()) params.set("contractType", contractType.trim());
    if (salaryMin.trim()) params.set("salaryMin", salaryMin.trim());
    if (skills.trim()) params.set("skills", skills.trim());

    try {
      const response = await fetch(`/api/jobs?${params.toString()}`);
      // A response for a stale request (the candidate has since typed
      // something new) is discarded rather than rendered — otherwise a slow
      // first keystroke can overwrite a faster later one.
      if (id !== requestId.current) return;
      if (!response.ok) {
        setState("error");
        return;
      }
      setResult((await response.json()) as SearchResult);
      setState("idle");
    } catch {
      if (id === requestId.current) setState("error");
    }
  }, [q, location, remote, contractType, salaryMin, skills, page]);

  useEffect(() => {
    const timer = setTimeout(() => void runSearch(), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, location, remote, contractType, salaryMin, skills, page]);

  const totalPages = result ? Math.max(1, Math.ceil(result.totalCount / result.pageSize)) : 1;

  return (
    <div>
      <Card>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <label className="jm-field" style={{ flex: "2 1 240px" }}>
            <span>Search</span>
            <input
              type="text"
              value={q}
              onChange={(event) => {
                setPage(1);
                setQ(event.target.value);
              }}
              placeholder="Title, employer, or keyword"
              maxLength={200}
            />
          </label>
          <label className="jm-field" style={{ flex: "1 1 160px" }}>
            <span>Location</span>
            <input
              type="text"
              value={location}
              onChange={(event) => {
                setPage(1);
                setLocation(event.target.value);
              }}
              placeholder="City"
              maxLength={120}
            />
          </label>
          <label className="jm-field" style={{ flex: "1 1 140px" }}>
            <span>Working arrangement</span>
            <select
              value={remote}
              onChange={(event) => {
                setPage(1);
                setRemote(event.target.value);
              }}
            >
              <option value="any">Any</option>
              <option value="onsite">On site</option>
              <option value="remote">Remote</option>
            </select>
          </label>
          <label className="jm-field" style={{ flex: "1 1 140px" }}>
            <span>Contract type</span>
            <input
              type="text"
              value={contractType}
              onChange={(event) => {
                setPage(1);
                setContractType(event.target.value);
              }}
              placeholder="e.g. permanent"
              maxLength={60}
            />
          </label>
          <label className="jm-field" style={{ flex: "1 1 140px" }}>
            <span>Minimum salary</span>
            <input
              type="number"
              min={0}
              value={salaryMin}
              onChange={(event) => {
                setPage(1);
                setSalaryMin(event.target.value);
              }}
              placeholder="e.g. 50000"
            />
          </label>
          <label className="jm-field" style={{ flex: "2 1 200px" }}>
            <span>Skills</span>
            <input
              type="text"
              value={skills}
              onChange={(event) => {
                setPage(1);
                setSkills(event.target.value);
              }}
              placeholder="Comma-separated, e.g. TypeScript, React"
              maxLength={400}
            />
          </label>
        </div>
      </Card>

      {result && !result.eligibilityAvailable ? (
        <Alert tone="info">
          <strong>Confirm your profile to see which of these fit.</strong> Without it, every
          result shows as unassessed rather than a guess.
        </Alert>
      ) : null}

      {state === "error" ? (
        <Alert tone="error">Search could not be completed. Check your connection and try again.</Alert>
      ) : null}

      {state === "loading" && !result ? <p className="jm-mono">Searching…</p> : null}

      {result && result.items.length === 0 ? (
        <Alert tone="info">
          No postings match this search. {result.totalCount === 0 && !q && !location ? "There is nothing to search yet — see the sources page for why." : "Try broadening your filters."}
        </Alert>
      ) : null}

      <div style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        {result?.items.map((item) => (
          <ResultCard
            key={item.id}
            item={item}
            initialStatus={trackedByPosting[item.id] ?? null}
            onStatusChanged={loadTracked}
          />
        ))}
      </div>

      {result && totalPages > 1 ? (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.5rem", alignItems: "center" }}>
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span className="jm-mono" style={{ fontSize: "0.8rem" }}>
            page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
