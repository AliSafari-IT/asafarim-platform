#!/usr/bin/env node
/**
 * Regenerates apps/showcase/public-data/changelog.json from real git
 * history — replaces the hand-curated CHANGELOG_SEED that used to live in
 * apps/showcase/app/proof/data.ts. Run on every push to main (see
 * .github/workflows/changelog.yml) so the proof board's changelog never
 * needs a manual edit.
 *
 * Only allow-listed fields make it into the committed file: date, commit
 * subject, short SHA, and a GitHub commit URL — nothing else from the
 * commit (author email, full body, etc.).
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const REPO_URL = "https://github.com/AliSafari-IT/asafarim-platform";
const MAX_ENTRIES = 20;
const outPath = path.resolve("apps/showcase/public-data/changelog.json");

const KNOWN_SCOPE_LABELS = {
  edumatch: "EduMatch",
  timelineai: "TimelineAI",
  appbuilder: "AppBuilder",
  ai: "AI",
  ci: "CI",
  db: "DB",
  ui: "UI",
  sso: "SSO",
};

/** "feat(edumatch): learning-brief experience (#135)" -> "EduMatch: learning-brief experience" */
function humanizeTitle(subject) {
  const match = subject.match(/^feat\(([^)]+)\):\s*(.+)$/i);
  if (!match) return subject;
  const [, scope, rest] = match;
  const label = KNOWN_SCOPE_LABELS[scope.toLowerCase()] ?? scope[0].toUpperCase() + scope.slice(1);
  const withoutPrNumber = rest.replace(/\s*\(#\d+\)\s*$/, "").trim();
  return `${label}: ${withoutPrNumber}`;
}

function main() {
  // %x1f (unit separator) between fields, one commit per line, avoids
  // collisions with ":" or "|" that show up in real commit subjects.
  const raw = execSync(
    `git log --grep="^feat" -i --pretty=format:"%h%x1f%ad%x1f%s" --date=short -n ${MAX_ENTRIES}`,
    { encoding: "utf8" }
  );

  const entries = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, date, subject] = line.split("\x1f");
      return { date, title: humanizeTitle(subject), sha, url: `${REPO_URL}/commit/${sha}` };
    });

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n");
  console.log(`Wrote ${entries.length} changelog entries to ${outPath}`);
}

main();
