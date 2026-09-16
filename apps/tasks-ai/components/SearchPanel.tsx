"use client";

import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, Input } from "@asafarim/ui";
import { api, type SavedSearch, type SearchHit } from "../lib/client/api";

export function SearchPanel({ slug }: { slug: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void api.listSavedSearches(slug).then(setSaved).catch(() => {});
    void api.search(slug, "").then((r) => setRecent((r.recent ?? []).map((x) => x.query))).catch(() => {});
  }, [slug]);

  function run(query: string) {
    setQ(query);
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim()) {
      setHits(null);
      return;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api.search(slug, query.trim());
        setHits(r.hits ?? []);
      } finally {
        setBusy(false);
      }
    }, 250);
  }

  async function save() {
    if (!q.trim()) return;
    const row = await api.createSavedSearch(slug, { name: q.trim().slice(0, 60), query: q.trim() });
    setSaved((s) => [row, ...s]);
  }

  function hitHref(h: SearchHit): string | undefined {
    if (h.type === "task" || h.type === "comment") return undefined; // no deep-link route yet
    if (h.type === "project") return `/w/${slug}/projects`;
    return undefined;
  }

  return (
    <section className="ta-tw">
      <header className="ta-tw__head">
        <div>
          <h1>Search</h1>
          <p className="ta-tw__subtitle">Find any task, project, comment or label across the workspace.</p>
        </div>
      </header>
      <Input
        value={q}
        onChange={(e) => run(e.target.value)}
        placeholder="Search tasks, projects, comments, labels…"
        aria-label="Search"
        autoFocus
      />
      <div className="ta-search__chips">
        {q.trim() && (
          <Button size="sm" variant="secondary" onClick={save}>
            Save this search
          </Button>
        )}
        {recent.slice(0, 6).map((r) => (
          <button key={r} className="ta-chip" onClick={() => run(r)}>
            {r}
          </button>
        ))}
      </div>

      {saved.length > 0 && (
        <>
          <h3>Saved searches</h3>
          <ul className="ta-list">
            {saved.map((s) => (
              <li key={s.id}>
                <button className="ta-list__title" onClick={() => run(s.query)}>
                  {s.name}
                </button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await api.deleteSavedSearch(slug, s.id);
                    setSaved((x) => x.filter((y) => y.id !== s.id));
                  }}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      {busy && <p className="ta-muted">Searching…</p>}
      {hits !== null && !busy && (
        <>
          <h3>{hits.length} result(s)</h3>
          {hits.length === 0 ? (
            <EmptyState
              glyph="[ ? ]"
              title="Nothing matched"
              description={`No tasks, projects, comments or labels matched "${q.trim()}".`}
              action={
                <a className="ta-link" href={`/w/${slug}/my-work`}>
                  Browse My Work instead
                </a>
              }
            />
          ) : (
            <ul className="ta-list">
              {hits.map((h) => (
                <li key={`${h.type}-${h.id}`}>
                  <span className="ta-badge">{h.type}</span>{" "}
                  {hitHref(h) ? (
                    <a href={hitHref(h)}>{h.title}</a>
                  ) : (
                    <span className="ta-list__title">{h.title}</span>
                  )}
                  {h.snippet && <p className="ta-muted">{h.snippet}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
