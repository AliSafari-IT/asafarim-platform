import type {
  TestCaseDefinition,
  TestFixtureDefinition,
  TestSuiteDefinition,
} from "@/test-engine/types";

/**
 * Shared building blocks for the admin-console test suites of the app under test.
 *
 * The admin area is organised into four chapters (mirroring the app's own
 * sidebar groups in admin-menu.config.ts): Accounts & Billing, Media & Style
 * Assets, System Operations and Platform Configuration. Each chapter is a
 * functional requirement; each admin page is a suite. Pages get an API fixture
 * (driving the role-guarded /admin endpoints directly with `t.request`) and/or
 * a browser smoke fixture proving an admin can open the page.
 *
 * Auth model (see AdminController + admin-users.service): every /admin route is
 * JWT-guarded and requires role ∈ {admin, superadmin}; a plain user/agent gets
 * 403 and an anonymous request gets 401. Some pages are superadmin-only.
 *
 * Logins go through /auth/login (throttled 10/60s). The token is cached on
 * globalThis per spec process, so each API fixture logs in once — but a browser
 * smoke logs in too, so running a whole chapter at once does many logins.
 * Prefer running a single suite/fixture while iterating.
 */

export const API_DEFAULT = "http://localhost:3234/api/v1";

// Injected at the top of every API case: resolves the API root + admin
// credentials, logs in once (cached), and exposes auth* request helpers. The
// `typeof run` guards keep it valid whether or not the case has runs[].
export const ADMIN_HELPERS = [
  "const api = (typeof run !== 'undefined' && run && run.apiUrl) ? run.apiUrl : (process.env.WEBAPP_API_URL || '" +
    API_DEFAULT +
    "');",
  "const ADMIN_EMAIL = process.env.WEBAPP_ADMIN_EMAIL || 'admin@example.com';",
  "async function getToken() {",
  "  const cached = globalThis.__e2eAdminToken;",
  "  if (cached && (Date.now() - cached.at) < 600000) return cached.value;",
  "  let last = 0; let lastBody = '';",
  "  for (let i = 0; i < 4; i++) {",
  "    let login;",
  "    try { login = await t.request.post(api + '/auth/login', { body: { email: ADMIN_EMAIL, password: process.env.WEBAPP_ADMIN_PASSWORD || '' }, timeout: 60000 }); }",
  "    catch (e) { last = 0; lastBody = 'request error: ' + (e && e.message ? e.message : e); await t.wait(3000); continue; }",
  "    last = login.status; try { lastBody = (typeof login.body === 'string' ? login.body : JSON.stringify(login.body)).slice(0, 200); } catch (e) { lastBody = ''; }",
  "    if (login.status === 200) { globalThis.__e2eAdminToken = { value: login.body.accessToken, at: Date.now() }; return login.body.accessToken; }",
  "    if (login.status === 429) { await t.wait(15000); continue; }",
  "    break;",
  "  }",
  // Surface *why* without leaking the secret: which email, whether a password
  // env was loaded (length only), the API base, and the server's own message.
  "  var pwInfo = process.env.WEBAPP_ADMIN_PASSWORD ? ('set, length ' + process.env.WEBAPP_ADMIN_PASSWORD.length) : 'MISSING';",
  "  throw new Error('admin login failed (status ' + last + ') as ' + ADMIN_EMAIL + ' [password: ' + pwInfo + '] against ' + api + '. Server said: ' + lastBody + '. Set WEBAPP_ADMIN_EMAIL + WEBAPP_ADMIN_PASSWORD and ensure the account exists (and restart the dev server after editing .env).');",
  "}",
  "async function authReq(method, path, body) {",
  "  const tok = await getToken();",
  "  const opts = { headers: { Authorization: 'Bearer ' + tok } };",
  "  if (body !== undefined) opts.body = body;",
  "  return t.request[method](api + path, opts);",
  "}",
  "const authGet = (p) => authReq('get', p);",
  "const authPost = (p, b) => authReq('post', p, b === undefined ? {} : b);",
  "const authPut = (p, b) => authReq('put', p, b === undefined ? {} : b);",
  "const authPatch = (p, b) => authReq('patch', p, b === undefined ? {} : b);",
  "const authDelete = (p) => authReq('delete', p);",
  // Plus-address the configured admin email so temp accounts are re-runnable
  // and land in an inbox you control (works with Gmail-style + addressing).
  "function uniqueEmail() { var base = process.env.WEBAPP_ADMIN_EMAIL || 'admin@example.com'; var at = base.indexOf('@'); var local = at > -1 ? base.slice(0, at) : base; var domain = at > -1 ? base.slice(at + 1) : 'example.com'; return local + '+e2e' + Date.now() + '_' + Math.floor(Math.random() * 1e6) + '@' + domain; }",
  "async function createTempUser(role) {",
  "  const email = uniqueEmail();",
  "  const res = await authPost('/admin/users', { email, password: 'TestPass123!', role: role || 'user' });",
  "  if (res.status === 403) throw new Error('Creating users returned 403 — the test account (' + ADMIN_EMAIL + ') is not admin/superadmin.');",
  "  await t.expect(res.status).eql(201, 'expected to create a temp user, got ' + res.status + ': ' + JSON.stringify(res.body));",
  "  return res.body;",
  "}",
  "async function cleanup(userId) { try { await authDelete('/admin/users/' + userId); } catch (e) { /* best-effort */ } }",
  "async function getAdminId() {",
  "  if (globalThis.__e2eAdminId) return globalThis.__e2eAdminId;",
  "  const res = await authGet('/admin/users?limit=1&q=' + encodeURIComponent(ADMIN_EMAIL));",
  "  await t.expect(res.status).eql(200, 'listing users to resolve admin id failed (' + res.status + '). Is the account admin/superadmin?');",
  "  const row = res.body && res.body.data && res.body.data[0];",
  "  if (!row) throw new Error('could not resolve admin user id from /admin/users');",
  "  globalThis.__e2eAdminId = row.id;",
  "  return row.id;",
  "}",
  "",
].join("\n");

/** Compose an API case body: shared helpers + the case-specific logic. */
export function apiScript(body: string): string {
  return ADMIN_HELPERS + body.trim() + "\n";
}

// Hydration-gated browser login as the admin account, reused by every UI smoke.
export const BROWSER_ADMIN_LOGIN = [
  "const ADMIN_EMAIL = process.env.WEBAPP_ADMIN_EMAIL || 'admin@example.com';",
  "const password = process.env.WEBAPP_ADMIN_PASSWORD || '';",
  "async function dismissPrivacyBanner() {",
  "  const acceptAll = Selector('button, a, [role=\"button\"]').withText(/Accept all/i).filterVisible();",
  "  if (await acceptAll.exists) {",
  "    await t.click(acceptAll);",
  "    await t.wait(500);",
  "  }",
  "}",
  "let loggedIn = false;",
  "// One shared admin account logging in across many UI smokes can trip the",
  "// app's /auth/login rate-limit (HTTP 429), and the login page can fail to",
  "// render transiently. Retry the whole flow, backing off long enough between",
  "// attempts (cumulatively ~60s) for the rate-limit window to clear.",
  "for (let attempt = 0; attempt < 3 && !loggedIn; attempt++) {",
  "  if (attempt > 0) await t.wait(20000 + (attempt - 1) * 20000);",
  "  await t.navigateTo('/en/login');",
  "  // Already authenticated from the refresh cookie? Then there's nothing to do.",
  "  if ((await t.eval(() => window.location.pathname)).indexOf('/login') === -1) { loggedIn = true; break; }",
  "  const emailInput = Selector('[data-testid=\"login-email\"]');",
  "  const passwordInput = Selector('[data-testid=\"login-password\"]');",
  "  const submitButton = Selector('[data-testid=\"login-submit\"]');",
  "  // Soft-wait for the form so a transient non-render just triggers a retry.",
  "  let formOk = false;",
  "  try { await t.expect(emailInput.with({ timeout: 25000 }).exists).ok(); formOk = true; } catch (e) { formOk = false; }",
  "  if (!formOk) continue;",
  "  try { await t.expect(submitButton.hasAttribute('disabled')).notOk({ timeout: 30000 }); } catch (e) { /* proceed */ }",
  "  for (let i = 0; i < 4; i++) {",
  "    await t.typeText(emailInput, ADMIN_EMAIL, { replace: true });",
  "    await t.typeText(passwordInput, password, { replace: true });",
  "    if ((await emailInput.value) === ADMIN_EMAIL && (await passwordInput.value) === password) break;",
  "    await t.wait(1000);",
  "  }",
  "  await t.click(submitButton);",
  "  // A successful login establishes the httpOnly refresh cookie and redirects",
  "  // away from /login — that redirect (not the transient localStorage",
  "  // auth_token) is the reliable signal. Staying on /login means a failed/",
  "  // rate-limited attempt, so fall through to the back-off + retry.",
  "  for (let i = 0; i < 25; i++) {",
  "    if ((await t.eval(() => window.location.pathname)).indexOf('/login') === -1) { loggedIn = true; break; }",
  "    await t.wait(1000);",
  "  }",
  "}",
  "var __pwInfo = process.env.WEBAPP_ADMIN_PASSWORD ? ('set, length ' + process.env.WEBAPP_ADMIN_PASSWORD.length) : 'MISSING';",
  "await t.expect(loggedIn).ok('admin login did not complete (still on /login after retries — likely rate-limited) as ' + ADMIN_EMAIL + ' [password: ' + __pwInfo + ']. Set WEBAPP_ADMIN_EMAIL + WEBAPP_ADMIN_PASSWORD and ensure the account exists (and restart the dev server after editing .env).');",
  "await t.wait(2500);",
  "// Dismiss any cookie/privacy banner so later assertions aren't obscured.",
  "await dismissPrivacyBanner();",
  "",
].join("\n");

/**
 * Browser smoke for one admin page: log in as admin, open the page and assert
 * (a) we kept an authenticated session (not bounced to /login), (b) we were not
 * redirected away from the page (proves admin/superadmin access) and (c) the
 * page content rendered — either a caller-supplied literal that survives i18n,
 * or, by default, any admin shell heading/table.
 */
export function uiSmoke(
  path: string,
  literal?: string,
  superadminOnly = false,
): string {
  const contentAssert = literal
    ? "await t.expect(Selector('body').withText(" +
      JSON.stringify(literal) +
      ").with({ timeout: 30000 }).exists).ok('expected to see ' + " +
      JSON.stringify(literal) +
      " + ' on the page');"
    : // Let the client-side data fetch settle (spinner gone) before checking, so
      // a slow load under a heavy run doesn't false-fail. The selector includes
      // <section> + headings because several admin shells (AdminSectionCard,
      // AdminPageShell, empty-states) render content with no <main>/<table>.
      [
        "for (let s = 0; s < 30; s++) { if (!(await Selector('.animate-spin').exists)) break; await t.wait(1000); }",
        "await t.expect(Selector('main, section, h1, h2, h3, table, [role=\"main\"]').with({ timeout: 30000 }).exists).ok('expected the admin page content to render');",
      ].join("\n");
  const redirectHint = superadminOnly
    ? " — this page is superadmin-only, so an admin-but-not-superadmin account is redirected."
    : " — the account is likely not admin/superadmin.";
  return (
    BROWSER_ADMIN_LOGIN +
    [
      "await t.navigateTo('" + path + "');",
      "// This is a fresh load, so AuthContext re-authenticates from the refresh",
      "// cookie (async) before the route guard admits us — poll generously, and",
      "// re-issue the navigation once if a transient guard bounce moved us away.",
      "let landed = false; let pathname = '';",
      "for (let i = 0; i < 30; i++) {",
      "  pathname = await t.eval(() => window.location.pathname);",
      "  if (pathname.indexOf('/login') === -1 && pathname.indexOf('" +
        path +
        "') !== -1) { landed = true; break; }",
      "  if (i === 8 && pathname.indexOf('" +
        path +
        "') === -1) { await t.navigateTo('" +
        path +
        "'); }",
      "  await t.wait(1000);",
      "}",
      "await t.expect(landed).ok('could not open " +
        path +
        " — ended at ' + pathname + '" +
        redirectHint +
        "');",
      "await dismissPrivacyBanner();",
      contentAssert,
      "",
    ].join("\n")
  );
}

/* ------------------------------------------------------------------ */
/* Declarative page → suite/fixture/case builder                      */
/* ------------------------------------------------------------------ */

export interface AdminApiSpec {
  /** GET path, may include a query string, e.g. "/admin/payments?limit=5". */
  path: string;
  /** Path without query for the anonymous-access test; defaults to path sans "?...". */
  base?: string;
  /** Expected body shape: list = {data:[...]}, array = [...], object = anything. */
  shape?: "list" | "array" | "object";
  /** Acceptable statuses for integration endpoints that may be unconfigured locally. */
  tolerant?: number[];
  /** Override the body assertion entirely with a custom JS snippet. */
  assertBody?: string;
  /** Public endpoint: fetched with NO auth (200 expected), and no guard case. */
  public?: boolean;
  /** Extra hand-written cases for this fixture (CRUD lifecycles, validation, …). */
  extraCases?: (fixtureId: string) => TestCaseDefinition[];
}

export interface AdminPageSpec {
  /** Stable slug; becomes the suite id `admin-<id>` and case-id prefix. */
  id: string;
  title: string;
  /** Localised page path, e.g. "/en/admin/payments". */
  uiPath: string;
  description?: string;
  superadminOnly?: boolean;
  /** Browser smoke: true (default, generic), false (skip), or a literal to assert. */
  ui?: boolean | string;
  api?: AdminApiSpec;
}

/** The standard pair of API cases for a GET endpoint: it works, and it's guarded. */
export function adminGetCases(opts: {
  fixtureId: string;
  idPrefix: string;
  label: string;
  superadminOnly?: boolean;
  spec: AdminApiSpec;
}): TestCaseDefinition[] {
  const { fixtureId, idPrefix, label, superadminOnly, spec } = opts;
  const base = spec.base ?? spec.path.split("?")[0];
  const guardHint = superadminOnly ? " (this endpoint is superadmin-only)" : "";

  const statusAssert = spec.tolerant
    ? "await t.expect(" +
      JSON.stringify(spec.tolerant) +
      ".indexOf(res.status) !== -1).ok('expected " +
      base +
      " to respond with one of " +
      spec.tolerant.join("/") +
      ", got ' + res.status);"
    : "await t.expect(res.status).eql(200, 'expected 200 from " +
      base +
      ", got ' + res.status + ': ' + JSON.stringify(res.body).slice(0, 200));";

  // Skip shape assertions for tolerant endpoints — a tolerated non-200 carries
  // an error body, not the success shape.
  const shapeAssert = spec.tolerant
    ? ""
    : (spec.assertBody ??
      (spec.shape === "list"
        ? "await t.expect(Array.isArray(res.body.data)).ok('expected body.data to be an array');"
        : spec.shape === "array"
          ? "await t.expect(Array.isArray(res.body)).ok('expected an array response');"
          : "await t.expect(res.body !== undefined && res.body !== null).ok('expected a response body');"));

  // Public endpoints: fetch with no auth, expect 200, and skip the guard case.
  if (spec.public) {
    return [
      {
        caseId: `${idPrefix}-returns-data`,
        fixtureId,
        title: `${label} endpoint returns data (public)`,
        scriptType: "scripted",
        expected: {},
        script: apiScript(`
const res = await t.request.get(api + '${spec.path}', { headers: {} });
${statusAssert}
${shapeAssert}
`),
      },
    ];
  }

  return [
    {
      caseId: `${idPrefix}-returns-data`,
      fixtureId,
      title: `${label} endpoint returns data`,
      scriptType: "scripted",
      expected: {},
      script: apiScript(`
const res = await authGet('${spec.path}');
if (res.status === 403) throw new Error('403 from ${base} — the test account lacks access${guardHint}.');
${statusAssert}
${shapeAssert}
`),
    },
    {
      // Kept as "-requires-admin" for id stability across existing seeds.
      caseId: `${idPrefix}-requires-admin`,
      fixtureId,
      title: `${label} endpoint rejects unauthenticated requests`,
      scriptType: "scripted",
      expected: {},
      script: apiScript(`
const res = await t.request.get(api + '${base}', { headers: {} });
await t.expect([401, 403]).contains(res.status, 'expected ${base} to reject anonymous access, got ' + res.status);
`),
    },
  ];
}

/** A single browser-smoke case for a page. */
export function uiSmokeCase(opts: {
  fixtureId: string;
  caseId: string;
  title: string;
  path: string;
  literal?: string;
  superadminOnly?: boolean;
}): TestCaseDefinition {
  return {
    caseId: opts.caseId,
    fixtureId: opts.fixtureId,
    title: opts.title,
    scriptType: "scripted",
    expected: {},
    script: uiSmoke(opts.path, opts.literal, opts.superadminOnly),
  };
}

export interface ChapterBundle {
  suites: TestSuiteDefinition[];
  fixtures: TestFixtureDefinition[];
  cases: TestCaseDefinition[];
}

/**
 * Expand a chapter's page table into suites (one per page), fixtures (an API
 * and/or UI fixture per page) and cases. Pages with rich behaviour can attach
 * `api.extraCases`; everything else gets the standard GET + guard + smoke set.
 */
export function buildChapter(
  frId: string,
  pages: AdminPageSpec[],
  // Suite-id prefix. Defaults to "admin-" for the admin chapters; pass "" (and
  // globally-unique page ids) for non-admin chapters so ids never collide.
  suiteIdPrefix = "admin-",
): ChapterBundle {
  const suites: TestSuiteDefinition[] = [];
  const fixtures: TestFixtureDefinition[] = [];
  const cases: TestCaseDefinition[] = [];

  for (const page of pages) {
    const suiteId = `${suiteIdPrefix}${page.id}`;
    suites.push({
      suiteId,
      frId,
      title: page.title,
      description: page.description ?? `${page.title} admin page.`,
    });

    if (page.api) {
      const fixtureId = `${suiteId}-api`;
      fixtures.push({
        fixtureId,
        suiteId,
        title: `${page.title} API`,
        baseUrl: "/en/login",
        commonInput: {},
      });
      cases.push(
        ...adminGetCases({
          fixtureId,
          idPrefix: page.id,
          label: page.title,
          superadminOnly: page.superadminOnly,
          spec: page.api,
        }),
      );
      if (page.api.extraCases) cases.push(...page.api.extraCases(fixtureId));
    }

    if (page.ui !== false) {
      const fixtureId = `${suiteId}-ui`;
      fixtures.push({
        fixtureId,
        suiteId,
        title: `${page.title} page`,
        baseUrl: page.uiPath,
        commonInput: {},
        // Browser page-load smoke (launches Chrome + logs in). Skipped in an
        // "All requirements" run unless UI smokes are explicitly included.
        metadata: { ui: true },
      });
      cases.push(
        uiSmokeCase({
          fixtureId,
          caseId: `${page.id}-page-loads`,
          title: `Admin can open the ${page.title} page`,
          path: page.uiPath,
          literal: typeof page.ui === "string" ? page.ui : undefined,
          superadminOnly: page.superadminOnly,
        }),
      );
    }
  }

  return { suites, fixtures, cases };
}
