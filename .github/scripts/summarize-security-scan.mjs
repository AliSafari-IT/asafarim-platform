#!/usr/bin/env node
// Reads the three scanners' raw output from the security-scan workflow,
// writes a human-readable job summary, and enforces the gate: a scanner
// that failed to run (missing/unparseable output) fails the gate exactly
// like a scanner that ran and found something, since a silent skip must
// never look like a clean pass. See .github/workflows/security-scan.yml.

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const resultsDir = process.argv[2];
if (!resultsDir) {
  console.error("usage: summarize-security-scan.mjs <results-dir>");
  process.exit(2);
}

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const lines = [];
let gateFailed = false;

function readExitCode(name) {
  const path = join(resultsDir, `${name}.exitcode`);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8").trim();
  const code = Number.parseInt(raw, 10);
  return Number.isNaN(code) ? null : code;
}

function readJson(name) {
  const path = join(resultsDir, `${name}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

lines.push("## Security scan");
lines.push("");
lines.push(`_Run: ${new Date().toISOString()}_`);
lines.push("");

// --- Semgrep (SAST) --------------------------------------------------
{
  const exitCode = readExitCode("semgrep");
  const report = readJson("semgrep");

  if (exitCode === null || report === null) {
    gateFailed = true;
    lines.push("### ❌ Semgrep (SAST) — scanner did not run");
    lines.push("No parseable output was produced. Treated as a hard failure.");
  } else if (exitCode !== 0 && exitCode !== 1) {
    gateFailed = true;
    lines.push(`### ❌ Semgrep (SAST) — scanner crashed (exit code ${exitCode})`);
  } else {
    const results = Array.isArray(report.results) ? report.results : [];
    const errorFindings = results.filter((r) => r.extra?.severity === "ERROR");
    if (errorFindings.length > 0) {
      gateFailed = true;
      lines.push(`### ❌ Semgrep (SAST) — ${errorFindings.length} ERROR-level finding(s)`);
      lines.push("");
      for (const f of errorFindings.slice(0, 20)) {
        lines.push(`- \`${f.path}:${f.start?.line}\` — ${f.check_id}`);
      }
      if (errorFindings.length > 20) {
        lines.push(`- …and ${errorFindings.length - 20} more`);
      }
    } else {
      lines.push(`### ✅ Semgrep (SAST) — clean (${results.length} lower-severity note(s), no ERROR-level findings)`);
    }
  }
  lines.push("");
}

// --- Gitleaks (secret detection) -------------------------------------
{
  const exitCode = readExitCode("gitleaks");
  const report = readJson("gitleaks");

  if (exitCode === null) {
    gateFailed = true;
    lines.push("### ❌ Gitleaks (secrets) — scanner did not run");
    lines.push("No exit code was captured. Treated as a hard failure.");
  } else if (exitCode !== 0 && exitCode !== 1) {
    gateFailed = true;
    lines.push(`### ❌ Gitleaks (secrets) — scanner crashed (exit code ${exitCode})`);
  } else if (exitCode === 1) {
    gateFailed = true;
    const leaks = Array.isArray(report) ? report : [];
    lines.push(`### ❌ Gitleaks (secrets) — ${leaks.length || "one or more"} leak(s) found`);
    lines.push("");
    for (const l of leaks.slice(0, 20)) {
      lines.push(`- \`${l.File}:${l.StartLine}\` — ${l.RuleID}`);
    }
    if (leaks.length > 20) {
      lines.push(`- …and ${leaks.length - 20} more`);
    }
  } else {
    lines.push("### ✅ Gitleaks (secrets) — clean, no leaks found");
  }
  lines.push("");
}

// --- pnpm audit (dependency CVEs) -------------------------------------
{
  const exitCode = readExitCode("pnpm-audit");
  const report = readJson("pnpm-audit");

  if (exitCode === null || report === null) {
    gateFailed = true;
    lines.push("### ❌ pnpm audit (dependency CVEs) — scanner did not run");
    lines.push("No parseable output was produced. Treated as a hard failure.");
  } else {
    // pnpm audit --json shape: { advisories?: {...} } (npm-classic) or
    // { vulnerabilities: { critical, high, moderate, low, info } } (pnpm-native).
    let critical = 0;
    const bySeverity = report.metadata?.vulnerabilities ?? report.vulnerabilities;
    if (bySeverity && typeof bySeverity.critical === "number") {
      critical = bySeverity.critical;
    } else if (report.advisories) {
      critical = Object.values(report.advisories).filter((a) => a.severity === "critical").length;
    }

    if (critical > 0) {
      gateFailed = true;
      lines.push(`### ❌ pnpm audit (dependency CVEs) — ${critical} critical-severity finding(s)`);
    } else {
      lines.push("### ✅ pnpm audit (dependency CVEs) — no critical-severity findings");
    }
    if (bySeverity) {
      lines.push("");
      lines.push(
        `Breakdown: critical ${bySeverity.critical ?? 0}, high ${bySeverity.high ?? 0}, moderate ${bySeverity.moderate ?? 0}, low ${bySeverity.low ?? 0}, info ${bySeverity.info ?? 0}`
      );
    }
  }
  lines.push("");
}

lines.push(gateFailed ? "**Overall: ❌ gate failed — high-signal findings above.**" : "**Overall: ✅ gate passed.**");

const output = lines.join("\n") + "\n";
if (summaryPath) {
  appendFileSync(summaryPath, output);
} else {
  console.log(output);
}

if (gateFailed) {
  console.error("Security scan gate failed — see job summary for details.");
  process.exit(1);
}
