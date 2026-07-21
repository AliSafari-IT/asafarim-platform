import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";

/**
 * ASafariM Portal — authentication. The portal (portal.asafarim.com) is the
 * NextAuth SSO hub for every asafarim.com app (content-generator, ops-hub,
 * marketing-content, edumatch, vionto), so its email/password sign-in is the
 * gate the rest depend on.
 *
 * The flow mirrors a real user: open the app, click the navbar "Sign in", land
 * on /sign-in (Password is the default method), enter the admin email/password
 * and submit. Success is proven two ways — the app leaves /sign-in, and a
 * protected page (/profile, which redirects unauthenticated visitors back to
 * /sign-in) is reachable.
 *
 * Credentials come from ASAFARIM_ADMIN_EMAIL / ASAFARIM_ADMIN_PASSWORD (same for
 * dev and prod). Switch dev/prod from the Run page's Target environment — the
 * test content doesn't change, only the origin.
 */

export const asafarimPortalAuthFR: FunctionalRequirementDefinition = {
  id: "asafarim-portal-auth",
  projectId: "asafarim-portal",
  title: "Portal · Authentication",
  description:
    "NextAuth email/password sign-in to the ASafariM portal — the SSO hub for all asafarim.com apps.",
  baseUrl: process.env.ASAFARIM_PORTAL_URL || "https://portal.asafarim.com",
};

export const portalLoginSuite: TestSuiteDefinition = {
  suiteId: "asafarim-portal-login",
  frId: "asafarim-portal-auth",
  title: "Sign in",
  description: "A user signs in with email + password from the portal.",
};

export const portalLoginFixture: TestFixtureDefinition = {
  fixtureId: "asafarim-portal-login-ui",
  suiteId: "asafarim-portal-login",
  title: "Portal email/password sign-in",
  // Start on the home page so the run begins by clicking the navbar Sign in
  // button, exactly like a real visitor.
  baseUrl: "/",
  commonInput: {},
  // The portal is a production Next.js SSR app that emits React hydration
  // warnings (minified error #418/#423) on some pages; those are not login
  // failures, so don't let TestCafe abort the test on them.
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

const LOGIN_SCRIPT = `
// Start from a clean, signed-out state so the navbar shows "Sign in" and the
// /sign-in form renders (an existing session would auto-redirect away).
await t.deleteCookies();

// 1) Open the app home and click the navbar "Sign in" button.
await t.navigateTo('/');
const signInLink = Selector('a[href="/sign-in"]').filterVisible();
if (await signInLink.exists) {
  await t.click(signInLink);
} else {
  // Layout/viewport variation — go straight to the sign-in page instead.
  await t.navigateTo('/sign-in');
}

// 2) Password is the default method; wait for the credentials form to render.
await t.expect(Selector('#email').with({ timeout: 30000 }).exists).ok('the email/password sign-in form should render on /sign-in');

const email = process.env.ASAFARIM_ADMIN_EMAIL || '';
const password = process.env.ASAFARIM_ADMIN_PASSWORD || '';
await t.expect(email.length).gt(0, 'ASAFARIM_ADMIN_EMAIL must be set in F:\\\\repos\\\\e2e-testora\\\\.env');
await t.expect(password.length).gt(0, 'ASAFARIM_ADMIN_PASSWORD must be set in F:\\\\repos\\\\e2e-testora\\\\.env');

await t.typeText('#email', email, { replace: true });
await t.typeText('#password', password, { replace: true });
await t.click(Selector('button[type="submit"]').filterVisible());

// 3) On success NextAuth redirects away from /sign-in. A wrong password keeps us
//    on /sign-in with an "Invalid email or password" alert.
let left = false; let pathname = '';
for (let i = 0; i < 30; i++) {
  pathname = await t.eval(() => window.location.pathname);
  if (pathname.indexOf('/sign-in') === -1) { left = true; break; }
  await t.wait(1000);
}
await t.expect(left).ok('after submitting valid admin credentials the portal should leave /sign-in (still on ' + pathname + ' — check ASAFARIM_ADMIN_EMAIL/PASSWORD)');

// 4) Prove the session is real in the browser (which carries the httpOnly
//    NextAuth cookie): /profile is protected and server-redirects signed-out
//    visitors to /sign-in. Reaching it = authenticated. The page emits a benign
//    React hydration error that this fixture's skipJsErrors ignores.
await t.navigateTo('/profile');
let onProfile = false; let where = '';
for (let i = 0; i < 15; i++) {
  where = await t.eval(() => window.location.pathname);
  if (where.indexOf('/sign-in') !== -1) break;            // bounced → not authed
  if (where.indexOf('/profile') !== -1) { onProfile = true; break; }
  await t.wait(1000);
}
await t.expect(onProfile).ok('an authenticated admin should reach /profile, but ended on ' + where + ' (login likely did not establish a session)');
`;

const portalLoginCases: TestCaseDefinition[] = [
  {
    caseId: "asafarim-portal-email-password-login",
    fixtureId: "asafarim-portal-login-ui",
    title: "Admin can sign in with email and password",
    scriptType: "scripted",
    expected: {},
    script: LOGIN_SCRIPT,
  },
];

/* ------------------------------------------------------------------ */
/* Sign-up — register a new account, then log in with it              */
/* ------------------------------------------------------------------ */

export const portalSignupSuite: TestSuiteDefinition = {
  suiteId: "asafarim-portal-signup",
  frId: "asafarim-portal-auth",
  title: "Sign up",
  description:
    "A new user registers on /sign-up, then signs in with the new credentials.",
};

export const portalSignupFixture: TestFixtureDefinition = {
  fixtureId: "asafarim-portal-signup-ui",
  suiteId: "asafarim-portal-signup",
  title: "Portal sign-up + sign-in with the new account",
  baseUrl: "/",
  commonInput: {},
  // Registers a real account on the target each run (uniquely tagged, throwaway
  // e2e address). Browser flow + benign hydration errors ignored.
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

const SIGNUP_SCRIPT = `
await t.deleteCookies();

// 1) Reach the sign-up page from the app (navbar "Sign up"), like a real visitor.
await t.navigateTo('/');
const signUpLink = Selector('a[href="/sign-up"]').filterVisible();
if (await signUpLink.exists) { await t.click(signUpLink); } else { await t.navigateTo('/sign-up'); }
await t.expect(Selector('#email').with({ timeout: 30000 }).exists).ok('the sign-up form should render on /sign-up');

// Unique, throwaway identity so the run is repeatable and easy to spot/clean up.
// Keep the username short — the portal caps it at 24 chars (base36 token stays
// well under) and only allows [a-z0-9_].
const token = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
const email = 'e2e-signup-' + token + '@example.com';
const username = 'e2e' + token;
const password = 'E2ePass123!';

await t.typeText('#name', 'E2E Signup ' + token, { replace: true });
await t.typeText('#username', username, { replace: true });
await t.typeText('#email', email, { replace: true });
await t.typeText('#password', password, { replace: true });
await t.typeText('#confirmPassword', password, { replace: true });
await t.click(Selector('button[type="submit"]').filterVisible());

// 2) Registration auto-signs-in and redirects away from /sign-up.
let registered = false; let p1 = '';
for (let i = 0; i < 30; i++) { p1 = await t.eval(() => window.location.pathname); if (p1.indexOf('/sign-up') === -1) { registered = true; break; } await t.wait(1000); }
// On failure, surface what the page is complaining about (e.g. validation error).
let why = '';
if (!registered) { try { why = (await Selector('body').innerText).replace(/\\s+/g, ' ').slice(0, 300); } catch (e) { why = ''; } }
await t.expect(registered).ok('after registering, the app should leave /sign-up (still on ' + p1 + '). Page said: ' + why);

// 3) Confirm the new account is authenticated (protected /profile is reachable).
await t.navigateTo('/profile');
await t.wait(2500);
let after = await t.eval(() => window.location.pathname);
await t.expect(after.indexOf('/sign-in')).eql(-1, 'the just-registered user should reach /profile (was at ' + after + ')');

// 4) Sign out and log back IN with the new credentials, to prove they work.
await t.deleteCookies();
await t.navigateTo('/sign-in');
await t.expect(Selector('#email').with({ timeout: 30000 }).exists).ok('the sign-in form should render');
await t.typeText('#email', email, { replace: true });
await t.typeText('#password', password, { replace: true });
await t.click(Selector('button[type="submit"]').filterVisible());
let loggedIn = false; let p2 = '';
for (let i = 0; i < 30; i++) { p2 = await t.eval(() => window.location.pathname); if (p2.indexOf('/sign-in') === -1) { loggedIn = true; break; } await t.wait(1000); }
await t.expect(loggedIn).ok('the new account should sign in and leave /sign-in (still on ' + p2 + ')');
await t.navigateTo('/profile');
await t.wait(2500);
after = await t.eval(() => window.location.pathname);
await t.expect(after.indexOf('/sign-in')).eql(-1, 'the new account should reach /profile after logging in (was at ' + after + ')');
`;

const portalSignupCases: TestCaseDefinition[] = [
  {
    caseId: "asafarim-portal-signup-then-login",
    fixtureId: "asafarim-portal-signup-ui",
    title: "A new user can register and then sign in with that account",
    scriptType: "scripted",
    expected: {},
    script: SIGNUP_SCRIPT,
  },
];

/* ------------------------------------------------------------------ */
/* Forgot password — request a reset link                            */
/* ------------------------------------------------------------------ */

export const portalForgotSuite: TestSuiteDefinition = {
  suiteId: "asafarim-portal-forgot-password",
  frId: "asafarim-portal-auth",
  title: "Forgot password",
  description:
    "Requesting a password reset shows the success confirmation.",
};

export const portalForgotFixture: TestFixtureDefinition = {
  fixtureId: "asafarim-portal-forgot-ui",
  suiteId: "asafarim-portal-forgot-password",
  title: "Portal forgot-password request",
  baseUrl: "/forgot-password",
  commonInput: {},
  metadata: { ui: true, skipJsErrors: "Minified React error" },
};

const FORGOT_SCRIPT = `
await t.deleteCookies();
await t.navigateTo('/forgot-password');
await t.expect(Selector('#email').with({ timeout: 30000 }).exists).ok('the forgot-password form should render');

// A non-existent address still returns the generic success message
// (anti-enumeration), so no real reset email is sent.
await t.typeText('#email', 'e2e-forgot-' + Date.now() + '@example.com', { replace: true });
await t.click(Selector('button[type="submit"]').filterVisible());

await t.expect(Selector('body').withText('reset link has been sent').with({ timeout: 30000 }).exists).ok('the forgot-password page should show the reset-link success message');
`;

const portalForgotCases: TestCaseDefinition[] = [
  {
    caseId: "asafarim-portal-forgot-password-success",
    fixtureId: "asafarim-portal-forgot-ui",
    title: "Forgot-password request shows the success message",
    scriptType: "scripted",
    expected: {},
    script: FORGOT_SCRIPT,
  },
];

/* ------------------------------------------------------------------ */

export const asafarimPortalSuites: TestSuiteDefinition[] = [
  portalLoginSuite,
  portalSignupSuite,
  portalForgotSuite,
];
export const asafarimPortalFixtures: TestFixtureDefinition[] = [
  portalLoginFixture,
  portalSignupFixture,
  portalForgotFixture,
];
export const asafarimPortalCases: TestCaseDefinition[] = [
  ...portalLoginCases,
  ...portalSignupCases,
  ...portalForgotCases,
];
