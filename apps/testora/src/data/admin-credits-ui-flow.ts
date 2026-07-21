import type {
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";

/**
 * Browser flow for the admin Credits dashboard, mirroring the manual path:
 *
 *   1. (fixture setup) Log in as admin, open /en/admin/users, click "Create
 *      user" and create a role=user account with a unique e2e email. The email
 *      is stashed on globalThis so both cases target the same row.
 *   2. Case 1 — open /en/admin/credits, search the new user, click "+Credits",
 *      enter -2 and submit: the number input is min=1, so the browser blocks the
 *      submit with the native range validation ("Value must be greater than or
 *      equal to 1.") and the modal stays open. No credits are granted.
 *   3. Case 2 — search the user again, read the current balance, grant +3 with
 *      an audit note, then confirm the row's balance rose by exactly 3.
 *
 * The "Assign Credits" modal on the Credits page (AssignCreditsModal) issues an
 * *additive* grant via the working PATCH path, so Case 2 is a true happy path.
 * Destructive: it creates a real (soft-deletable) account and mutates its
 * credits — never run against a web deployment.
 *
 * Auth note: the fixture setup logs in once; the browser session persists across
 * the two cases. So each case navigates *directly* to its target admin page via
 * ensureAuthedAt() and only logs in if the app actually bounces it to /login.
 * (Re-running the full BROWSER_ADMIN_LOGIN here would navigate to /en/login while
 * already authenticated, racing the form against the auto-redirect.)
 *
 * Selectors lean on structural/stable hooks (input[type=number|search], the
 * modal's English "Assign Credits" literal, the row's only <button>) rather than
 * the heavily-i18n'd table copy.
 *
 * The engine runs setupScript as fixture.beforeEach, so each case gets its own
 * fresh user. Both setup and cases reach their page via ensureAuthedAt(), which
 * never navigates to /en/login while already authenticated (that flashes the
 * login form then auto-redirects, racing the form fill).
 */

// Resolve the app origin the same way the wizard flow does, so an absolute
// navigation is never stuck on a previous external domain.
const APP_BASE =
  "const appBase = (typeof run !== 'undefined' && run && run.baseUrl) ? run.baseUrl : (process.env.WEBAPP_BASE_URL || 'http://localhost:3233');";

// Idempotent "be logged in, on this page" helper used by the cases. Navigates
// straight to the target (the setup already authenticated); only if the app
// redirects to /login does it perform the login and retry. Also defines
// dismissPrivacyBanner (normally provided by BROWSER_ADMIN_LOGIN).
const ENSURE_ADMIN_SESSION = [
  "const ADMIN_EMAIL = process.env.WEBAPP_ADMIN_EMAIL || 'admin@example.com';",
  "const password = process.env.WEBAPP_ADMIN_PASSWORD || '';",
  "async function dismissPrivacyBanner() {",
  "  const acceptAll = Selector('button, a, [role=\"button\"]').withText(/Accept all/i).filterVisible();",
  "  if (await acceptAll.exists) { await t.click(acceptAll); await t.wait(500); }",
  "}",
  "const loginEmail = Selector('[data-testid=\"login-email\"]');",
  "async function ensureAuthedAt(path) {",
  "  for (let attempt = 0; attempt < 3; attempt++) {",
  "    await t.navigateTo(appBase + path);",
  "    // Settle: an unauthenticated load redirects to /login asynchronously, so a",
  "    // pathname check alone races the redirect. Wait, then decide on BOTH the",
  "    // pathname and whether the login form is actually present.",
  "    await t.wait(3000);",
  "    const pathname = await t.eval(() => window.location.pathname);",
  "    const loginFormPresent = await loginEmail.exists;",
  "    if (pathname.indexOf('/login') === -1 && !loginFormPresent) {",
  "      await dismissPrivacyBanner();",
  "      return;",
  "    }",
  "    // Genuinely unauthenticated — log in, then loop to re-navigate to `path`.",
  "    const passwordInput = Selector('[data-testid=\"login-password\"]');",
  "    const submitButton = Selector('[data-testid=\"login-submit\"]');",
  "    if (!(await loginEmail.with({ timeout: 25000 }).exists)) { await t.wait(15000); continue; }",
  "    try { await t.expect(submitButton.hasAttribute('disabled')).notOk({ timeout: 30000 }); } catch (e) { /* proceed */ }",
  "    for (let i = 0; i < 4; i++) {",
  "      await t.typeText(loginEmail, ADMIN_EMAIL, { replace: true });",
  "      await t.typeText(passwordInput, password, { replace: true });",
  "      if ((await loginEmail.value) === ADMIN_EMAIL && (await passwordInput.value) === password) break;",
  "      await t.wait(1000);",
  "    }",
  "    await t.click(submitButton);",
  "    for (let i = 0; i < 25; i++) {",
  "      if ((await t.eval(() => window.location.pathname)).indexOf('/login') === -1) break;",
  "      await t.wait(1000);",
  "    }",
  "  }",
  "  // Last resort: surface a clear message instead of a vague selector miss.",
  "  await t.expect((await t.eval(() => window.location.pathname)).indexOf('/login')).eql(-1, 'Could not authenticate as admin to reach ' + path + ' (still on /login after 3 attempts — check WEBAPP_ADMIN_EMAIL/PASSWORD or rate limiting).');",
  "  await dismissPrivacyBanner();",
  "}",
].join("\n");

// Re-find the created user's row in the *users* table (the first table; the
// second is the credit history, which also lists emails). Assumes the search
// box has already narrowed the list to this email.
const FIND_USER_ROW = [
  "const usersTable = Selector('table').nth(0);",
  "const userRow = usersTable.find('tbody tr').withText(email);",
  "await t.expect(userRow.with({ timeout: 20000 }).exists).ok('The user ' + email + ' did not appear in the credits table after searching — did the fixture setup create it?');",
].join("\n");

// Type the email into the Credits page search box and wait for the row.
const SEARCH_FOR_USER = [
  "const searchBox = Selector('input[type=\"search\"]').filterVisible().nth(0);",
  "await t.expect(searchBox.with({ timeout: 30000 }).exists).ok('Expected the credits search box on /en/admin/credits');",
  "await t.typeText(searchBox, email, { replace: true });",
  FIND_USER_ROW,
].join("\n");

const REQUIRE_STASHED_EMAIL = [
  "const email = globalThis.__creditsFlowEmail || '';",
  "await t.expect(email.length).gt(0, 'Fixture setup did not stash a user email — did the create-user setup run?');",
].join("\n");

// ─── Setup: create the user via the Users page UI ────────────────────────────

const CREDITS_UI_SETUP = [
  APP_BASE,
  ENSURE_ADMIN_SESSION,
  "",
  "// Unique, plus-addressed email so the account is re-runnable and lands in a",
  "// mailbox the admin controls.",
  "const base = process.env.WEBAPP_ADMIN_EMAIL || 'admin@example.com';",
  "const at = base.indexOf('@');",
  "const localPart = at > -1 ? base.slice(0, at) : base;",
  "const domain = at > -1 ? base.slice(at + 1) : 'example.com';",
  "const email = localPart + '+e2eui' + Date.now() + '_' + Math.floor(Math.random() * 1e6) + '@' + domain;",
  "globalThis.__creditsFlowEmail = email;",
  "",
  "// Land on the Users page, logging in only if the app bounces us to /login.",
  "await ensureAuthedAt('/en/admin/users');",
  "",
  "// ── Open the Create user form ─────────────────────────────────────────────",
  "const createUserBtn = Selector('button').withText(/create user/i).filterVisible().nth(0);",
  "await t.expect(createUserBtn.with({ timeout: 30000 }).exists).ok('Expected the \"Create user\" button on /en/admin/users');",
  "await t.click(createUserBtn);",
  "",
  "// ── Fill email + password (role defaults to 'user' for the Users surface) ──",
  "const emailInput = Selector('input[type=\"email\"]').filterVisible().nth(0);",
  "const pwInput = Selector('input[type=\"password\"]').filterVisible().nth(0);",
  "await t.expect(emailInput.with({ timeout: 15000 }).exists).ok('Expected the email field in the create-user form');",
  "await t.typeText(emailInput, email, { replace: true });",
  "await t.typeText(pwInput, 'TestPass123!', { replace: true });",
  "// Role select is pre-set to User on the Users page; assert it to honour the",
  "// 'role user' intent without a brittle dropdown interaction. Pass the selector",
  "// property to t.expect (no await) so it re-queries rather than snapshotting.",
  "const roleSelect = Selector('select').filterVisible().nth(0);",
  "if (await roleSelect.exists) await t.expect(roleSelect.value).eql('user', 'Expected the new account role to default to user');",
  "",
  "// ── Submit and confirm creation (the form closes only on success) ─────────",
  "const submitCreate = Selector('button[type=\"submit\"]').withText(/create/i).filterVisible().nth(0);",
  "await t.click(submitCreate);",
  "await t.expect(emailInput.with({ timeout: 20000 }).exists).notOk('The create-user form did not close — creation likely failed (duplicate email or validation error) for ' + email);",
].join("\n");

// ─── Fixture ─────────────────────────────────────────────────────────────────

export const adminCreditsUiFlowFixture: TestFixtureDefinition = {
  fixtureId: "admin-credits-ui-flow",
  suiteId: "admin-credits",
  title: "Credits dashboard flow — create user, reject −2, grant +3",
  baseUrl: "/en/admin/users",
  commonInput: {},
  setupScript: CREDITS_UI_SETUP,
  // Creates a real account and mutates its credits via the browser UI.
  metadata: { ui: true, destructive: true },
};

// ─── Cases ───────────────────────────────────────────────────────────────────

export const adminCreditsUiFlowCases: TestCaseDefinition[] = [
  {
    caseId: "credits-ui-negative-grant-rejected",
    fixtureId: "admin-credits-ui-flow",
    title: "A negative credit grant (−2) is blocked by the min-value validation",
    scriptType: "scripted",
    expected: {},
    script: [
      APP_BASE,
      ENSURE_ADMIN_SESSION,
      REQUIRE_STASHED_EMAIL,
      "await ensureAuthedAt('/en/admin/credits');",
      "",
      "// Find the user, open the Assign Credits modal via the row's +Credits button.",
      SEARCH_FOR_USER,
      "await t.click(userRow.find('button'));",
      "",
      "// Enter -2 in the amount field (min is 1).",
      "const amountInput = Selector('input[type=\"number\"]').filterVisible().nth(0);",
      "await t.expect(amountInput.with({ timeout: 15000 }).exists).ok('Expected the credit amount input in the Assign Credits modal');",
      "await t.typeText(amountInput, '-2', { replace: true });",
      "await t.expect(amountInput.value).eql('-2', 'Expected the amount field to hold -2');",
      "",
      "// Submit — native constraint validation must block it.",
      "const assignBtn = Selector('button[type=\"submit\"]').withText(/assign credits/i).filterVisible().nth(0);",
      "await t.click(assignBtn);",
      "",
      "// Read the input's validity straight from the DOM (locale-independent),",
      "// plus the native message the user sees on an English page.",
      "const validity = await t.eval(() => {",
      "  const el = document.querySelector('input[type=number]');",
      "  if (!el) return null;",
      "  return { msg: el.validationMessage, rangeUnderflow: el.validity.rangeUnderflow, valid: el.validity.valid };",
      "});",
      "await t.expect(validity).notEql(null, 'Could not locate the amount input to read its validity');",
      "await t.expect(validity.valid).eql(false, 'Expected -2 to be an invalid amount');",
      "await t.expect(validity.rangeUnderflow).eql(true, 'Expected a min/rangeUnderflow violation for -2 (min is 1)');",
      "await t.expect(validity.msg.length).gt(0, 'Expected a non-empty native validation message');",
      "await t.expect(/greater than or equal to 1/i.test(validity.msg)).ok('Expected the English min-validation message \"Value must be greater than or equal to 1.\", got: ' + validity.msg);",
      "",
      "// The blocked submit must leave the modal open (no grant happened).",
      "await t.expect(Selector('h3').withText(/assign credits/i).exists).ok('Expected the Assign Credits modal to stay open after the blocked -2 submit');",
    ].join("\n"),
  },
  {
    caseId: "credits-ui-positive-grant-updates-balance",
    fixtureId: "admin-credits-ui-flow",
    title: "Granting +3 with an audit note raises the balance by exactly 3",
    scriptType: "scripted",
    expected: {},
    script: [
      APP_BASE,
      ENSURE_ADMIN_SESSION,
      REQUIRE_STASHED_EMAIL,
      "await ensureAuthedAt('/en/admin/credits');",
      "",
      SEARCH_FOR_USER,
      "",
      "// Read the current balance from the row's (only) bold credits cell.",
      "const beforeText = await userRow.find('td.font-semibold').innerText;",
      "const before = parseInt(String(beforeText || '').replace(/[^0-9-]/g, ''), 10);",
      "await t.expect(Number.isFinite(before)).ok('Could not read the current credit balance, got: ' + beforeText);",
      "",
      "// Open the modal, grant +3 with an audit note.",
      "await t.click(userRow.find('button'));",
      "const amountInput = Selector('input[type=\"number\"]').filterVisible().nth(0);",
      "await t.expect(amountInput.with({ timeout: 15000 }).exists).ok('Expected the credit amount input in the Assign Credits modal');",
      "await t.typeText(amountInput, '3', { replace: true });",
      "const noteInput = Selector('input[placeholder=\"Reason for credit assignment\"]').filterVisible().nth(0);",
      "if (await noteInput.exists) await t.typeText(noteInput, 'e2e UI grant +3', { replace: true });",
      "const assignBtn = Selector('button[type=\"submit\"]').withText(/assign credits/i).filterVisible().nth(0);",
      "await t.click(assignBtn);",
      "",
      "// On success the modal closes and the list re-fetches.",
      "await t.expect(Selector('h3').withText(/assign credits/i).with({ timeout: 20000 }).exists).notOk('Expected the Assign Credits modal to close after a valid +3 grant');",
      "",
      "// Poll the refreshed row until the balance reflects +3.",
      "const expected = before + 3;",
      "let after = before;",
      "for (let i = 0; i < 20; i++) {",
      "  const row = Selector('table').nth(0).find('tbody tr').withText(email);",
      "  if (await row.exists) {",
      "    const txt = await row.find('td.font-semibold').innerText;",
      "    after = parseInt(String(txt || '').replace(/[^0-9-]/g, ''), 10);",
      "    if (after === expected) break;",
      "  }",
      "  await t.wait(1000);",
      "}",
      "await t.expect(after).eql(expected, 'Expected the balance to rise from ' + before + ' to ' + expected + ' after a +3 grant, but the row shows ' + after);",
    ].join("\n"),
  },
];
