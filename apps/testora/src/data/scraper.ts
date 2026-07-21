import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";

/**
 * Supported listing-site scraping coverage.
 *
 * The app under test routes every supported domain to its own dedicated extractor and a
 * provider strategy (residential proxy, BrightData, Firecrawl, …). Driving the
 * full browser video wizard once per site would be slow and brittle, so these
 * fixtures exercise the scraping layer directly through the backend API using
 * TestCafe's `t.request`:
 *
 *  - `scraper-routing` (fast, deterministic, no network fetch): for each site,
 *    POST /scraper/simulate and assert the URL is mapped to the expected
 *    extractor `source` with a non-empty provider strategy. This is the
 *    efficient per-site regression net — it catches a domain falling out of the
 *    whitelist or being routed to the wrong extractor in well under a second
 *    per site.
 *
 *  - `scraper-live` (real network scrape): for a couple of representative
 *    sources, POST /scraper/test and assert a usable listing comes back (title
 *    + at least one image). This proves the end-to-end scrape actually works,
 *    not just that routing is wired up.
 *
 * Both fixtures authenticate via /auth/login with t.request (the scraper
 * endpoints are JWT-guarded); the password comes from WEBAPP_ADMIN_PASSWORD.
 */

const API_DEFAULT = "http://localhost:3234/api/v1";

// Obtain a bearer token via the API, cached across every run in this spec
// process (globalThis persists between the tests TestCafe runs from one spec).
// /auth/login is throttled at 10/60s, so logging in once per fixture — instead
// of once per run — keeps the whole suite well under the limit; a transient 429
// (e.g. from a prior suite in the same minute) is retried with a short wait.
const LOGIN_SNIPPET = [
  // The chosen target's API base (set by the Run page) wins; fall back to the
  // per-run input, then the local default — otherwise the commonInput apiUrl
  // would pin every run to localhost and ignore the selected target.
  "const api = process.env.WEBAPP_API_URL || run.apiUrl || '" + API_DEFAULT + "';",
  "async function getToken() {",
  "  // JWTs from /auth/login expire in ~15 min. The dev server process is",
  "  // long-lived and globalThis persists across fixture runs, so cache with a",
  "  // TTL well under expiry — otherwise a stale token gets reused and every",
  "  // scrape comes back 401.",
  "  const cached = globalThis.__e2eToken;",
  "  if (cached && (Date.now() - cached.at) < 600000) return cached.value;",
  "  let last = 0;",
  "  for (let i = 0; i < 4; i++) {",
  "    let login;",
  "    try { login = await t.request.post(api + '/auth/login', { body: { email: (process.env.WEBAPP_ADMIN_EMAIL || 'admin@example.com'), password: process.env.WEBAPP_ADMIN_PASSWORD || '' }, timeout: 60000 }); }",
  "    catch (e) { last = 0; await t.wait(3000); continue; }",
  "    last = login.status;",
  "    if (login.status === 200) { globalThis.__e2eToken = { value: login.body.accessToken, at: Date.now() }; return login.body.accessToken; }",
  "    if (login.status === 429) { await t.wait(15000); continue; }",
  "    break;",
  "  }",
  "  throw new Error('login did not succeed (last status ' + last + ')');",
  "}",
  "const token = await getToken();",
].join("\n");

const ROUTING_SCRIPT = [
  LOGIN_SNIPPET,
  "",
  "const sim = await t.request.post(api + '/scraper/simulate', {",
  "  headers: { Authorization: 'Bearer ' + token },",
  "  body: { url: run.url },",
  "});",
  "await t.expect(sim.status).eql(201, 'simulate should return 201 for ' + run.url);",
  "await t.expect(sim.body.source).eql(run.expectedSource, 'expected source ' + run.expectedSource + ' for ' + run.url + ' but got ' + sim.body.source);",
  "await t.expect(sim.body.strategy.length).gt(0, 'expected a non-empty provider strategy for ' + run.expectedSource);",
].join("\n");

const LIVE_SCRIPT = [
  LOGIN_SNIPPET,
  "",
  "// Live scrapes go through a shared headless-browser provider. Running many in",
  "// a batch can transiently exhaust its navigation/session pool (e.g. puppeteer",
  "// 'Page.navigate domain limit reached', protocol errors, 429/503) — these are",
  "// infra back-pressure, not a routing/site failure, so retry with backoff",
  "// before failing. A genuine unsupported-site / hard error fails immediately.",
  "let res; let ok = false; let lastErr = '';",
  "for (let attempt = 0; attempt < 3; attempt++) {",
  "  try {",
  "    res = await t.request.post(api + '/scraper/test', {",
  "      headers: { Authorization: 'Bearer ' + token },",
  "      body: { url: run.url },",
  "      timeout: 150000,",
  "    });",
  "  } catch (e) {",
  "    // t.request throws (rather than resolving with a status) on a network",
  "    // failure or a hard request timeout — treat that the same as a",
  "    // retryable infra error instead of letting it abort the test outright.",
  "    res = undefined;",
  "    lastErr = e && e.message ? String(e.message) : String(e);",
  "    await t.wait(8000);",
  "    continue;",
  "  }",
  "  if (res.status === 201 && res.body && res.body.success) { ok = true; break; }",
  "  lastErr = (res.body && res.body.error) ? String(res.body.error) : ('status ' + res.status);",
  "  if (!/domain limit reached|Protocol error|puppeteer failed|navigation|timeout|ECONN|throttl|rate.?limit|\\b(429|502|503|504)\\b/i.test(lastErr)) break;",
  "  await t.wait(8000);",
  "}",
  "await t.expect(ok).ok('scrape should succeed for ' + run.url + ' (after retries); last error: ' + lastErr);",
  "await t.expect(Boolean(res && res.body && res.body.data)).ok('scrape response should have data for ' + run.url);",
  "await t.expect(typeof res.body.data.title).eql('string', 'scraped listing should have a title');",
  "await t.expect(res.body.data.title.length).gt(0, 'scraped listing title should not be empty');",
  "await t.expect(res.body.data.images.length).gt(0, 'scraped listing should have at least one image');",
].join("\n");

export const listingScrapingFR: FunctionalRequirementDefinition = {
  id: "listing-scraping",
  title: "Listing site scraping",
  description:
    "Each supported real-estate domain routes to its own extractor and a working provider strategy.",
  baseUrl: process.env.WEBAPP_BASE_URL || "http://localhost:3233",
};

export const scraperSitesSuite: TestSuiteDefinition = {
  suiteId: "scraper-sites",
  frId: "listing-scraping",
  title: "Supported listing sites",
  description:
    "Per-site scraping routing and live-scrape smoke coverage via the scraper API.",
};

export const scraperRoutingFixture: TestFixtureDefinition = {
  fixtureId: "scraper-routing",
  suiteId: "scraper-sites",
  title: "Scraper routing — each site maps to its own extractor",
  // API-only fixture; loads a lightweight page just so TestCafe can start a
  // browser, then does all its work via t.request.
  baseUrl: "/en/login",
  commonInput: { apiUrl: API_DEFAULT },
};

export const scraperLiveFixture: TestFixtureDefinition = {
  fixtureId: "scraper-live",
  suiteId: "scraper-sites",
  title: "Scraper live smoke — a real scrape returns a usable listing",
  baseUrl: "/en/login",
  commonInput: { apiUrl: API_DEFAULT },
  // Real network scrapes — slow and load-heavy. Skipped in "All requirements"
  // runs unless explicitly included; run it on its own when you want it.
  metadata: { heavy: true },
};

// One representative URL per supported source. The path segments are
// placeholders — /scraper/simulate only inspects the hostname to choose the
// extractor, it does not fetch the page. Expected sources are the values
// the app's getSiteCategory() returns for each host.
const ROUTING_SITES: { url: string; expectedSource: string }[] = [
  {
    url: "https://www.immoweb.be/nl/zoekertje/huis/te-koop/x/1000/1",
    expectedSource: "immoweb",
  },
  { url: "https://www.zimmo.be/nl/x/te-koop/x/L1/", expectedSource: "zimmo" },
  { url: "https://www.immoscoop.be/te-koop/x/1", expectedSource: "immoscoop" },
  { url: "https://www.realo.be/nl/x/1", expectedSource: "realo" },
  { url: "https://www.spotto.be/x/1", expectedSource: "spotto" },
  { url: "https://www.biddit.be/x/1", expectedSource: "biddit" },
  { url: "https://www.immovlan.be/nl/x/1", expectedSource: "immovlan" },
  { url: "https://www.funda.nl/koop/x/1/", expectedSource: "funda" },
  { url: "https://www.pararius.nl/x/1", expectedSource: "pararius" },
  { url: "https://www.huislijn.nl/x/1", expectedSource: "huislijn" },
  { url: "https://www.era.nl/x/1", expectedSource: "era" },
  { url: "https://www.heylenvastgoed.be/nl/x/1", expectedSource: "heylen" },
  { url: "https://www.ikot.be/x/1", expectedSource: "ikot" },
  { url: "https://www.domestic.be/nl/x/1", expectedSource: "domestic" },
  { url: "https://www.swevers.be/x/1", expectedSource: "swevers" },
  { url: "https://www.hillewaere.be/x/1", expectedSource: "hillewaere" },
  { url: "https://immo.notaris.be/nl/x/1", expectedSource: "notaris" },
  { url: "https://www.immotop.lu/x/1", expectedSource: "immotop" },
  { url: "https://www.athome.lu/x/1", expectedSource: "athome" },
];

export const scraperTestCases: TestCaseDefinition[] = [
  {
    caseId: "scraper-routing-per-site",
    fixtureId: "scraper-routing",
    title:
      "simulate routes each supported site to its own extractor + strategy",
    scriptType: "scripted",
    runs: ROUTING_SITES,
    expected: {},
    script: ROUTING_SCRIPT,
  },
  {
    caseId: "scraper-live-smoke",
    fixtureId: "scraper-live",
    title: "a real scrape returns a usable listing (title + images)",
    scriptType: "scripted",
    runs: [
      {
        url: "https://www.zimmo.be/nl/hasselt-3500/te-koop/huis/LPR1B/",
      },
      {
        url: "https://www.immoweb.be/nl/zoekertje/huis/te-koop/houthalen-helchteren/3530/21654774",
      },
      {
        url: "https://www.funda.nl/detail/koop/den-burg/huis-hallerweg-7/89792944/",
      },
      {
        url: "https://immovlan.be/en/detail/residence/for-sale/6470/rance/vbe37748",
      },
      {
        url: "https://www.immoscoop.be/en/for-sale/2960-sint-lenaarts/916365",
      },
      {
        url: "https://www.booking.com/hotel/be/hetklooster.nl.html?aid=397594&label=gog235jc-10CAEoggI46AdIHFgDaBWIAQGYATO4ARfIAQzYAQPoAQH4AQGIAgGoAgG4AorV5tEGwAIB0gIkNTE4YzE3NWYtODA0NS00MzZjLTg3MDQtOTc5MDdkYjA2NzUw2AIB4AIB-Share-aPkX8K0%401782164135&sid=1281df4779b51cf65c4a5298a23a8e45&checkin=2026-08-02&checkout=2026-08-03&dest_id=-1964894&dest_type=city&group_adults=2&group_children=0&no_rooms=1&sb_travel_purpose=0&ucfac=481&"
      },
      {
        url: "https://www.immotop.lu/annonces/1226537/"
      },
      { url: "https://www.athome.lu/location/appartement/lintgen/id-9196026.html" },
      { url: "https://aanbod.vastgoednederland.nl/koopwoningen/tilburg/woning-647665-nieuwstraat-130b" }
    ],
    expected: {},
    script: LIVE_SCRIPT,
  },
];
