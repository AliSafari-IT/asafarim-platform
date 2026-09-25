"use client";

import { useMemo, useState, type FormEvent } from "react";
import styles from "./launch-console.module.css";

export interface LaunchConsoleApp {
  key: string;
  name: string;
  glyph: string;
  description: string;
  meta: string;
  href: string;
}

/**
 * Command-palette style launcher on the Hub home: type to filter the apps
 * you can open, Enter opens the top match. Everything here is real — the
 * list comes from the platform app registry, not placeholder data.
 */
export function LaunchConsole({
  apps,
  allAppsHref,
}: {
  apps: LaunchConsoleApp[];
  allAppsHref?: string;
}) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((app) =>
      `${app.name} ${app.description} ${app.meta}`.toLowerCase().includes(q)
    );
  }, [apps, query]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (matches[0]) window.location.href = matches[0].href;
  }

  return (
    <div className={styles.console}>
      <div className={styles.bar}>
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className={styles.title}>Launch console</span>
        <span className={styles.status}>{apps.length} apps online</span>
      </div>

      <form className={styles.prompt} onSubmit={onSubmit} role="search">
        <span className={styles.spark} aria-hidden="true">
          ✦
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Where to? Try “video”, “tests” or “admin”…"
          aria-label="Filter apps"
          className={styles.input}
          autoComplete="off"
        />
        <kbd className={styles.kbd}>↵</kbd>
      </form>

      <ul className={styles.list} aria-live="polite">
        {matches.slice(0, 6).map((app, i) => (
          <li key={app.key}>
            <a
              href={app.href}
              className={`${styles.item}${i === 0 && query ? ` ${styles.itemTop}` : ""}`}
            >
              <span className={styles.glyph} aria-hidden="true">
                {app.glyph}
              </span>
              <span className={styles.text}>
                <span className={styles.name}>{app.name}</span>
                <span className={styles.desc}>{app.description}</span>
              </span>
              <span className={styles.meta}>{app.meta}</span>
            </a>
          </li>
        ))}
        {matches.length === 0 && (
          <li className={styles.empty}>No app matches “{query}”.</li>
        )}
      </ul>

      {allAppsHref && (
        <a href={allAppsHref} className={styles.footer}>
          Browse all apps <span aria-hidden="true">→</span>
        </a>
      )}
    </div>
  );
}
