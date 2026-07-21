import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";
import { apiScript, BROWSER_ADMIN_LOGIN } from "./_admin-shared";

/**
 * User account coverage for the app under test — the self-service profile page and the
 * navbar user-profile dropdown.
 *
 *   /en/profile          — ProfilePage, four tabs (Overview / Profile /
 *                          Security / Privacy), tab driven by the ?tab= query
 *                          so each is deep-linkable.
 *   navbar dropdown      — UserProfileDropdown (button[aria-label="User menu"]):
 *                          My Profile, Settings, Team, Subscription/Billing,
 *                          Admin Area (admin/superadmin only), Privacy Center,
 *                          Logout, plus credits + member-since meta.
 *
 * UI cases log in through the browser (WEBAPP_ADMIN_EMAIL / WEBAPP_ADMIN_PASSWORD
 * — any real account works; the seeded test account is a superadmin, so the
 * Admin Area link is expected). API cases drive the user endpoints with
 * `t.request` and a cached bearer token. See _admin-shared.ts for auth + the
 * /auth/login rate-limit note.
 *
 * Safety: nothing here mutates the real account destructively. The
 * change-password case sends a deliberately WRONG current password, which the
 * backend rejects via bcrypt before any change (users.service changePassword);
 * the updateMe case writes the account's CURRENT name back (idempotent); the
 * coupon case redeems an invalid code (rejected, no credits granted). The
 * account-deletion endpoint is intentionally never exercised.
 */

/** Compose a browser (UI) case body: shared admin login + the case logic. */
function browserScript(body: string): string {
  return BROWSER_ADMIN_LOGIN + body.trim() + "\n";
}

export const profileAccountFR: FunctionalRequirementDefinition = {
  id: "user-account",
  title: "Profile & Account",
  description:
    "Self-service account management: the /profile page with its Overview, Profile, Security and Privacy tabs, and the navbar user-profile dropdown.",
  baseUrl: process.env.WEBAPP_BASE_URL || "http://localhost:3233",
};

/* ------------------------------------------------------------------ */
/* Suites + fixtures                                                  */
/* ------------------------------------------------------------------ */

export const profileTabsSuite: TestSuiteDefinition = {
  suiteId: "profile-tabs",
  frId: "user-account",
  title: "Profile · Page & Tabs",
  description: "The /profile page renders, switches between its four tabs, deep-links by ?tab=, and is gated behind auth.",
};

export const profileApiSuite: TestSuiteDefinition = {
  suiteId: "profile-api",
  frId: "user-account",
  title: "Profile · Account API",
  description: "The /users/me account endpoints behind the profile tabs: read, completion, save, password and coupon.",
};

export const navbarDropdownSuite: TestSuiteDefinition = {
  suiteId: "navbar-user-menu",
  frId: "user-account",
  title: "Navbar · User Dropdown",
  description: "The navbar user-profile dropdown: trigger, menu items, role-gated Admin Area, and navigation.",
};

export const profileTabsFixture: TestFixtureDefinition = {
  fixtureId: "profile-tabs-ui",
  suiteId: "profile-tabs",
  title: "Profile page — load, tab switching, deep-link, auth gate",
  baseUrl: "/en/profile",
  commonInput: {},
  metadata: { ui: true },
};

export const profileApiFixture: TestFixtureDefinition = {
  fixtureId: "profile-api",
  suiteId: "profile-api",
  title: "Account API — me, completion, save, password, coupon",
  baseUrl: "/en/login",
  commonInput: {},
};

export const navbarDropdownFixture: TestFixtureDefinition = {
  fixtureId: "navbar-user-menu-ui",
  suiteId: "navbar-user-menu",
  title: "Navbar dropdown — items, admin link, navigation",
  baseUrl: "/en/dashboard",
  commonInput: {},
  metadata: { ui: true },
};

/* ------------------------------------------------------------------ */
/* Cases — Profile page & tabs (UI)                                   */
/* ------------------------------------------------------------------ */

export const profileTabsCases: TestCaseDefinition[] = [
  {
    caseId: "profile-overview-loads",
    fixtureId: "profile-tabs-ui",
    title: "Profile page loads with header, four tabs and the overview",
    scriptType: "scripted",
    expected: {},
    script: browserScript(`
const profileTab = (label) => Selector('button, a, [role="tab"]').withText(label).filterVisible();
await t.navigateTo('/en/profile');
// Profile is auth-gated; AuthContext rehydrates from the refresh cookie on this
// fresh load (async), so poll for the page to settle rather than bouncing on a
// transient redirect.
let landed = false; let pathname = '';
for (let i = 0; i < 30; i++) {
  pathname = await t.eval(() => window.location.pathname);
  if (pathname.indexOf('/login') === -1 && pathname.indexOf('/profile') !== -1) { landed = true; break; }
  if (i === 8 && pathname.indexOf('/profile') === -1) { await t.navigateTo('/en/profile'); }
  await t.wait(1000);
}
await t.expect(landed).ok('could not open /en/profile — ended at ' + pathname);
await dismissPrivacyBanner();
await t.expect(Selector('body').withText(ADMIN_EMAIL).with({ timeout: 30000 }).exists).ok('profile header should show the account email');
await t.expect(Selector('button[aria-label="Upload avatar"], [data-testid="profile-header-avatar"]').exists).ok('expected the profile header avatar control');
await t.expect(profileTab('Overview').exists).ok('expected the Overview tab');
await t.expect(profileTab('Profile').exists).ok('expected the Profile tab');
await t.expect(profileTab('Security').exists).ok('expected the Security tab');
await t.expect(profileTab('Privacy').exists).ok('expected the Privacy tab');
await t.expect(Selector('body').withText('Account Overview').exists).ok('the Overview tab should show the Account Overview section');
`),
  },
  {
    caseId: "profile-tab-switching",
    fixtureId: "profile-tabs-ui",
    title: "Clicking the tabs reveals each section's content",
    scriptType: "scripted",
    expected: {},
    script: browserScript(`
const profileTab = (label) => Selector('button, a, [role="tab"]').withText(label).filterVisible();
await t.navigateTo('/en/profile');
await dismissPrivacyBanner();
await t.wait(1200);
await t.click(profileTab('Profile'));
await t.expect(Selector('body').withText('Profile Details').with({ timeout: 10000 }).exists).ok('Profile tab should show "Profile Details"');
await t.click(profileTab('Security'));
await t.expect(Selector('body').withText('Change Password').with({ timeout: 10000 }).exists).ok('Security tab should show "Change Password"');
await t.click(profileTab('Privacy'));
await t.expect(Selector('body').withText('Privacy').with({ timeout: 10000 }).exists).ok('Privacy tab content should render');
await t.click(profileTab('Overview'));
await t.expect(Selector('body').withText('Account Overview').with({ timeout: 10000 }).exists).ok('returning to Overview should show "Account Overview"');
`),
  },
  {
    caseId: "profile-tab-deeplink-security",
    fixtureId: "profile-tabs-ui",
    title: "?tab=security deep-links straight to the Security tab",
    scriptType: "scripted",
    expected: {},
    script: browserScript(`
const profileTab = (label) => Selector('button, a, [role="tab"]').withText(label).filterVisible();
await t.navigateTo('/en/profile?tab=security');
await dismissPrivacyBanner();
await t.wait(1500);
await t.expect(profileTab('Security').exists).ok('?tab=security should show the Security tab');
await t.expect(Selector('body').withText('Change Password').with({ timeout: 15000 }).exists).ok('the Security tab content should render');
`),
  },
  {
    caseId: "profile-requires-auth",
    fixtureId: "profile-tabs-ui",
    title: "Visiting /profile without a session redirects to login",
    scriptType: "scripted",
    // No browser login: clear any session and confirm the guard bounces us.
    // The app rehydrates auth from an httpOnly refresh cookie, so clearing
    // localStorage alone leaves the user logged in — we MUST drop cookies too
    // (otherwise this asserts nothing and false-fails).
    expected: {},
    script: `
await t.deleteCookies();
await t.eval(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
await t.navigateTo('/en/profile');
await t.wait(2500);
const pathname = await t.eval(() => window.location.pathname);
await t.expect(pathname).contains('/login', 'an unauthenticated visit to /profile should redirect to /login (got ' + pathname + ')');
`,
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Account API                                                */
/* ------------------------------------------------------------------ */

export const profileApiCases: TestCaseDefinition[] = [
  {
    caseId: "me-returns-current-account",
    fixtureId: "profile-api",
    title: "GET /users/me returns the authenticated account",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await authGet('/users/me');
await t.expect(res.status).eql(200, 'expected 200 from /users/me, got ' + res.status);
await t.expect((res.body.email || '').toLowerCase()).eql(ADMIN_EMAIL.toLowerCase(), '/users/me should return the logged-in account');
`),
  },
  {
    caseId: "me-requires-auth",
    fixtureId: "profile-api",
    title: "GET /users/me without a token is rejected (401/403)",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await t.request.get(api + '/users/me', { headers: {} });
await t.expect([401, 403]).contains(res.status, 'expected /users/me to reject anonymous access, got ' + res.status);
`),
  },
  {
    caseId: "profile-completion-shape",
    fixtureId: "profile-api",
    title: "GET /users/me/profile-completion returns a completion summary",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
const res = await authGet('/users/me/profile-completion');
await t.expect(res.status).eql(200, 'expected 200 from profile-completion, got ' + res.status);
await t.expect(typeof res.body.isComplete).eql('boolean', 'expected isComplete boolean');
await t.expect(Array.isArray(res.body.missingFields)).ok('expected missingFields array');
`),
  },
  {
    caseId: "update-me-saves-name",
    fixtureId: "profile-api",
    title: "PUT /users/me persists a profile save (idempotent)",
    scriptType: "scripted",
    // Writes the account's CURRENT name back, so the save path is exercised
    // without changing anything.
    expected: {},
    script: apiScript(`
const me = await authGet('/users/me');
await t.expect(me.status).eql(200);
const currentName = me.body.name || '';
const upd = await authPut('/users/me', { name: currentName });
await t.expect(upd.status).eql(200, 'PUT /users/me should accept a save, got ' + upd.status + ': ' + JSON.stringify(upd.body));
const after = await authGet('/users/me');
await t.expect(after.body.name || '').eql(currentName, 'the idempotent save should preserve the name');
`),
  },
  {
    caseId: "change-password-rejects-wrong-current",
    fixtureId: "profile-api",
    title: "Change password is rejected when the current password is wrong",
    scriptType: "scripted",
    // Wrong current password → backend rejects before any change (bcrypt check),
    // so this never alters the account.
    expected: {},
    script: apiScript(`
const res = await authPost('/users/change-password', {
  currentPassword: 'definitely-not-the-password-' + Date.now(),
  newPassword: 'E2eNeverApplied123!',
  confirmPassword: 'E2eNeverApplied123!',
});
await t.expect([400, 401, 403]).contains(res.status, 'a wrong current password must be rejected, got ' + res.status + ': ' + JSON.stringify(res.body));
`),
  },
];

/* ------------------------------------------------------------------ */
/* Cases — Navbar user dropdown (UI)                                  */
/* ------------------------------------------------------------------ */

export const navbarDropdownCases: TestCaseDefinition[] = [
  {
    caseId: "user-menu-opens-with-items",
    fixtureId: "navbar-user-menu-ui",
    title: "The user dropdown opens and shows its menu items + meta",
    scriptType: "scripted",
    expected: {},
    script: browserScript(`
await t.navigateTo('/en/dashboard');
await dismissPrivacyBanner();
await t.wait(1500);
const trigger = Selector('button[aria-label="User menu"]');
await t.expect(trigger.with({ timeout: 30000 }).exists).ok('expected the user-menu trigger in the navbar');
await t.click(trigger);
await t.expect(Selector('a[href="/en/profile"]').with({ timeout: 10000 }).exists).ok('expected the "My Profile" item');
await t.expect(Selector('a[href="/en/billing"]').exists).ok('expected the Subscription/Billing item');
await t.expect(Selector('a[href="/en/dashboard/team"]').exists).ok('expected the Team item');
await t.expect(Selector('a[href="/en/profile?tab=privacy"]').exists).ok('expected the Privacy Center item');
await t.expect(Selector('[data-testid="user-dropdown-credits-badge"]').exists).ok('expected the credits badge');
await t.expect(Selector('[data-testid="user-dropdown-member-since"]').exists).ok('expected the member-since meta');
`),
  },
  {
    caseId: "user-menu-shows-admin-area-for-superadmin",
    fixtureId: "navbar-user-menu-ui",
    title: "Admin/superadmin sees the Admin Area link in the dropdown",
    scriptType: "scripted",
    expected: {},
    script: browserScript(`
await t.navigateTo('/en/dashboard');
await dismissPrivacyBanner();
await t.wait(1500);
await t.click(Selector('button[aria-label="User menu"]'));
await t.expect(Selector('a[href="/en/admin"]').with({ timeout: 10000 }).exists).ok('an admin/superadmin account should see the Admin Area link');
`),
  },
  {
    caseId: "user-menu-navigates-to-profile",
    fixtureId: "navbar-user-menu-ui",
    title: "Clicking My Profile navigates to the profile page",
    scriptType: "scripted",
    expected: {},
    script: browserScript(`
await t.navigateTo('/en/dashboard');
await dismissPrivacyBanner();
await t.wait(1500);
await t.click(Selector('button[aria-label="User menu"]'));
const profileLink = Selector('a[href="/en/profile"]');
await t.expect(profileLink.with({ timeout: 10000 }).exists).ok('expected the My Profile link');
await t.click(profileLink);
await t.wait(1500);
const pathname = await t.eval(() => window.location.pathname);
await t.expect(pathname).contains('/profile', 'clicking My Profile should navigate to /profile (got ' + pathname + ')');
`),
  },
];

/* ------------------------------------------------------------------ */
/* Aggregates for the seeder                                          */
/* ------------------------------------------------------------------ */

export const profileAccountSuites: TestSuiteDefinition[] = [
  profileTabsSuite,
  profileApiSuite,
  navbarDropdownSuite,
];

export const profileAccountFixtures: TestFixtureDefinition[] = [
  profileTabsFixture,
  profileApiFixture,
  navbarDropdownFixture,
];

export const profileAccountCases: TestCaseDefinition[] = [
  ...profileTabsCases,
  ...profileApiCases,
  ...navbarDropdownCases,
];
