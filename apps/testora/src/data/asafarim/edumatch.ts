import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";

/**
 * ASafariM EduMatch — student question flow and tutor quote flow.
 *
 * EduMatch authenticates through the portal SSO (its middleware redirects
 * protected routes to portal.asafarim.com/sign-in). These tests are
 * self-bootstrapping: they try the credentials from .env and, if the account
 * doesn't exist yet, register it on the portal (which auto-signs-in).
 *
 * Credentials: EDUMATCH_STUDENT_EMAIL/PASSWORD and EDUMATCH_TEACHER_EMAIL/
 * PASSWORD (same for dev and prod — switch via the Run page's Target env).
 */

export const edumatchFR: FunctionalRequirementDefinition = {
  id: "asafarim-edumatch",
  projectId: "asafarim-edumatch",
  title: "EduMatch · Student & Tutor",
  description:
    "Student asks questions (3 grade levels), gets an AI answer and requests tutor quotes; a tutor submits a quote.",
  baseUrl: process.env.ASAFARIM_EDUMATCH_URL || "https://edumatch.asafarim.com",
};

/**
 * Sign in to EduMatch via the portal SSO. Starts on the EduMatch home (public)
 * so we can capture its origin, then navigates to a protected page to trigger
 * the redirect. Logs in; if that fails (account missing) it registers on the
 * portal. Leaves the browser authenticated and on `triggerPath`.
 */
function edumatchAuth(
  emailEnv: string,
  passEnv: string,
  triggerPath: string,
): string {
  return `
await t.deleteCookies();
// We loaded the public EduMatch home, so this origin is the (possibly
// retargeted) EduMatch deployment — use it for absolute navigation across the
// cross-domain portal-SSO redirect.
const eduOrigin = await t.eval(() => window.location.origin);
const email = process.env.${emailEnv} || '';
const password = process.env.${passEnv} || '';
await t.expect(email.length).gt(0, '${emailEnv} must be set in F:\\\\repos\\\\e2e-testora\\\\.env');
await t.expect(password.length).gt(0, '${passEnv} must be set in F:\\\\repos\\\\e2e-testora\\\\.env');

await t.navigateTo(eduOrigin + '${triggerPath}');
await t.wait(3000);
let path = await t.eval(() => window.location.pathname);
if (path.indexOf('/sign-in') !== -1) {
  await t.expect(Selector('#email').with({ timeout: 30000 }).exists).ok('portal sign-in form should render');
  await t.typeText('#email', email, { replace: true });
  await t.typeText('#password', password, { replace: true });
  await t.click(Selector('button[type="submit"]').filterVisible());
  await t.wait(5000);
  path = await t.eval(() => window.location.pathname);
  if (path.indexOf('/sign-in') !== -1) {
    // Login didn't take — the account likely doesn't exist yet, so register it.
    await t.navigateTo('/sign-up');
    await t.expect(Selector('#confirmPassword').with({ timeout: 30000 }).exists).ok('portal sign-up form should render');
    const token = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    await t.typeText('#name', 'E2E ' + token, { replace: true });
    await t.typeText('#username', ('e2e' + token).slice(0, 24), { replace: true });
    await t.typeText('#email', email, { replace: true });
    await t.typeText('#password', password, { replace: true });
    await t.typeText('#confirmPassword', password, { replace: true });
    await t.click(Selector('button[type="submit"]').filterVisible());
    await t.wait(5000);
  }
}
// Back to the target page, now authenticated.
await t.navigateTo(eduOrigin + '${triggerPath}');
await t.wait(3000);
const authedPath = await t.eval(() => window.location.pathname);
await t.expect(authedPath.indexOf('/sign-in')).eql(-1, 'should be signed in and reach ${triggerPath} (ended on ' + authedPath + ')');
// Fail fast (not after a long selector timeout) if the run is pointed at the
// wrong app — the EduMatch routes only exist on the EduMatch deployment.
await t.expect(authedPath).contains('${triggerPath}', 'expected to be on ${triggerPath} — is the Target set to the EduMatch app (ASAFARIM_EDUMATCH_URL), not the portal? Current origin: ' + eduOrigin);
`;
}

/* ------------------------------------------------------------------ */
/* Student — ask 3 questions (one per grade level) + request quotes   */
/* ------------------------------------------------------------------ */

export const edumatchStudentSuite: TestSuiteDefinition = {
  suiteId: "edumatch-student-inquiry",
  frId: "asafarim-edumatch",
  title: "Student asks questions and requests tutor quotes",
  description:
    "For each grade level: ask a question, get an AI answer, request tutor quotes and see the success confirmation.",
};

export const edumatchStudentFixture: TestFixtureDefinition = {
  fixtureId: "edumatch-student-ask-ui",
  suiteId: "edumatch-student-inquiry",
  title: "Student ask-a-question + request tutor quotes",
  // Public home so we can capture the EduMatch origin before the SSO redirect.
  baseUrl: "/",
  commonInput: {},
  // Browser flow + an external SSR app (ignore its benign client errors). Each
  // run creates a real inquiry and triggers a live AI generation. `flaky` re-runs
  // a failed test (transient DNS / AI rate-limit against the live app).
  metadata: { ui: true, skipJsErrors: true, flaky: true },
};

const edumatchStudentCases: TestCaseDefinition[] = [
  {
    caseId: "edumatch-student-ask-and-request-quotes",
    fixtureId: "edumatch-student-ask-ui",
    title: "Student asks a question, gets AI answer and requests tutor quotes",
    scriptType: "scripted",
    // One question per grade level (K12 / UNDERGRAD / GRAD = grade buttons 0/1/2).
    runs: [
      { subject: "Mathematics", gradeIndex: 0, gradeName: "K12" },
      { subject: "Physics", gradeIndex: 1, gradeName: "UNDERGRAD" },
      { subject: "Chemistry", gradeIndex: 2, gradeName: "GRAD" },
    ],
    expected: {},
    script:
      edumatchAuth(
        "EDUMATCH_STUDENT_EMAIL",
        "EDUMATCH_STUDENT_PASSWORD",
        "/student/inquiry/new",
      ) +
      `
// Backstop for the geolocation permission prompt that "Request Tutor Quotes"
// triggers — TestCafe can't accept a native dialog otherwise.
await t.setNativeDialogHandler((type) => {
  if (type === 'geolocation') return { latitude: 50.8503, longitude: 4.3517 };
  return null;
});

// ── Step 1 (Subject & Level): pick the course + grade ──────────────────────
await t.expect(Selector('select').filterVisible().with({ timeout: 30000 }).exists).ok('the Ask a Question wizard should render');
const subjectSelect = Selector('select').filterVisible();
await t.click(subjectSelect);
await t.click(subjectSelect.find('option').withText(run.subject));
// Grade levels render as the 3 buttons in the grade grid (K12 / UNDERGRAD / GRAD).
await t.click(Selector('[class*="grid-cols-3"] button').nth(run.gradeIndex));
// Advance buttons are the primary ones (bg-[var(--color-primary)] + px-6).
const advance = () => Selector('button[class*="--color-primary"][class*="px-6"]').filterVisible();
await t.click(advance());

// ── Step 2 (Your Question): a 100+ char description ────────────────────────
const desc = 'Automated end-to-end test question about ' + run.subject + ' at ' + run.gradeName + ' level. Please give a clear, detailed, step-by-step explanation with at least one worked example. Thank you very much!';
await t.typeText('textarea', desc, { replace: true });
await t.click(advance()); // Review

// ── Step 3 (Review): submit ────────────────────────────────────────────────
await t.click(advance()); // Submit

// A brand-new student has no profile yet: the first submit returns 403 and the
// wizard shows a "create profile" gate (a full-width primary button) instead of
// navigating. Clicking it creates the profile AND auto-resubmits the inquiry.
await t.wait(3000);
if ((await t.eval(() => window.location.pathname)).indexOf('/student/inquiry/new') !== -1) {
  const createProfile = Selector('button[class*="--color-primary"][class*="w-full"]').filterVisible();
  if (await createProfile.exists) { await t.click(createProfile); }
}

// Land on the inquiry detail page (/student/inquiry/<id>, not /new).
let onDetail = false; let dp = '';
for (let i = 0; i < 30; i++) {
  dp = await t.eval(() => window.location.pathname);
  if (/\\/student\\/inquiry\\/[^/]+$/.test(dp) && dp.indexOf('/new') === -1) { onDetail = true; break; }
  await t.wait(1000);
}
let whyNew = '';
if (!onDetail) { try { whyNew = (await Selector('body').innerText).replace(/\\s+/g, ' ').slice(0, 300); } catch (e) { whyNew = ''; } }
await t.expect(onDetail).ok('after submitting, should land on the inquiry detail page (was at ' + dp + '). Page said: ' + whyNew);

// Mock browser geolocation directly too, so "Request Tutor Quotes" gets a
// position without any dialog at all (belt + suspenders with the handler above).
await t.eval(() => {
  try {
    const c = { latitude: 50.8503, longitude: 4.3517, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null };
    navigator.geolocation.getCurrentPosition = function (s) { s({ coords: c, timestamp: Date.now() }); };
    navigator.geolocation.watchPosition = function (s) { s({ coords: c, timestamp: Date.now() }); return 0; };
  } catch (e) { /* ignore */ }
});

// ── Ask AI, then wait for the answer to reveal "Request Tutor Quotes" ───────
// The AI button is the primary one in the AI section (label varies: "Ask AI" /
// "Ask Again"). The green "Request Tutor Quotes" only appears once the inquiry
// is AI_RESPONDED and the stream finished — retry the ask once if the live AI
// generation stalls (e.g. provider rate-limit on rapid back-to-back questions).
const aiBtn = Selector('button[class*="--color-primary"][class*="px-4"]').filterVisible();
const reqBtn = Selector('button').withText('Request Tutor Quotes');
if (await aiBtn.exists) { await t.click(aiBtn); }
// Poll for the green button (NB: \`await selector.exists\` is a snapshot, so we
// drive the wait with t.wait — up to ~150s). Re-ask once midway if the live AI
// generation stalls (provider rate-limit on rapid back-to-back questions).
let gotReq = false;
for (let i = 0; i < 150; i++) {
  if (await reqBtn.exists) { gotReq = true; break; }
  if (i === 90 && await aiBtn.exists) { await t.click(aiBtn); }
  await t.wait(1000);
}
await t.expect(gotReq).ok('Ask AI should produce a response and reveal "Request Tutor Quotes"');
await t.click(reqBtn.filterVisible());

// ── Success: "🎉 Your request has been sent!" ──────────────────────────────
await t.expect(Selector('body').withText('request has been sent').with({ timeout: 30000 }).exists).ok('should show the "Your request has been sent" success message');
`,
  },
];

/* ------------------------------------------------------------------ */
/* Tutor — submit a quote on an open request                          */
/* ------------------------------------------------------------------ */

export const edumatchTutorSuite: TestSuiteDefinition = {
  suiteId: "edumatch-tutor-quote",
  frId: "asafarim-edumatch",
  title: "Tutor submits a quote for an open request",
  description:
    "A tutor opens an incoming quote request and submits a rate + availability.",
};

export const edumatchTutorFixture: TestFixtureDefinition = {
  fixtureId: "edumatch-tutor-quote-ui",
  suiteId: "edumatch-tutor-quote",
  title: "Tutor submits a quote on an open request",
  baseUrl: "/",
  commonInput: {},
  // Self-onboards the tutor (creates a profile whose subjects match the
  // student's questions). PRECONDITION: the Student fixture must have run first
  // in this requirement so there's an open, subject-matching request to quote.
  metadata: { ui: true, skipJsErrors: true, flaky: true },
};

const edumatchTutorCases: TestCaseDefinition[] = [
  {
    caseId: "edumatch-tutor-submit-quote",
    fixtureId: "edumatch-tutor-quote-ui",
    title: "Tutor can open a request and submit a quote",
    scriptType: "scripted",
    expected: {},
    script:
      edumatchAuth(
        "EDUMATCH_TEACHER_EMAIL",
        "EDUMATCH_TEACHER_PASSWORD",
        "/tutor/requests",
      ) +
      `
// Geolocation backstop for the requests page (it asks for the tutor's location).
await t.setNativeDialogHandler((type) => {
  if (type === 'geolocation') return { latitude: 50.8503, longitude: 4.3517 };
  return null;
});

// ── Onboard: give the tutor a profile whose subjects match the student's ────
// questions (Mathematics/Physics/Chemistry). The matching is by subject, and a
// tutor profile is required to see any requests. We set it via a same-origin
// fetch (carries the session cookie, unlike t.request; the i18n toggle buttons
// are unreliable to drive). \`onlineOnly\` drops the distance filter so any
// subject-matching request is visible. POST upserts, so re-runs are fine.
const onboardStatus = await t.eval(() => {
  return fetch('/api/tutor/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subjectsTaught: ['Mathematics', 'Physics', 'Chemistry'],
      levelsTaught: ['K12', 'UNDERGRAD', 'GRAD'],
      hourlyRateCents: 2500,
      onlineOnly: true,
      homeAddress: { line1: 'Test 1', city: 'Brussels', postalCode: '1000', country: 'Belgium' },
    }),
  }).then(function (r) { return r.status; }).catch(function () { return -1; });
});
await t.expect(onboardStatus >= 200 && onboardStatus < 300).ok('creating the tutor profile should succeed (POST /api/tutor/profile) — got status ' + onboardStatus);

// Reload the requests page now that the profile + subjects exist.
await t.navigateTo(eduOrigin + '/tutor/requests');
await t.wait(3000);

// ── Find a matching open request and submit a quote ─────────────────────────
// Each open request is a full-width card header button (text-left + p-5). Poll
// (\`.exists\` is a snapshot, so drive the wait with t.wait).
const reqHeaders = Selector('button[class*="text-left"][class*="p-5"]').filterVisible();
let hasReq = false;
for (let i = 0; i < 20; i++) { if (await reqHeaders.exists) { hasReq = true; break; } await t.wait(1000); }
await t.expect(hasReq).ok('expected an open quote request for a subject the tutor teaches — run the Student fixture first so a matching request exists');

// The list isn't de-duped by the tutor's own past quotes, so a request quoted
// in a previous run errors with "already submitted". Try each open request
// until one accepts the quote (the student just created 3 fresh ones this run).
const count = await reqHeaders.count;
let submitted = false; let lastErr = '';
for (let idx = 0; idx < count && !submitted; idx++) {
  await t.click(reqHeaders.nth(idx)); // expand (collapses any other open form)
  const slotStart = Selector('input[type="datetime-local"]').filterVisible().nth(0);
  const slotEnd = Selector('input[type="datetime-local"]').filterVisible().nth(1);
  if (!(await slotStart.with({ timeout: 12000 }).exists)) continue;
  // Pre-filled rate + hours; add one availability slot and a note.
  await t.typeText(slotStart, '2026-12-01T10:00', { replace: true });
  await t.typeText(slotEnd, '2026-12-01T11:00', { replace: true });
  await t.typeText(Selector('textarea').filterVisible(), 'Automated e2e tutor quote — happy to help with this topic.', { replace: true });
  await t.click(Selector('button[class*="--color-primary"][class*="px-4"]').filterVisible());
  // Poll for the "Quote Sent" confirmation (the request moves to the "Already
  // Quoted" section). We check this positive signal rather than sniffing for an
  // error banner, because the navbar notification count is a red badge whose
  // class false-matches a bg-red-50 selector. No "Quote Sent" → this request was
  // likely already quoted (or a transient error) → try the next one.
  for (let w = 0; w < 8; w++) {
    if (await Selector('body').withText('Quote Sent').exists) { submitted = true; break; }
    await t.wait(1000);
  }
  if (!submitted) {
    const err = Selector('[class~="bg-red-50"]').filterVisible();
    if (await err.exists) lastErr = (await err.innerText).replace(/\\s+/g, ' ').slice(0, 200);
  }
}
await t.expect(submitted).ok('the tutor should submit a quote and see "Quote Sent" in Already Quoted (last error: ' + lastErr + ')');
`,
  },
];

/* ------------------------------------------------------------------ */

export const edumatchSuites: TestSuiteDefinition[] = [
  edumatchStudentSuite,
  edumatchTutorSuite,
];
export const edumatchFixtures: TestFixtureDefinition[] = [
  edumatchStudentFixture,
  edumatchTutorFixture,
];
export const edumatchCases: TestCaseDefinition[] = [
  ...edumatchStudentCases,
  ...edumatchTutorCases,
];
