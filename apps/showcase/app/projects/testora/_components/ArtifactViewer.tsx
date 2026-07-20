"use client";

import { useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import type { BenchmarkCase } from "../_data/types";
import { fmtDuration } from "./format";
import styles from "./testora.module.css";

type Tab = "screenshot" | "log" | "trace";

interface Step {
  action: string;
  status: "ok" | "fail";
}

/** Deterministic reconstructed steps per scenario (from the spec bodies). */
function stepsFor(c: BenchmarkCase): Step[] {
  switch (c.id) {
    case "auth-trim-email":
      return [
        { action: "goto /?screen=login", status: "ok" },
        { action: 'fill email "user@asafarim.test "', status: "ok" },
        { action: 'fill password "correct-horse"', status: "ok" },
        { action: "click login-submit", status: "ok" },
        { action: "expect session-badge visible", status: "fail" },
      ];
    case "checkout-total-includes-tax":
      return [
        { action: "goto /?screen=checkout", status: "ok" },
        { action: 'expect checkout-total = "$55.00"', status: "fail" },
      ];
    case "dashboard-widget-loads":
      return [
        { action: "attempt 0 · goto /?screen=dashboard&attempt=0", status: "ok" },
        { action: "attempt 0 · click load-widget", status: "ok" },
        { action: "attempt 0 · expect dashboard-widget visible", status: "fail" },
        { action: "attempt 1 · goto /?screen=dashboard&attempt=1", status: "ok" },
        { action: "attempt 1 · expect dashboard-widget visible", status: "ok" },
      ];
    default:
      return [{ action: "goto " + c.id, status: "ok" }];
  }
}

function logFor(
  c: BenchmarkCase,
  t: (key: string, vars?: Record<string, string | number>) => string
): { lines: string[]; failFrom: number } {
  const steps = stepsFor(c);
  const lines = steps.map(
    (s, i) => `${String(i + 1).padStart(2, "0")}  ${s.status === "fail" ? "✗" : "✓"} ${s.action}`,
  );
  const failIdx = steps.findIndex((s) => s.status === "fail");
  if (c.diagnosis) {
    lines.push("");
    lines.push(t("showcase.testora.artifactViewer.logDiagnosis") + ": " + c.diagnosis);
  }
  return { lines, failFrom: failIdx === -1 ? lines.length : failIdx };
}

/** A small, deterministic SVG mock of the failing screen. */
function Screenshot({ c, t }: { c: BenchmarkCase; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const common = { width: "100%", viewBox: "0 0 480 300", role: "img" as const };
  const frame = (
    <>
      <rect x="0" y="0" width="480" height="300" rx="8" fill="var(--surface)" />
      <rect x="0" y="0" width="480" height="28" rx="8" fill="var(--surface-3, #232b36)" />
      <circle cx="16" cy="14" r="4" fill="var(--muted)" />
      <circle cx="30" cy="14" r="4" fill="var(--muted)" />
      <circle cx="44" cy="14" r="4" fill="var(--muted)" />
    </>
  );

  if (c.id === "auth-trim-email") {
    return (
      <svg {...common} className={styles.shot} aria-label={t("showcase.testora.artifactViewer.screenshot.login")}>
        {frame}
        <text x="24" y="64" fontSize="16" fontWeight="700" fill="var(--ink)">Sign in</text>
        <rect x="24" y="84" width="300" height="30" rx="6" fill="var(--surface-2,#171d26)" stroke="var(--line)" />
        <text x="34" y="104" fontSize="12" fill="var(--ink)">user@asafarim.test␠</text>
        <rect x="24" y="124" width="300" height="30" rx="6" fill="var(--surface-2,#171d26)" stroke="var(--line)" />
        <text x="34" y="144" fontSize="12" fill="var(--muted)">••••••••••••</text>
        <rect x="24" y="166" width="88" height="30" rx="6" fill="var(--accent)" />
        <text x="42" y="186" fontSize="12" fontWeight="700" fill="#06231b">Sign in</text>
        <text x="24" y="224" fontSize="13" fontWeight="700" fill="#f87171">✗ Invalid credentials</text>
      </svg>
    );
  }
  if (c.id === "checkout-total-includes-tax") {
    return (
      <svg {...common} className={styles.shot} aria-label={t("showcase.testora.artifactViewer.screenshot.checkout")}>
        {frame}
        <text x="24" y="64" fontSize="16" fontWeight="700" fill="var(--ink)">Checkout</text>
        <text x="24" y="96" fontSize="12" fill="var(--ink)">Split keyboard</text>
        <text x="440" y="96" fontSize="12" textAnchor="end" fill="var(--ink)">$40.00</text>
        <text x="24" y="120" fontSize="12" fill="var(--ink)">USB-C cable</text>
        <text x="440" y="120" fontSize="12" textAnchor="end" fill="var(--ink)">$10.00</text>
        <line x1="24" y1="136" x2="456" y2="136" stroke="var(--line)" />
        <text x="24" y="168" fontSize="15" fontWeight="700" fill="var(--ink)">Total</text>
        <text x="440" y="168" fontSize="15" fontWeight="700" textAnchor="end" fill="#f87171">$50.00</text>
        <text x="440" y="190" fontSize="11" textAnchor="end" fill="var(--muted)">expected $55.00 (tax dropped)</text>
      </svg>
    );
  }
  return (
    <svg {...common} className={styles.shot} aria-label={t("showcase.testora.artifactViewer.screenshot.dashboard")}>
      {frame}
      <text x="24" y="64" fontSize="16" fontWeight="700" fill="var(--ink)">Dashboard</text>
      <rect x="24" y="84" width="100" height="30" rx="6" fill="var(--accent)" />
      <text x="40" y="104" fontSize="12" fontWeight="700" fill="#06231b">Load widget</text>
      <rect x="24" y="130" width="432" height="80" rx="8" fill="var(--surface-2,#171d26)" stroke="var(--line)" strokeDasharray="5 4" />
      <text x="240" y="174" fontSize="12" textAnchor="middle" fill="#f87171">widget did not mount (attempt 0)</text>
    </svg>
  );
}

/**
 * Read-only viewer over the recorded artifacts for the failing/flaky cases.
 * The demo shows a reconstructed screenshot, the execution log, and the trace
 * steps. The real trace/screenshot/video binaries are produced by the harness
 * and uploaded in CI — not hosted in this public demo.
 */
export function ArtifactViewer({ cases }: { cases: BenchmarkCase[] }) {
  const { t } = useTranslation();
  const [caseId, setCaseId] = useState(cases[0]?.id ?? "");
  const [tab, setTab] = useState<Tab>("screenshot");
  const current = cases.find((c) => c.id === caseId) ?? cases[0];
  if (!current) return null;

  const tabs: Array<[Tab, string]> = [
    ["screenshot", t("showcase.testora.artifactViewer.tabScreenshot")],
    ["log", t("showcase.testora.artifactViewer.tabLog")],
    ["trace", t("showcase.testora.artifactViewer.tabTrace")],
  ];
  const log = logFor(current, t);

  return (
    <div className={styles.viewer}>
      <div className={styles.viewerControls}>
        <select
          className={styles.select}
          aria-label={t("showcase.testora.artifactViewer.caseSelect")}
          value={current.id}
          onChange={(e) => setCaseId(e.target.value)}
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.suite} — {c.title}
            </option>
          ))}
        </select>
        <div className={styles.tabs} role="tablist" aria-label={t("showcase.testora.artifactViewer.artifactType")}>
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={styles.tab}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.pane}>
        {tab === "screenshot" ? (
          <>
            <Screenshot c={current} t={t} />
            <p className={styles.paneCaption}>
              {t("showcase.testora.artifactViewer.reconstructed", {
                duration: fmtDuration(current.durationMs),
              })}
            </p>
          </>
        ) : null}

        {tab === "log" ? (
          <pre className={styles.log}>
            {log.lines.map((line, i) => (
              <span key={i} className={i >= log.failFrom ? styles.logFail : undefined}>
                {line}
                {"\n"}
              </span>
            ))}
          </pre>
        ) : null}

        {tab === "trace" ? (
          <ol className={styles.stepList}>
            {stepsFor(current).map((s, i) => (
              <li key={i} className={styles.step}>
                <span className={styles.stepIdx}>{String(i + 1).padStart(2, "0")}</span>
                <span>{s.action}</span>
                <span style={{ color: s.status === "fail" ? "#f87171" : "var(--accent)" }}>
                  {s.status === "fail"
                    ? t("showcase.testora.artifactViewer.stepFail")
                    : t("showcase.testora.artifactViewer.stepOk")}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
