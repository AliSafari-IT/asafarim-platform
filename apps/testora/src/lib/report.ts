import type { ReportResultRow } from "@/lib/queries";

export interface ReportSummary {
  total: number;
  passed: number;
  failed: number;
  other: number;
  passRate: number; // 0-100
  totalDurationMs: number;
}

export function summarize(rows: ReportResultRow[]): ReportSummary {
  let passed = 0;
  let failed = 0;
  let totalDurationMs = 0;
  for (const row of rows) {
    if (row.status === "passed") passed += 1;
    else if (row.status === "failed" || row.status === "error") failed += 1;
    totalDurationMs += row.durationMs ?? 0;
  }
  const total = rows.length;
  const other = total - passed - failed;
  const passRate = total === 0 ? 0 : Math.round((passed / total) * 1000) / 10;
  return { total, passed, failed, other, passRate, totalDurationMs };
}

/** DDMMYYYYHHMM, no separators — e.g. 25/06/2026 10:14 → "250620261014". */
export function dateStamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    pad(date.getDate()) +
    pad(date.getMonth() + 1) +
    date.getFullYear() +
    pad(date.getHours()) +
    pad(date.getMinutes())
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusClass(status: string): string {
  if (status === "passed") return "pass";
  if (status === "failed" || status === "error") return "fail";
  return "other";
}

export interface ReportMeta {
  /** ISO timestamp of report generation. */
  generatedAt: string;
  /** Human-readable applied filters, e.g. "Functional requirement: Authentication". */
  filters: string[];
  /** Optional title override. */
  title?: string;
}

interface FixtureGroup {
  fixtureId: string;
  fixtureTitle: string;
  rows: ReportResultRow[];
}
interface SuiteGroup {
  suiteId: string;
  suiteTitle: string;
  fixtures: Map<string, FixtureGroup>;
}
interface FrGroup {
  frId: string;
  frTitle: string;
  suites: Map<string, SuiteGroup>;
}

function group(rows: ReportResultRow[]): FrGroup[] {
  const frs = new Map<string, FrGroup>();
  for (const row of rows) {
    const frKey = row.frId || "(none)";
    let fr = frs.get(frKey);
    if (!fr) {
      fr = { frId: frKey, frTitle: row.frTitle || "Unassigned", suites: new Map() };
      frs.set(frKey, fr);
    }
    const suiteKey = row.suiteId || "(none)";
    let suite = fr.suites.get(suiteKey);
    if (!suite) {
      suite = { suiteId: suiteKey, suiteTitle: row.suiteTitle || "Unassigned", fixtures: new Map() };
      fr.suites.set(suiteKey, suite);
    }
    const fixKey = row.fixtureId || "(none)";
    let fixture = suite.fixtures.get(fixKey);
    if (!fixture) {
      fixture = { fixtureId: fixKey, fixtureTitle: row.fixtureTitle || "Unassigned", rows: [] };
      suite.fixtures.set(fixKey, fixture);
    }
    fixture.rows.push(row);
  }
  return [...frs.values()];
}

function pill(status: string): string {
  return `<span class="pill ${statusClass(status)}">${escapeHtml(status)}</span>`;
}

function rowsTable(rows: ReportResultRow[]): string {
  const body = rows
    .map(
      (r) => `
      <tr>
        <td>${pill(r.status)}</td>
        <td>${escapeHtml(r.caseTitle)}${
          r.runIndex != null ? ` <span class="muted">· run ${r.runIndex + 1}</span>` : ""
        }</td>
        <td class="num">${fmtDuration(r.durationMs)}</td>
        <td class="muted nowrap">${escapeHtml(fmtDateTime(r.createdAt))}</td>
        <td class="err">${r.errorMessage ? escapeHtml(r.errorMessage) : ""}${
          r.screenshot
            ? `<figure class="shot"><img src="${r.screenshot}" alt="Screenshot at failure of ${escapeHtml(
                r.caseTitle,
              )}" /><figcaption>Screenshot at failure</figcaption></figure>`
            : ""
        }</td>
      </tr>`,
    )
    .join("");
  return `<table class="rows">
    <thead><tr><th>Status</th><th>Case</th><th>Duration</th><th>When</th><th>Error</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

export interface ReportBrand {
  host: string;
  productName?: string;
  productLogo?: string;
  companyName?: string;
  companyLogo?: string;
}

function brandCaption(brand: ReportBrand): string {
  const product = brand.productName?.trim();
  const company = brand.companyName?.trim();
  if (product && company) return `${product}, a product of ${company}`;
  if (product) return product;
  if (company) return `A product of ${company}`;
  return "";
}

function brandBlock(brand: ReportBrand): string {
  const logos = [
    brand.productLogo
      ? `<img class="brand-logo product" src="${brand.productLogo}" alt="${escapeHtml(brand.productName || brand.host)}" />`
      : "",
    brand.companyLogo
      ? `<img class="brand-logo company" src="${brand.companyLogo}" alt="${escapeHtml(brand.companyName || "")}" />`
      : "",
  ].join("");
  const caption = brandCaption(brand);
  if (!logos && !caption) return "";
  return `<div class="brand-block">${logos ? `<div class="brand-logos">${logos}</div>` : ""}${
    caption ? `<div class="brand-caption">${escapeHtml(caption)}</div>` : ""
  }</div>`;
}

export function buildHtmlReport(
  rows: ReportResultRow[],
  meta: ReportMeta,
  brands: ReportBrand[] = [],
): string {
  const s = summarize(rows);
  const title = meta.title ?? "E2E Test Report";
  const groups = group(rows);

  // Per-domain product + company branding, shown in the on-screen header AND a
  // fixed print header so it repeats on every page of the printed/PDF document.
  const brandsHtml = brands.map(brandBlock).join("");
  const printHeader = `<div class="print-header"><span class="ph-brands">${brandsHtml}</span><span class="ph-title">${escapeHtml(title)}</span></div>`;

  const filtersBlock =
    meta.filters.length > 0
      ? `<div class="filters">${meta.filters
          .map((f) => `<span class="chip">${escapeHtml(f)}</span>`)
          .join("")}</div>`
      : `<div class="filters"><span class="chip muted-chip">No filters — all results</span></div>`;

  const groupsHtml = groups
    .map((fr) => {
      const suitesHtml = [...fr.suites.values()]
        .map((suite) => {
          const fixturesHtml = [...suite.fixtures.values()]
            .map((fix) => {
              const fs = summarize(fix.rows);
              return `<div class="fixture">
                <div class="fixture-head">
                  <h4>${escapeHtml(fix.fixtureTitle)}</h4>
                  <span class="mini">${fs.passed}/${fs.total} passed</span>
                </div>
                ${rowsTable(fix.rows)}
              </div>`;
            })
            .join("");
          return `<div class="suite"><h3>${escapeHtml(suite.suiteTitle)}</h3>${fixturesHtml}</div>`;
        })
        .join("");
      const frSummary = summarize(
        [...fr.suites.values()].flatMap((su) => [...su.fixtures.values()].flatMap((f) => f.rows)),
      );
      return `<section class="fr">
        <div class="fr-head">
          <h2>${escapeHtml(fr.frTitle)}</h2>
          <span class="mini ${frSummary.failed > 0 ? "mini-fail" : "mini-pass"}">${frSummary.passed}/${frSummary.total} passed</span>
        </div>
        ${suitesHtml}
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: #f6f7fb; --card: #ffffff; --ink: #11182a; --muted: #6b7280;
    --border: #e6e8ef; --accent: #6d4aff; --pass: #16a34a; --fail: #dc2626; --other: #d97706;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; }
  header.report { display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; border-bottom: 3px solid var(--accent); padding-bottom: 16px; margin-bottom: 24px; }
  header.report h1 { margin: 0 0 4px; font-size: 24px; letter-spacing: -0.01em; }
  header.report .sub { color: var(--muted); font-size: 13px; }
  .brand { font-weight: 700; color: var(--accent); white-space: nowrap; }
  .brand-area { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .brand-block { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .brand-logos { display: flex; align-items: center; gap: 12px; }
  .brand-logo { max-height: 44px; max-width: 160px; object-fit: contain; background: #fff; }
  .brand-logo.company { max-height: 34px; opacity: 0.95; }
  .brand-caption { font-size: 12px; color: var(--muted); font-weight: 600; text-align: right; }
  .print-header { display: none; }
  .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 18px; }
  .stat { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
  .stat .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
  .stat .value { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .stat.pass .value { color: var(--pass); } .stat.fail .value { color: var(--fail); }
  .bar { height: 10px; border-radius: 999px; background: #eceef5; overflow: hidden; display: flex; margin-bottom: 22px; }
  .bar > i { display: block; height: 100%; }
  .bar > i.pass { background: var(--pass); } .bar > i.fail { background: var(--fail); } .bar > i.other { background: var(--other); }
  .filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 26px; }
  .chip { background: #efeaff; color: #4326b3; border: 1px solid #ddd2ff; border-radius: 999px;
    padding: 3px 10px; font-size: 12px; font-weight: 600; }
  .chip.muted-chip { background: #f1f2f6; color: var(--muted); border-color: var(--border); font-weight: 500; }
  section.fr { margin-bottom: 30px; }
  .fr-head, .fixture-head { display: flex; align-items: center; gap: 10px; }
  section.fr h2 { font-size: 17px; margin: 0 0 2px; }
  .suite { margin: 14px 0 0 2px; padding-left: 14px; border-left: 2px solid var(--border); }
  .suite h3 { font-size: 14px; color: var(--muted); margin: 12px 0 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  .fixture { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; }
  .fixture-head h4 { margin: 0; font-size: 14px; }
  .mini { font-size: 12px; color: var(--muted); font-weight: 600; }
  .mini-pass { color: var(--pass); } .mini-fail { color: var(--fail); }
  table.rows { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  table.rows th { text-align: left; color: var(--muted); font-weight: 600; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); padding: 6px 8px; }
  table.rows td { border-bottom: 1px solid #f0f1f6; padding: 7px 8px; vertical-align: top; }
  table.rows tr:last-child td { border-bottom: none; }
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.err { color: var(--fail); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
    max-width: 520px; white-space: pre-wrap; word-break: break-word; }
  figure.shot { margin: 8px 0 0; break-inside: avoid; page-break-inside: avoid; }
  figure.shot img { display: block; width: 100%; max-width: 480px; height: auto;
    border: 1px solid #e5e7eb; border-radius: 6px; }
  figure.shot figcaption { margin-top: 3px; font-size: 10px; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.04em; font-family: inherit; }
  .muted { color: var(--muted); } .nowrap { white-space: nowrap; }
  .pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
  .pill.pass { background: #dcfce7; color: #166534; } .pill.fail { background: #fee2e2; color: #991b1b; }
  .pill.other { background: #fef3c7; color: #92400e; }
  footer { margin-top: 40px; color: var(--muted); font-size: 12px; text-align: center; }
  @media (max-width: 720px) { .summary { grid-template-columns: repeat(2, 1fr); } }
  /* Repeat the domain logo(s) on every printed/PDF page. The top @page margin
     reserves a band that the fixed header occupies, so content never overlaps. */
  @media print {
    @page { margin: 24mm 14mm 16mm; }
    body { background: #fff; }
    .print-header {
      position: fixed; top: 0; left: 0; right: 0; height: 16mm;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 3mm 4mm; background: #fff; border-bottom: 2px solid var(--accent);
    }
    .print-header .ph-brands { display: flex; align-items: center; gap: 14px; }
    .print-header .brand-block { flex-direction: row; align-items: center; gap: 8px; }
    .print-header .brand-logos { gap: 8px; }
    .print-header .brand-logo { max-height: 10mm; max-width: 38mm; }
    .print-header .brand-logo.company { max-height: 8mm; }
    .print-header .brand-caption { font-size: 9px; }
    .print-header .ph-title { font-size: 11px; color: var(--muted); font-weight: 600; }
    .fixture, .stat { break-inside: avoid; }
  }
</style>
</head>
<body>
  ${printHeader}
  <div class="wrap">
    <header class="report">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="sub">Generated ${escapeHtml(fmtDateTime(meta.generatedAt))} · ${s.total} result(s)</div>
      </div>
      <div class="brand-area">
        ${brandsHtml || '<span class="brand">e2e-testora</span>'}
      </div>
    </header>

    <div class="summary">
      <div class="stat"><div class="label">Total</div><div class="value">${s.total}</div></div>
      <div class="stat pass"><div class="label">Passed</div><div class="value">${s.passed}</div></div>
      <div class="stat fail"><div class="label">Failed</div><div class="value">${s.failed}</div></div>
      <div class="stat"><div class="label">Pass rate</div><div class="value">${s.passRate}%</div></div>
      <div class="stat"><div class="label">Total time</div><div class="value">${fmtDuration(s.totalDurationMs)}</div></div>
    </div>

    <div class="bar">
      <i class="pass" style="width:${s.total ? (s.passed / s.total) * 100 : 0}%"></i>
      <i class="fail" style="width:${s.total ? (s.failed / s.total) * 100 : 0}%"></i>
      <i class="other" style="width:${s.total ? (s.other / s.total) * 100 : 0}%"></i>
    </div>

    ${filtersBlock}

    ${groupsHtml || '<p class="muted">No results match the current filters.</p>'}

    <footer>Report generated by e2e-testora on ${escapeHtml(fmtDateTime(meta.generatedAt))}.</footer>
  </div>
</body>
</html>`;
}

export function buildJsonReport(rows: ReportResultRow[], meta: ReportMeta): string {
  return JSON.stringify(
    {
      report: meta.title ?? "E2E Test Report",
      source: "e2e-testora",
      generatedAt: meta.generatedAt,
      filters: meta.filters,
      summary: summarize(rows),
      results: rows,
    },
    null,
    2,
  );
}
