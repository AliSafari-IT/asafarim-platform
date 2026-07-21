import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";
import { BROWSER_ADMIN_LOGIN } from "./_admin-shared";

/**
 * Full manual wizard flow for "Create Video from URL":
 *
 *  1. Open zimmo.be Hasselt gallery, sort by "Recentste eerst", grab the first
 *     "Huis te koop" link and paste it into /en/listings → Start.
 *  2. Step 1 – Basics: dismiss welcome tour, set Language=English, 9:16
 *     orientation, Style=Luxury.
 *  3. Step 2 – Images: ensure ≥2 images selected (AI-pick 10 fallback).
 *  4. Step 3 – Voice & Captions: Browse voices → pick Hannah (or Lyan).
 *  5. Step 4 – Advanced/Brand: Brand tab → logo demo-2.webp (or demo-1.jpg),
 *     Position=Top Right → Generate video → poll until terminal status.
 *
 * Each case covers one discrete wizard step so failures are pin-pointed.
 * The fixture's setupScript handles login + scraping the zimmo URL so all
 * five cases share a single job page (the URL is captured in globalThis).
 *
 * Supported "Next/Continue" button variants are tried in order because the
 * app ships both labels in different deployments.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Click the "Next" or "Continue" wizard button, whichever is visible. */
const CLICK_NEXT = [
  "const nextBtn = Selector('button').withText(/^(Next|Continue)$/i).filterVisible().nth(0);",
  "await t.expect(nextBtn.with({ timeout: 15000 }).exists).ok('Expected a Next/Continue button');",
  "await t.click(nextBtn);",
].join("\n");

/** Shared admin login reused from _admin-shared. */
const LOGIN_BLOCK = BROWSER_ADMIN_LOGIN;

// ─── Setup script (runs once before the fixture's first test) ────────────────
//
// 1. Log in as admin.
// 2. Use a known stable 'Huis te koop' Zimmo Hasselt listing URL.
//    (Navigating to zimmo.be directly is blocked by Cloudflare bot-protection
//    in a headless browser.  The manual step of copying the link from the
//    gallery is represented here by the hard-coded URL — the scraping pipeline
//    and all wizard steps are still fully exercised.)
// 3. Paste that URL into /en/listings and click Start.
// 4. Wait (up to 3 min) for the wizard job page to load.
// 5. Stash the job URL in globalThis.__wizardJobUrl so each case can navigate
//    directly to the correct step without re-scraping.

const WIZARD_SETUP_SCRIPT = [
  LOGIN_BLOCK,
  "",
  "// ── 1. Known 'Huis te koop' Zimmo Hasselt listing URL ────────────────────",
  "// zimmo.be requires human verification (Cloudflare) in headless browsers, so",
  "// we use a stable URL directly instead of navigating the gallery UI.",
  "const listingUrl = 'https://www.zimmo.be/nl/hasselt-3500/te-koop/huis/LPRCG/';",
  "globalThis.__wizardListingUrl = listingUrl;",
  "",
  "// ── 2. Submit the URL on /en/listings ─────────────────────────────────────",
  "// Use an absolute URL so we're never stuck on a previous external domain.",
  "const appBase = (typeof run !== 'undefined' && run && run.baseUrl) ? run.baseUrl : (process.env.WEBAPP_BASE_URL || 'http://localhost:3233');",
  "await t.navigateTo(appBase + '/en/listings');",
  "const urlInput = Selector('input[placeholder*=\"https://\"]').filterVisible().nth(0);",
  "const startButton = Selector('button').withText('Start').filterVisible().nth(0);",
  "await t.expect(urlInput.with({ timeout: 30000 }).exists).ok('Expected the listing URL input on /en/listings');",
  "for (let i = 0; i < 6; i++) {",
  "  await t.typeText(urlInput, listingUrl, { replace: true });",
  "  if ((await urlInput.value) === listingUrl && !(await startButton.hasAttribute('disabled'))) break;",
  "  await t.wait(1500);",
  "}",
  "await t.expect(startButton.hasAttribute('disabled')).notOk({ timeout: 10000 });",
  "await t.click(startButton);",
  "",
  "// ── 3. Wait for the wizard / job page to appear (up to 3 minutes) ─────────",
  "const orientationSection = Selector('[data-tour=\"step-orientation\"], [data-testid=\"step-basics\"]');",
  "const stepIndicator = Selector('body').withText(/step 1 of/i);",
  "let reachedWizard = false;",
  "const deadline = Date.now() + 180000;",
  "while (Date.now() < deadline) {",
  "  if (await orientationSection.exists || await stepIndicator.exists) { reachedWizard = true; break; }",
  "  await t.wait(3000);",
  "}",
  "await t.expect(reachedWizard).ok('Wizard/job page did not load within 3 minutes for ' + listingUrl);",
  "globalThis.__wizardJobUrl = await t.eval(() => window.location.href);",
].join("\n");

// ─── FR / Suite / Fixture ────────────────────────────────────────────────────

export const videoWizardFlowFR: FunctionalRequirementDefinition = {
  id: "video-wizard-flow",
  title: "Video wizard — step-by-step flow",
  description:
    "Full manual wizard flow: discover a Zimmo listing, submit it, then drive each wizard step (Basics, Images, Voice, Brand) through to video generation.",
  baseUrl: process.env.WEBAPP_BASE_URL || "http://localhost:3233",
};

export const videoWizardFlowSuite: TestSuiteDefinition = {
  suiteId: "video-wizard-steps",
  frId: "video-wizard-flow",
  title: "Video wizard — per-step coverage",
  description:
    "Covers each step of the video-creation wizard driven from a live Zimmo listing URL.",
};

export const videoWizardFlowFixture: TestFixtureDefinition = {
  fixtureId: "video-wizard-flow",
  suiteId: "video-wizard-steps",
  title: "Video wizard flow — Zimmo listing → Generate video",
  baseUrl: "/en/login",
  commonInput: {},
  setupScript: WIZARD_SETUP_SCRIPT,
  metadata: { heavy: true, ui: true },
};

// ─── Helper: navigate back to the job page ───────────────────────────────────

const NAV_TO_JOB = [
  "const jobUrl = globalThis.__wizardJobUrl || '';",
  "await t.expect(jobUrl.length).gt(0, 'Setup did not capture the job URL — did the setup script run?');",
  "await t.navigateTo(jobUrl);",
  "await t.wait(1500);",
  "await dismissPrivacyBanner();",
].join("\n");

// ─── Test Cases ──────────────────────────────────────────────────────────────

export const videoWizardFlowCases: TestCaseDefinition[] = [
  // ── Case 1: Basics step ─────────────────────────────────────────────────────
  {
    caseId: "wizard-step1-basics",
    fixtureId: "video-wizard-flow",
    title: "Step 1 – Basics: language English, 9:16 orientation, Style Luxury",
    scriptType: "scripted",
    expected: {},
    script: [
      LOGIN_BLOCK,
      NAV_TO_JOB,
      "",
      "// Dismiss the welcome tour popover if present.",
      "const dontShowAgain = Selector('label, span, div').withText(/don.t show again/i).filterVisible().nth(0);",
      "if (await dontShowAgain.with({ timeout: 5000 }).exists) {",
      "  const checkbox = Selector('input[type=\"checkbox\"]').filterVisible().nth(0);",
      "  if (await checkbox.exists) await t.click(checkbox);",
      "}",
      "// Close/skip the tour by clicking any visible Next on the tour popover.",
      "const tourNext = Selector('[class*=\"popover\"] button, [class*=\"tooltip\"] button, [class*=\"tour\"] button').withText(/next/i).filterVisible().nth(0);",
      "if (await tourNext.with({ timeout: 3000 }).exists) await t.click(tourNext);",
      "",
      "// ── Language: open select and choose English ──────────────────────────",
      "const langSelect = Selector('select, [role=\"combobox\"]').filterVisible().nth(0);",
      "if (await langSelect.with({ timeout: 8000 }).exists) {",
      "  const tagName = await langSelect.tagName;",
      "  if (tagName === 'select') {",
      "    await t.click(langSelect);",
      "    const englishOpt = Selector('option').withText(/english/i).nth(0);",
      "    if (await englishOpt.exists) await t.click(englishOpt);",
      "  } else {",
      "    await t.click(langSelect);",
      "    const englishItem = Selector('[role=\"option\"], li').withText(/english/i).filterVisible().nth(0);",
      "    if (await englishItem.with({ timeout: 5000 }).exists) await t.click(englishItem);",
      "  }",
      "}",
      "",
      "// ── Orientation: 9:16 ─────────────────────────────────────────────────",
      "const orientation916 = Selector('label, button, [role=\"radio\"], div').withText(/9[:\\s]?16/i).filterVisible().nth(0);",
      "await t.expect(orientation916.with({ timeout: 10000 }).exists).ok('Expected the 9:16 orientation option');",
      "await t.click(orientation916);",
      "",
      "// ── Style: Luxury ──────────────────────────────────────────────────────",
      "const luxuryCard = Selector('label, button, div, [role=\"radio\"]').withText(/^luxury$/i).filterVisible().nth(0);",
      "await t.expect(luxuryCard.with({ timeout: 10000 }).exists).ok('Expected the Luxury style card');",
      "await t.click(luxuryCard);",
      "",
      CLICK_NEXT,
      "",
      "// Confirm we've advanced to step 2.",
      "await t.expect(Selector('body').withText(/step 2|images/i).with({ timeout: 15000 }).exists).ok('Should have advanced to the Images step after completing Basics');",
    ].join("\n"),
  },

  // ── Case 2: Images step ──────────────────────────────────────────────────────
  {
    caseId: "wizard-step2-images",
    fixtureId: "video-wizard-flow",
    title: "Step 2 – Images: ensure ≥2 images selected (AI-pick fallback)",
    scriptType: "scripted",
    expected: {},
    script: [
      LOGIN_BLOCK,
      NAV_TO_JOB,
      "",
      "// Navigate to the Images step (click step 2 in the progress bar, or Next from step 1).",
      "const step2Link = Selector('[data-step=\"2\"], [aria-label*=\"Images\"], button, a').withText(/^images$/i).filterVisible().nth(0);",
      "if (await step2Link.with({ timeout: 5000 }).exists) {",
      "  await t.click(step2Link);",
      "} else {",
      "  // Advance from step 1 first.",
      "  const step1Active = Selector('body').withText(/step 1 of|basics.*current/i);",
      "  if (await step1Active.with({ timeout: 5000 }).exists) {",
      "    " + CLICK_NEXT,
      "  }",
      "}",
      "await t.expect(Selector('body').withText(/images|selected.*\\/.*20|ai.?pick/i).with({ timeout: 15000 }).exists).ok('Expected the Images step to render');",
      "",
      "// Read the current selected count from 'Selected X/20'.",
      "const selectedLabel = Selector('body').withText(/selected \\d+\\/\\d+/i);",
      "let selectedCount = 0;",
      "if (await selectedLabel.with({ timeout: 5000 }).exists) {",
      "  const labelText = await selectedLabel.innerText;",
      "  const m = labelText.match(/selected (\\d+)\\/(\\d+)/i);",
      "  if (m) selectedCount = parseInt(m[1], 10);",
      "}",
      "",
      "// If fewer than 2 images are selected, trigger AI-pick 10.",
      "if (selectedCount < 2) {",
      "  const aiPick10 = Selector('button').withText(/ai.?pick 10/i).filterVisible().nth(0);",
      "  const aiPick20 = Selector('button').withText(/ai.?pick 20/i).filterVisible().nth(0);",
      "  if (await aiPick10.with({ timeout: 8000 }).exists) {",
      "    await t.click(aiPick10);",
      "  } else if (await aiPick20.exists) {",
      "    await t.click(aiPick20);",
      "  }",
      "  await t.wait(2000);",
      "}",
      "",
      "// Assert at least 2 images are now selected.",
      "const checkedImages = Selector('img[data-selected=\"true\"], [class*=\"selected\"] img, input[type=\"checkbox\"]:checked').count;",
      "// Fallback: re-read the label.",
      "const updatedLabel = Selector('body').withText(/selected [2-9]\\d*\\/\\d+/i);",
      "const hasEnough = (await updatedLabel.with({ timeout: 5000 }).exists) || (await checkedImages) >= 2;",
      "await t.expect(hasEnough).ok('Expected at least 2 images to be selected before proceeding');",
      "",
      CLICK_NEXT,
      "",
      "await t.expect(Selector('body').withText(/step 3|voice|captions/i).with({ timeout: 15000 }).exists).ok('Should have advanced to the Voice & Captions step');",
    ].join("\n"),
  },

  // ── Case 3: Voice & Captions step ───────────────────────────────────────────
  {
    caseId: "wizard-step3-voice",
    fixtureId: "video-wizard-flow",
    title: "Step 3 – Voice & Captions: Browse voices → select Hannah (or Lyan)",
    scriptType: "scripted",
    expected: {},
    script: [
      LOGIN_BLOCK,
      NAV_TO_JOB,
      "",
      "// Navigate to step 3 via the progress bar or by advancing.",
      "const step3Link = Selector('[data-step=\"3\"], button, a').withText(/voice.*captions|captions.*voice/i).filterVisible().nth(0);",
      "if (await step3Link.with({ timeout: 5000 }).exists) {",
      "  await t.click(step3Link);",
      "} else {",
      "  // Advance through steps 1 → 2 → 3.",
      "  for (let step = 1; step <= 2; step++) {",
      "    const active = Selector('body').withText(new RegExp('step ' + step + ' of', 'i'));",
      "    if (await active.with({ timeout: 5000 }).exists) {",
      "      " + CLICK_NEXT,
      "      await t.wait(1500);",
      "    }",
      "  }",
      "}",
      "await t.expect(Selector('body').withText(/voice.*captions|browse voices/i).with({ timeout: 15000 }).exists).ok('Expected the Voice & Captions step');",
      "",
      "// Click 'Browse voices'.",
      "const browseVoices = Selector('button, a').withText(/browse voices/i).filterVisible().nth(0);",
      "await t.expect(browseVoices.with({ timeout: 10000 }).exists).ok('Expected the Browse voices button');",
      "await t.click(browseVoices);",
      "",
      "// Wait for the voice list to appear.",
      "const voiceList = Selector('[role=\"listbox\"], [role=\"list\"], ul, [class*=\"voice-list\"], [class*=\"voiceList\"]').filterVisible().nth(0);",
      "await t.expect(voiceList.with({ timeout: 10000 }).exists).ok('Expected the Choose a voice list to appear');",
      "",
      "// Pick Hannah; fall back to Lyan.",
      "const hannahItem = Selector('li, [role=\"option\"], button, div').withText(/^hannah$/i).filterVisible().nth(0);",
      "const lyanItem   = Selector('li, [role=\"option\"], button, div').withText(/^lyan$/i).filterVisible().nth(0);",
      "if (await hannahItem.with({ timeout: 5000 }).exists) {",
      "  await t.click(hannahItem);",
      "} else if (await lyanItem.with({ timeout: 5000 }).exists) {",
      "  await t.click(lyanItem);",
      "} else {",
      "  // Pick the first available voice as a last resort.",
      "  const firstVoice = Selector('[role=\"option\"], li').filterVisible().nth(0);",
      "  await t.expect(firstVoice.with({ timeout: 5000 }).exists).ok('Expected at least one voice to be selectable');",
      "  await t.click(firstVoice);",
      "}",
      "",
      CLICK_NEXT,
      "",
      "await t.expect(Selector('body').withText(/step 4|advanced|brand/i).with({ timeout: 15000 }).exists).ok('Should have advanced to the Advanced/Brand step');",
    ].join("\n"),
  },

  // ── Case 4: Advanced / Brand step ───────────────────────────────────────────
  {
    caseId: "wizard-step4-brand",
    fixtureId: "video-wizard-flow",
    title: "Step 4 – Advanced/Brand: logo demo-2.webp (or demo-1.jpg), Position Top Right",
    scriptType: "scripted",
    expected: {},
    script: [
      LOGIN_BLOCK,
      NAV_TO_JOB,
      "",
      "// Navigate to step 4.",
      "const step4Link = Selector('[data-step=\"4\"], button, a').withText(/^advanced$/i).filterVisible().nth(0);",
      "if (await step4Link.with({ timeout: 5000 }).exists) {",
      "  await t.click(step4Link);",
      "} else {",
      "  for (let step = 1; step <= 3; step++) {",
      "    const active = Selector('body').withText(new RegExp('step ' + step + ' of', 'i'));",
      "    if (await active.with({ timeout: 5000 }).exists) {",
      "      " + CLICK_NEXT,
      "      await t.wait(1500);",
      "    }",
      "  }",
      "}",
      "await t.expect(Selector('body').withText(/advanced|brand settings/i).with({ timeout: 15000 }).exists).ok('Expected the Advanced step');",
      "",
      "// Click the 'Brand' tab.",
      "const brandTab = Selector('button, [role=\"tab\"], a').withText(/^brand$/i).filterVisible().nth(0);",
      "await t.expect(brandTab.with({ timeout: 10000 }).exists).ok('Expected the Brand tab');",
      "await t.click(brandTab);",
      "",
      "// Open 'Select a logo...' dropdown.",
      "const logoDropdown = Selector('select, [role=\"combobox\"]').withText(/select a logo/i).filterVisible().nth(0);",
      "const logoSelect   = Selector('select').filterVisible().nth(0);",
      "const logoCombo    = Selector('[role=\"combobox\"]').filterVisible().nth(0);",
      "let logoOpened = false;",
      "if (await logoDropdown.with({ timeout: 8000 }).exists) {",
      "  await t.click(logoDropdown);",
      "  logoOpened = true;",
      "} else if (await logoSelect.with({ timeout: 5000 }).exists) {",
      "  await t.click(logoSelect);",
      "  logoOpened = true;",
      "} else if (await logoCombo.with({ timeout: 5000 }).exists) {",
      "  await t.click(logoCombo);",
      "  logoOpened = true;",
      "}",
      "await t.expect(logoOpened).ok('Expected to open the logo selector');",
      "",
      "// Pick demo-2.webp; fall back to demo-1.jpg.",
      "const demo2 = Selector('option, [role=\"option\"], li').withText(/demo-2\\.webp/i).filterVisible().nth(0);",
      "const demo1 = Selector('option, [role=\"option\"], li').withText(/demo-1\\.jpg/i).filterVisible().nth(0);",
      "if (await demo2.with({ timeout: 5000 }).exists) {",
      "  await t.click(demo2);",
      "} else if (await demo1.with({ timeout: 5000 }).exists) {",
      "  await t.click(demo1);",
      "} else {",
      "  await t.expect(false).ok('Neither demo-2.webp nor demo-1.jpg was found in the logo list');",
      "}",
      "",
      "// Set Position to 'Top Right'.",
      "const positionSelect = Selector('select, [role=\"combobox\"]').withText(/position|top|right/i).filterVisible().nth(0);",
      "const posTopRight    = Selector('option, [role=\"option\"], li, button').withText(/top right/i).filterVisible().nth(0);",
      "if (await positionSelect.with({ timeout: 5000 }).exists) {",
      "  await t.click(positionSelect);",
      "}",
      "if (await posTopRight.with({ timeout: 5000 }).exists) {",
      "  await t.click(posTopRight);",
      "}",
      "",
      CLICK_NEXT,
      "",
      "await t.expect(Selector('body').withText(/step 5|review|generate/i).with({ timeout: 15000 }).exists).ok('Should have advanced to the Review/Generate step');",
    ].join("\n"),
  },

  // ── Case 5: Generate video and wait for terminal status ──────────────────────
  {
    caseId: "wizard-step5-generate",
    fixtureId: "video-wizard-flow",
    title: "Step 5 – Generate: click Generate video and wait for terminal status (≤20 min)",
    scriptType: "scripted",
    expected: {},
    script: [
      LOGIN_BLOCK,
      NAV_TO_JOB,
      "",
      "// Navigate to the final step (step 5 / Review).",
      "const step5Link = Selector('[data-step=\"5\"], button, a').withText(/^review$/i).filterVisible().nth(0);",
      "if (await step5Link.with({ timeout: 5000 }).exists) {",
      "  await t.click(step5Link);",
      "} else {",
      "  for (let step = 1; step <= 4; step++) {",
      "    const active = Selector('body').withText(new RegExp('step ' + step + ' of', 'i'));",
      "    if (await active.with({ timeout: 5000 }).exists) {",
      "      " + CLICK_NEXT,
      "      await t.wait(1500);",
      "    }",
      "  }",
      "}",
      "",
      "// Click 'Generate video' (or the e2e-only shortcut button if present).",
      "const e2eGenerate   = Selector('[data-testid=\"approve-generate-button\"]');",
      "const generateBtn   = Selector('button').withText(/generate video/i).filterVisible().nth(0);",
      "const createVideoBtn = Selector('button').withText(/create my video/i).filterVisible().nth(0);",
      "if (await e2eGenerate.with({ timeout: 5000 }).exists) {",
      "  await t.expect(e2eGenerate.hasAttribute('disabled')).notOk({ timeout: 60000 });",
      "  await t.eval(() => { const b = document.querySelector('[data-testid=\"approve-generate-button\"]'); if (b) b.click(); });",
      "} else if (await generateBtn.with({ timeout: 10000 }).exists) {",
      "  await t.expect(generateBtn.hasAttribute('disabled')).notOk({ timeout: 60000 });",
      "  await t.click(generateBtn);",
      "} else if (await createVideoBtn.with({ timeout: 5000 }).exists) {",
      "  await t.expect(createVideoBtn.hasAttribute('disabled')).notOk({ timeout: 60000 });",
      "  await t.click(createVideoBtn);",
      "} else {",
      "  await t.expect(false).ok('Could not find the Generate video / Create my video button on the final step');",
      "}",
      "",
      "// Poll until the job reaches a terminal status badge (Completed/Failed/Cancelled).",
      "// We poll the backend API from the browser using the authenticated session.",
      "let terminalStatus = 'unknown';",
      "const deadline = Date.now() + 1200000; // 20 minute safety margin",
      "while (Date.now() < deadline) {",
      "  const job = await t.eval(() => {",
      "    const id = window.location.pathname.split('/').filter(Boolean).pop();",
      "    const token = localStorage.getItem('auth_token');",
      "    return fetch('/api/v1/proxy/jobs/' + id, {",
      "      credentials: 'include',",
      "      headers: token ? { Authorization: 'Bearer ' + token } : {},",
      "    }).then((r) => r.json()).catch((e) => ({ status: 'poll-error', error: String(e) }));",
      "  });",
      "  terminalStatus = (job && typeof job.status === 'string') ? job.status : 'unknown';",
      "  if (terminalStatus === 'completed' || terminalStatus === 'failed' || terminalStatus === 'cancelled') break;",
      "  await t.wait(10000);",
      "}",
      "",
      "// Accept completed or cancelled; fail only on unexpected non-terminal or error.",
      "const terminalReached = terminalStatus === 'completed' || terminalStatus === 'failed' || terminalStatus === 'cancelled';",
      "await t.expect(terminalReached).ok('Video job did not reach a terminal status within 20 minutes. Last polled status: ' + terminalStatus);",
      "await t.expect(terminalStatus).eql('completed', 'Video job ended with status «' + terminalStatus + '» instead of «completed»');",
    ].join("\n"),
  },
];
