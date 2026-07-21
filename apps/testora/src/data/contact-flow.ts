import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";
import { apiScript } from "./_admin-shared";

/**
 * Contact & support — the public Help Center contact form end to end.
 *
 * Two angles:
 *  1. Pipeline (API): a guest (no auth) submits the form via POST /contact and
 *     gets `{ success, referenceId: "IS-…" }`, then an admin logs in and finds
 *     that exact message in GET /admin/contact-messages. This is the reliable,
 *     locale-independent proof of the whole guest → admin round-trip.
 *  2. Form UI: a guest fills the real form on the locale-specific contact page
 *     (reached from the footer "Contact" link) and sees the success reference —
 *     exercised across en/nl/fr/de/lb, since the form selectors are stable
 *     (`#name`/`#email`/`#subject`/`#message`) while only the labels translate.
 *
 * NOTE: a real submission inserts a contact_messages row and may send a support
 * email — every artifact is tagged "E2E" + an `e2e-guest+…@example.com` address
 * so it is trivially filtered/deleted in the admin inbox.
 */

export const contactSupportFR: FunctionalRequirementDefinition = {
  id: "contact-support",
  title: "Contact & support",
  description:
    "The public Help Center contact form: a guest can submit a message and receive a reference, and an admin receives it in the contact-messages inbox.",
  baseUrl: process.env.WEBAPP_BASE_URL || "http://localhost:3233",
};

/* ------------------------------------------------------------------ */
/* 1. Guest → admin pipeline (API)                                    */
/* ------------------------------------------------------------------ */

export const contactPipelineSuite: TestSuiteDefinition = {
  suiteId: "contact-pipeline",
  frId: "contact-support",
  title: "Guest submission reaches the admin inbox",
  description:
    "A guest submits POST /contact and the message surfaces in the admin contact-messages list.",
};

export const contactPipelineFixture: TestFixtureDefinition = {
  fixtureId: "contact-pipeline-api",
  suiteId: "contact-pipeline",
  // API-only; loads a light page so TestCafe starts a browser, then works via
  // t.request (guest POST with no auth, then an authenticated admin GET).
  title: "Contact pipeline API — guest submit, admin receive",
  baseUrl: "/en/login",
  commonInput: {},
};

const contactPipelineCases: TestCaseDefinition[] = [
  {
    caseId: "contact-guest-to-admin",
    fixtureId: "contact-pipeline-api",
    title: "A guest can submit a contact message and an admin receives it",
    scriptType: "scripted",
    expected: {},
    script: apiScript(`
// Unique marker embedded in name + email + subject so we can find this exact
// submission again regardless of how the admin search is implemented.
const marker = 'e2e' + Date.now() + Math.floor(Math.random() * 1e6);
const email = 'e2e-guest+' + marker + '@example.com';
const subject = 'E2E contact test ' + marker;

// 1) Guest submits with NO auth header.
const submit = await t.request.post(api + '/contact', {
  headers: {},
  body: {
    name: 'E2E Guest ' + marker,
    email: email,
    subject: subject,
    message: 'Automated end-to-end contact test. Safe to delete. Marker: ' + marker,
    type: 'general_help',
    locale: 'en',
  },
});
await t.expect(submit.status).eql(201, 'guest POST /contact should return 201, got ' + submit.status + ': ' + JSON.stringify(submit.body).slice(0, 200));
await t.expect(submit.body && submit.body.success).ok('guest contact submit should succeed: ' + JSON.stringify(submit.body).slice(0, 200));
await t.expect(typeof submit.body.referenceId).eql('string', 'a successful submit should return a referenceId');
await t.expect(submit.body.referenceId.slice(0, 3)).eql('IS-', 'referenceId should look like IS-xxxx, got ' + submit.body.referenceId);

// 2) Admin logs in and finds it in the inbox (newest first; poll briefly in
//    case the insert is slightly behind the email/webhook side effects).
let found = null;
for (let i = 0; i < 8; i++) {
  const list = await authGet('/admin/contact-messages?limit=100');
  await t.expect(list.status).eql(200, 'admin GET /admin/contact-messages should return 200, got ' + list.status);
  const msgs = (list.body && list.body.messages) || [];
  found = msgs.filter(function (m) {
    return ((m.subject || '').indexOf(marker) !== -1) || ((m.email || '').indexOf(marker) !== -1);
  })[0];
  if (found) break;
  await t.wait(2000);
}
await t.expect(!!found).ok('the guest submission (marker ' + marker + ') should appear in /admin/contact-messages');
await t.expect(found.email).eql(email, 'admin inbox row email should match the guest submission');
await t.expect(found.subject || '').contains(subject, 'admin inbox row subject should match the guest submission');
`),
  },
];

/* ------------------------------------------------------------------ */
/* 2. Contact form UI across locales                                  */
/* ------------------------------------------------------------------ */

export const contactFormSuite: TestSuiteDefinition = {
  suiteId: "contact-form-locales",
  frId: "contact-support",
  title: "Contact form renders and submits in every language",
  description:
    "The Help Center contact form (reached from the footer Contact link) submits and shows the reference in en/nl/fr/de/lb.",
};

export const contactFormUiFixture: TestFixtureDefinition = {
  fixtureId: "contact-form-ui",
  suiteId: "contact-form-locales",
  title: "Contact form UI — guest submits and sees the reference",
  baseUrl: "/en/help-center/contact",
  commonInput: {},
  // Browser flow + creates a message per locale — skipped in "All requirements"
  // runs unless UI smokes are explicitly included.
  metadata: { ui: true },
};

// /{locale}/{helpBase}/contact — helpBase varies by locale (see the app's
// helpCenterBaseByLocale). lb falls back to English help-center content.
const LOCALE_CONTACT_PAGES = [
  { locale: "en", path: "/en/help-center/contact" },
  { locale: "nl", path: "/nl/helpcentrum/contact" },
  { locale: "fr", path: "/fr/centre-aide/contact" },
  { locale: "de", path: "/de/hilfe-center/contact" },
  { locale: "lb", path: "/lb/help-center/contact" },
];

const contactFormCases: TestCaseDefinition[] = [
  {
    caseId: "contact-form-submit-succeeds",
    fixtureId: "contact-form-ui",
    title: "Guest can fill the contact form and see the reference",
    scriptType: "scripted",
    runs: LOCALE_CONTACT_PAGES,
    expected: {},
    script: `
await t.navigateTo(run.path);
// The form fields carry stable ids/names; only the labels are translated.
await t.expect(Selector('#subject').with({ timeout: 30000 }).exists).ok('the contact form should render at ' + run.path);
const marker = 'e2eui' + Date.now() + Math.floor(Math.random() * 1e6);
await t.typeText('#name', 'E2E UI Guest ' + marker, { replace: true });
await t.typeText('#email', 'e2e-ui+' + marker + '@example.com', { replace: true });
await t.typeText('#subject', 'E2E UI contact ' + marker, { replace: true });
await t.typeText('#message', 'Automated UI contact test. Safe to delete. Marker: ' + marker, { replace: true });
await t.click('button[type="submit"]');
// Success state renders a green confirmation box containing the IS- reference.
await t.expect(Selector('body').withText('IS-').with({ timeout: 30000 }).exists).ok('expected the IS- reference id in the success message at ' + run.path);
`,
  },
];

/* ------------------------------------------------------------------ */

export const contactSupportSuites: TestSuiteDefinition[] = [
  contactPipelineSuite,
  contactFormSuite,
];
export const contactSupportFixtures: TestFixtureDefinition[] = [
  contactPipelineFixture,
  contactFormUiFixture,
];
export const contactSupportCases: TestCaseDefinition[] = [
  ...contactPipelineCases,
  ...contactFormCases,
];
