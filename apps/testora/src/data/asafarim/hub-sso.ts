/**
 * Shared "sign in on Hub, land back on the app" script for ASafariM apps that
 * use Hub SSO (TimelineAI, Vionto) — #700.
 *
 * The Hub and app origins come from the RUN'S TARGET first, exposed per run by
 * the spec prelude (test-engine/generators/testGenerator.ts specEnvPrelude):
 *   TESTORA_TARGET_BASE_URL  the app origin the run targets
 *   TESTORA_TARGET_HUB_URL   that target's Hub (target_environments.hub_url)
 * and only fall back to the server env / production defaults when a run has
 * no target. So a Local run signs in on the local Hub and lands on the local
 * app instead of silently testing production.
 *
 * After login it compares ORIGINS (not a host substring): landing anywhere but
 * the target's origin fails with a message naming both, so "a Local run that
 * tested prod" can't pass.
 *
 * The snippet declares `pathname` (callers reuse it) and `appOrigin`.
 */
export function hubSsoLoginScript(options: {
  /** App name used in failure messages, e.g. "TimelineAI". */
  appName: string;
  /** Server-env names to try for the app URL when the run has no target. */
  appUrlEnv: string[];
  /** Production default when neither the target nor the env names one. */
  defaultAppUrl: string;
  /** Path on the app to come back to after sign-in. */
  callbackPath: string;
}): string {
  const appUrlFallback = [
    "process.env.TESTORA_TARGET_BASE_URL",
    ...options.appUrlEnv.map((name) => `process.env.${name}`),
    JSON.stringify(options.defaultAppUrl),
  ].join(" || ");
  const app = JSON.stringify(options.appName);
  return `
const appOrigin = new URL(${appUrlFallback}).origin;
const hubOrigin = new URL(process.env.TESTORA_TARGET_HUB_URL || process.env.ASAFARIM_HUB_URL || process.env.NEXT_PUBLIC_ASAFARIM_HUB_URL || 'https://hub.asafarim.com').origin;
const email = process.env.ASAFARIM_ADMIN_EMAIL || '';
const password = process.env.ASAFARIM_ADMIN_PASSWORD || '';
await t.expect(email.length).gt(0, 'ASAFARIM_ADMIN_EMAIL is not set — add it to the secrets of the target this run uses (Targets page).');
await t.expect(password.length).gt(0, 'ASAFARIM_ADMIN_PASSWORD is not set — add it to the secrets of the target this run uses (Targets page).');

await t.deleteCookies();
const callback = appOrigin + ${JSON.stringify(options.callbackPath)};
await t.navigateTo(hubOrigin + '/sign-in?callbackUrl=' + encodeURIComponent(callback));

await t.expect(Selector('#identifier').with({ timeout: 30000 }).exists).ok('Hub /sign-in form should render at ' + hubOrigin);
await t.typeText('#identifier', email, { replace: true });
await t.typeText('#password', password, { replace: true });
await t.click(Selector('button[type="submit"]').filterVisible());

// Wait until we leave Hub's sign-in, then check WHERE we landed.
let landedOrigin = ''; let pathname = '';
for (let i = 0; i < 30; i++) {
  landedOrigin = await t.eval(() => window.location.origin);
  pathname = await t.eval(() => window.location.pathname);
  if (landedOrigin !== hubOrigin && pathname.indexOf('/sign-in') === -1) break;
  await t.wait(1000);
}
console.log('[testora] ' + ${app} + ' SSO: signed in on ' + hubOrigin + ', landed on ' + landedOrigin + pathname);
await t.expect(landedOrigin !== hubOrigin && pathname.indexOf('/sign-in') === -1).ok('SSO login did not leave Hub sign-in (' + hubOrigin + ') — ended at ' + landedOrigin + pathname);
await t.expect(landedOrigin).eql(appOrigin, 'SSO landed on ' + landedOrigin + ' but this run targets ' + appOrigin + ' — the target\\'s Hub URL (' + hubOrigin + ') sends ' + ${app} + ' sign-ins elsewhere. Fix the target\\'s Hub URL.');
await t.wait(1500);
`;
}
