import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";
import { TASKSAI_PROJECT_ID } from "@/data/projects";
import { hubSsoLoginScript } from "./hub-sso";

/**
 * ASafariM TasksAI end-user catalog (#742).
 *
 * What exists, and on which targets it may run, is the coverage manifest in
 * ./tasksai-coverage.ts; each slice flips the entries it delivers to
 * "implemented". Slice 3 (this file): authentication and the member's
 * daily-work journey.
 *
 * Prerequisites (internal docs: ventures/tasks-ai/engineering/testora-test-data.md): the synthetic
 * accounts (db:seed:tasksai-identities) and workspaces (tasks-ai test-data
 * setup). Credentials come only from the run target's secrets
 * (TASKSAI_TEST_<ROLE>_EMAIL / _PASSWORD); the workspace slug from the
 * optional TASKSAI_TEST_WORKSPACE (default tasksai-synthetic-main).
 *
 * Fixtures use relative paths, so the run's target decides the origin; the
 * requirement root defaults to Local, so a run with no target never lands on
 * production. Records a run creates carry a unique "[run:<tag>]" title prefix;
 * `tasks-ai test-data prune-runs` removes abandoned ones.
 */
export const tasksaiFR: FunctionalRequirementDefinition = {
  id: TASKSAI_PROJECT_ID,
  projectId: TASKSAI_PROJECT_ID,
  title: "TasksAI · End-user journeys",
  description:
    "End-user scenarios for TasksAI: sign-in, capture and triage, projects, task details, My Work, views, " +
    "dependencies, completion checks, search, Focus, Copilot, imports, automations, analytics and permissions. " +
    "See the coverage manifest for which scenarios are executable and on which targets.",
  baseUrl: process.env.NEXT_PUBLIC_ASAFARIM_TASKSAI_LOCAL_URL || "http://localhost:3013",
};

/* ------------------------------------------------------------------ */
/* Shared snippets                                                    */
/* ------------------------------------------------------------------ */

const WORKSPACE = "const ws = process.env.TASKSAI_TEST_WORKSPACE || 'tasksai-synthetic-main';";

/** Hub SSO as one synthetic role; lands on the workspace's My Work. */
function signInAs(role: "member" | "owner" | "admin" | "guest" | "outsider"): string {
  const upper = role.toUpperCase();
  return hubSsoLoginScript({
    appName: "TasksAI",
    appUrlEnv: ["ASAFARIM_TASKSAI_URL", "NEXT_PUBLIC_ASAFARIM_TASKSAI_URL"],
    defaultAppUrl: "http://localhost:3013",
    callbackPath: "/w/tasksai-synthetic-main/my-work",
    credentials: { emailEnv: `TASKSAI_TEST_${upper}_EMAIL`, passwordEnv: `TASKSAI_TEST_${upper}_PASSWORD` },
  });
}

/** `api(path, init?)` → { status, body }, called from the signed-in page (same-origin session). */
const API_HELPER = `
const api = (path, init) => t.eval(() => fetch(path, Object.assign({ headers: { 'content-type': 'application/json' } }, init || {}))
  .then(r => r.text().then(text => { let body = null; try { body = JSON.parse(text); } catch (e) { body = text; } return { status: r.status, body: body }; })),
  { dependencies: { path, init }, timeout: 30000 });
`;

/** The closest ancestor of a title button that also holds a button labelled `label` (a list row). */
const ROW_HELPER = `
const rowOf = (title, label) => Selector('button').withExactText(title).parent()
  .filter(el => Array.from(el.querySelectorAll('button')).some(b => b.textContent.trim() === label), { label })
  .nth(0);
`;

const WAIT_MY_WORK = [
  "await t.expect(Selector('h1').withText('My Work').with({ timeout: 30000 }).exists).ok('My Work did not render');",
  "for (let i = 0; i < 30 && await Selector('main').withText('Loading…').exists; i++) await t.wait(500);",
].join("\n");

/* ------------------------------------------------------------------ */
/* Suites / fixtures                                                   */
/* ------------------------------------------------------------------ */

export const tasksaiAuthSuite: TestSuiteDefinition = {
  suiteId: "tasksai-auth",
  frId: TASKSAI_PROJECT_ID,
  title: "TasksAI · Authentication",
  description: "Hub SSO redirect and return, invalid sign-in feedback, sign-out.",
};

export const tasksaiDailyWorkSuite: TestSuiteDefinition = {
  suiteId: "tasksai-daily-work",
  frId: TASKSAI_PROJECT_ID,
  title: "TasksAI · Daily work (member)",
  description: "Capture → triage → schedule → completion-check gate → complete → persists.",
};

export const tasksaiAuthFixture: TestFixtureDefinition = {
  fixtureId: "tasksai-auth",
  suiteId: "tasksai-auth",
  title: "TasksAI sign-in and sign-out (read-only)",
  baseUrl: "/",
  commonInput: {},
  // Reads only: no record is created or changed (eligible for remote smoke).
  metadata: { ui: true, tasksai: { slice: 3 } },
};

export const tasksaiDailyWorkFixture: TestFixtureDefinition = {
  fixtureId: "tasksai-daily-work",
  suiteId: "tasksai-daily-work",
  title: "Member daily-work journey",
  baseUrl: "/",
  commonInput: {},
  // Creates and completes a task: never on the deployment (the run route
  // skips destructive fixtures on web targets).
  metadata: { ui: true, destructive: true, tasksai: { slice: 3, role: "member" } },
};

/* ------------------------------------------------------------------ */
/* Cases — authentication                                              */
/* ------------------------------------------------------------------ */

const authCases: TestCaseDefinition[] = [
  {
    caseId: "tasksai-auth-redirect-to-hub",
    fixtureId: "tasksai-auth",
    title: "A protected workspace page redirects through the target's Hub",
    scriptType: "scripted",
    expected: {},
    script: [
      WORKSPACE,
      "const appOrigin = new URL(process.env.TESTORA_TARGET_BASE_URL || 'http://localhost:3013').origin;",
      "const hubOrigin = new URL(process.env.TESTORA_TARGET_HUB_URL || 'http://localhost:3001').origin;",
      "await t.deleteCookies();",
      "await t.navigateTo(appOrigin + '/w/' + ws + '/my-work');",
      "let href = '';",
      "for (let i = 0; i < 30; i++) { href = await t.eval(() => window.location.href); if (href.indexOf('/sign-in') !== -1) break; await t.wait(500); }",
      "const url = new URL(href);",
      "await t.expect(url.origin).eql(hubOrigin, 'expected the target Hub (' + hubOrigin + '), got ' + url.origin);",
      "await t.expect(url.pathname).eql('/sign-in', 'expected Hub /sign-in, got ' + url.pathname);",
      "const callback = url.searchParams.get('callbackUrl') || '';",
      "await t.expect(callback.indexOf(appOrigin + '/w/' + ws + '/my-work') === 0).ok('callbackUrl must return to ' + appOrigin + ', got ' + callback);",
      "",
    ].join("\n"),
  },
  {
    caseId: "tasksai-auth-login-returns",
    fixtureId: "tasksai-auth",
    title: "Signing in returns to the target's TasksAI origin and workspace",
    scriptType: "scripted",
    expected: {},
    script: [
      signInAs("member"),
      WORKSPACE,
      "await t.navigateTo(appOrigin + '/w/' + ws + '/my-work');",
      WAIT_MY_WORK,
      "await t.expect(await t.eval(() => window.location.origin)).eql(appOrigin, 'left the target origin');",
      "await t.expect(Selector('button').withText('Synthetic · Main').exists).ok('expected the synthetic workspace switcher');",
      "",
    ].join("\n"),
  },
  {
    caseId: "tasksai-auth-invalid-sign-in",
    fixtureId: "tasksai-auth",
    title: "A wrong password gets clear feedback and no session",
    scriptType: "scripted",
    expected: {},
    script: [
      "const appOrigin = new URL(process.env.TESTORA_TARGET_BASE_URL || 'http://localhost:3013').origin;",
      "const hubOrigin = new URL(process.env.TESTORA_TARGET_HUB_URL || 'http://localhost:3001').origin;",
      "const email = process.env.TASKSAI_TEST_MEMBER_EMAIL || '';",
      "await t.expect(email.length).gt(0, 'TASKSAI_TEST_MEMBER_EMAIL is not set — add it to the secrets of the target this run uses (Targets page).');",
      "await t.deleteCookies();",
      "await t.navigateTo(hubOrigin + '/sign-in?callbackUrl=' + encodeURIComponent(appOrigin + '/'));",
      "await t.expect(Selector('#identifier').with({ timeout: 30000 }).exists).ok('Hub sign-in form should render');",
      "await t.typeText('#identifier', email, { replace: true });",
      "await t.typeText('#password', 'definitely-not-the-password-' + Date.now(), { replace: true });",
      "await t.click(Selector('button[type=\"submit\"]').filterVisible());",
      "await t.expect(Selector('body').withText('Invalid username/email or password.').with({ timeout: 15000 }).exists).ok('expected Hub to explain the failed sign-in');",
      "await t.expect(await t.eval(() => window.location.origin)).eql(hubOrigin, 'a failed sign-in must not leave Hub');",
      "",
    ].join("\n"),
  },
  {
    caseId: "tasksai-auth-sign-out",
    fixtureId: "tasksai-auth",
    title: "Signing out prevents further protected access",
    scriptType: "scripted",
    expected: {},
    script: [
      signInAs("member"),
      WORKSPACE,
      "await t.navigateTo(appOrigin + '/w/' + ws + '/my-work');",
      WAIT_MY_WORK,
      // Sign out lives in the account menu, a <details> that is closed by default.
      "const signOut = Selector('button').withExactText('Sign out');",
      "if (!(await Selector('details[open]').find('button').withExactText('Sign out').exists)) await t.click(Selector('summary[aria-label=\"Account menu\"]'));",
      "await t.click(signOut);",
      "for (let i = 0; i < 20; i++) { if ((await t.eval(() => window.location.pathname)).indexOf('/w/') === -1) break; await t.wait(500); }",
      "await t.navigateTo(appOrigin + '/w/' + ws + '/my-work');",
      "let href = '';",
      "for (let i = 0; i < 30; i++) { href = await t.eval(() => window.location.href); if (href.indexOf('/sign-in') !== -1) break; await t.wait(500); }",
      "await t.expect(href.indexOf('/sign-in') !== -1).ok('after sign-out a protected page must send you to sign-in, got ' + href);",
      "",
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — daily work (member)                                         */
/* ------------------------------------------------------------------ */

const dailyWorkJourney: TestCaseDefinition = {
  caseId: "tasksai-daily-work-journey",
  fixtureId: "tasksai-daily-work",
  title: "Sign in → capture → triage → schedule today → check gate → complete → persists",
  scriptType: "scripted",
  expected: {},
  script: [
    signInAs("member"),
    WORKSPACE,
    API_HELPER,
    ROW_HELPER,
    "const tag = '[run:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + ']';",
    "const title = tag + ' Daily work capture';",
    "console.log('[testora] TasksAI daily work: ' + title + ' in ' + ws);",
    "",
    "// 1. Capture from My Work.",
    "await t.navigateTo(appOrigin + '/w/' + ws + '/my-work');",
    WAIT_MY_WORK,
    "await t.click(Selector('button').withExactText('Capture task').filterVisible().nth(0));",
    "const dialog = Selector('[role=\"dialog\"]').filterVisible();",
    "await t.typeText(dialog.find('input:not([type=\"hidden\"]):not([type=\"date\"]), textarea').filterVisible().nth(0), title, { replace: true });",
    "await t.click(dialog.find('button[type=\"submit\"]').withExactText('Capture'));",
    "await t.expect(dialog.withText('Captured to your Inbox').with({ timeout: 15000 }).exists).ok('capture was not confirmed');",
    "await t.click(dialog.find('button').withExactText('Close'));",
    "",
    "// 2. It waits in the Inbox, untriaged.",
    "await t.navigateTo(appOrigin + '/w/' + ws + '/inbox');",
    "const inboxRow = rowOf(title, 'Assign to me');",
    "await t.expect(inboxRow.with({ timeout: 30000 }).exists).ok('the captured task should wait in the Inbox');",
    "await t.expect(inboxRow.withText('QUICK CAPTURE').exists).ok('expected the quick-capture badge');",
    "",
    "// 3. Triage: assign to me → it leaves the Inbox.",
    "await t.click(inboxRow.find('button').withExactText('Assign to me'));",
    "await t.expect(Selector('button').withExactText(title).with({ timeout: 15000 }).exists).notOk('the triaged task must leave the Inbox');",
    "",
    "// 4. My Work: no date yet; schedule it for today.",
    "await t.navigateTo(appOrigin + '/w/' + ws + '/my-work');",
    WAIT_MY_WORK,
    "const workRow = rowOf(title, 'Today');",
    "await t.expect(workRow.with({ timeout: 30000 }).exists).ok('the task should be on My Work after triage');",
    "await t.click(workRow.find('button').withExactText('Today'));",
    "let mine = null;",
    "for (let i = 0; i < 20; i++) {",
    "  const res = await api('/api/v1/workspaces/' + ws + '/my-work');",
    "  mine = (res.body && res.body.data || []).find(x => x.title === title) || null;",
    "  if (mine && mine.dueDate) break;",
    "  await t.wait(500);",
    "}",
    "await t.expect(mine).ok('My Work API does not list the task');",
    "const todayLocal = await t.eval(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });",
    "await t.expect(String(mine.dueDate).slice(0, 10)).eql(todayLocal, 'expected due today (' + todayLocal + '), got ' + mine.dueDate);",
    "await t.expect(mine.completedAt).eql(null, 'must not be completed yet');",
    "",
    "// 5. The completion-check gate: the seeded pending-check task can't be completed.",
    "await t.click(Selector('button').withExactText('Synthetic · Completion check pending'));",
    "const panel = Selector('[aria-label=\"Task detail\"]');",
    "await t.expect(panel.withText('testora: synthetic-pending-check').with({ timeout: 15000 }).exists).ok('expected the pending check in the detail panel');",
    "await t.click(panel.find('button').withExactText('Mark complete'));",
    "await t.expect(Selector('[role=\"alert\"]').withText('Blocked by 1 unfinished check').with({ timeout: 15000 }).exists).ok('expected the named blocking check');",
    "await t.click(panel.find('button').withExactText('Close'));",
    "",
    "// 6. Complete our own task from its detail panel.",
    "await t.click(Selector('button').withExactText(title));",
    "await t.expect(panel.find('input, textarea').filterVisible().nth(0).with({ timeout: 15000 }).value).eql(title, 'the detail panel should show the captured task');",
    "await t.click(panel.find('button').withExactText('Mark complete'));",
    "let done = null;",
    "for (let i = 0; i < 20; i++) {",
    "  done = await api('/api/v1/workspaces/' + ws + '/tasks/' + mine.id);",
    "  if (done.status === 200 && done.body && (done.body.completedAt || (done.body.data && done.body.data.completedAt))) break;",
    "  await t.wait(500);",
    "}",
    "const record = done.body && done.body.data ? done.body.data : done.body;",
    "await t.expect(Boolean(record && record.completedAt)).ok('the task should be completed (API status ' + done.status + ')');",
    "",
    "// 7. Persists after a reload: gone from My Work, still completed.",
    "await t.navigateTo(appOrigin + '/w/' + ws + '/my-work');",
    WAIT_MY_WORK,
    "await t.expect(Selector('button').withExactText(title).exists).notOk('a completed task must not stay on My Work');",
    "const after = await api('/api/v1/workspaces/' + ws + '/my-work');",
    "await t.expect((after.body.data || []).some(x => x.title === title)).notOk('My Work API still lists the completed task');",
    "",
  ].join("\n"),
};

export const tasksaiSuites: TestSuiteDefinition[] = [tasksaiAuthSuite, tasksaiDailyWorkSuite];
export const tasksaiFixtures: TestFixtureDefinition[] = [tasksaiAuthFixture, tasksaiDailyWorkFixture];
export const tasksaiCases: TestCaseDefinition[] = [...authCases, dailyWorkJourney];
