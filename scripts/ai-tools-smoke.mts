/**
 * Post-deploy smoke test for the AI Workbench (#684). Synthetic data only.
 *
 *   pnpm smoke:ai-tools                          # https://asafarim.com
 *   AI_TOOLS_SMOKE_URL=http://localhost:3200 pnpm smoke:ai-tools
 *   AI_TOOLS_SMOKE_LIVE=1 pnpm smoke:ai-tools    # opt-in: one live run per live tool
 *
 * By default it never spends: it checks pages, robots, the sitemap, the
 * request guards, and runs each tool's catalogue example (always served
 * from the fixture). The opt-in live check sends one short synthetic input
 * per tool whose catalogue says `liveGeneration: true`, and each call is
 * bounded by the server's own cost ceiling and daily budget.
 */
import { actionPlanExampleInput } from "../apps/web/content/tool-fixtures/notes-to-action-plan";
import { testPlanExampleInput } from "../apps/web/content/tool-fixtures/requirements-to-test-plan";
import { timelineExampleInput } from "../apps/web/content/tool-fixtures/text-to-cited-timeline";

const BASE = (process.env.AI_TOOLS_SMOKE_URL ?? "https://asafarim.com").replace(/\/$/, "");
const LIVE = process.env.AI_TOOLS_SMOKE_LIVE === "1";
const origin = new URL(BASE).origin;

const TOOLS = [
  { slug: "requirements-to-test-plan", example: testPlanExampleInput, live: { requirement: "As a visitor I can subscribe to the newsletter with my email address so that I get monthly updates." } },
  { slug: "notes-to-action-plan", example: actionPlanExampleInput, live: { notes: "Team sync\n- Draft the release notes.\n- Review the pricing page copy.\n- Decided: ship after QA sign-off." } },
  { slug: "text-to-cited-timeline", example: timelineExampleInput, live: { text: "The museum opened in 1965. It was extended between 1988 and 1991. A new wing opened in June 2004." } },
];

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures += 1;
};
const run = (slug: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE}/api/tools/${slug}/run`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...headers },
    body: JSON.stringify(body),
  });
const key = (tag: string) => `smoke-${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const tools = await fetch(`${BASE}/tools`);
check(tools.ok, `/tools responds (${tools.status})`);
const robots = await (await fetch(`${BASE}/robots.txt`)).text();
check(/Disallow: \/api\//.test(robots), "robots.txt disallows /api/");
const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
check(!/\/api\/|\/import/.test(sitemap), "sitemap lists no API or import URLs");

for (const tool of TOOLS) {
  const page = await fetch(`${BASE}/tools/${tool.slug}`);
  const html = await page.text();
  check(page.ok && /<h1/.test(html), `/tools/${tool.slug} renders`);
  check(/How it works/.test(html) && /Limitations/.test(html), `/tools/${tool.slug} shows how it works and limitations`);

  const example = await run(tool.slug, { input: tool.example, mode: "example", idempotencyKey: key("ex") });
  const envelope = (await example.json()) as { ok: boolean; mode?: string };
  check(example.ok && envelope.ok && envelope.mode === "fixture", `${tool.slug} example runs from the fixture (no spend)`);
}

const crossSite = await run(TOOLS[0].slug, { input: TOOLS[0].example, mode: "example", idempotencyKey: key("x") }, { origin: "https://example.invalid" });
check(crossSite.status === 403, `cross-site request refused (${crossSite.status})`);
const big = await run(TOOLS[0].slug, { input: { requirement: "x".repeat(70_000) }, mode: "example", idempotencyKey: key("big") });
check(big.status === 413, `oversized body refused (${big.status})`);

if (LIVE) {
  for (const tool of TOOLS) {
    const res = await run(tool.slug, { input: tool.live, mode: "live", idempotencyKey: key("live") });
    const body = (await res.json()) as { ok: boolean; mode?: string; status?: string; error?: { code: string } };
    const detail = body.ok ? `${body.mode} ${body.status}` : body.error?.code;
    check(res.status < 500, `${tool.slug} live run answered without a server error (${res.status} ${detail})`);
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll smoke checks passed.");
process.exit(failures ? 1 : 0);
