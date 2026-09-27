import { splitSources } from "../../lib/tools/test-plan/sources";
import { TEST_PLAN_SCHEMA_VERSION, type TestPlan, type TestPlanInputRaw } from "../../lib/tools/test-plan/schema";

/**
 * Synthetic example for Requirements → Test Plan. It deliberately contains a
 * contradiction (R5 vs R6), a vague requirement (R9), and gaps, so the
 * example demonstrates open questions, traceability, and inferred risks —
 * not just a tidy happy path. No real product or customer data.
 */
export const testPlanExampleRequirement =
  "As a registered user who has forgotten my password, I want to reset it through a link sent to my email so that I can sign in again.";

export const testPlanExampleCriteria = `- The "Forgot password?" link is shown on the sign-in page.
- Submitting an email address always shows the same confirmation message, whether or not an account exists.
- The reset link expires after 30 minutes.
- A reset link can only be used once.
- If the reset page fails to load, the user can open the same link again.
- The new password must be at least 12 characters long.
- After a successful reset, all other active sessions are signed out.
- The reset flow should be fast.`;

export const testPlanExampleInput: TestPlanInputRaw = {
  requirement: testPlanExampleRequirement,
  title: "Password reset by email",
  acceptanceCriteria: testPlanExampleCriteria,
  platforms: "Web: current Chrome, Firefox, Safari; mobile Safari",
};

export const testPlanExampleOutput: TestPlan = {
  schemaVersion: TEST_PLAN_SCHEMA_VERSION,
  title: "Password reset by email",
  summary:
    "A signed-out registered user requests a reset link by email, opens it within 30 minutes, and sets a new password of at least 12 characters. The flow must not reveal whether an account exists and signs out other sessions afterwards.",
  actors: ["Registered user (signed out)", "Email delivery"],
  goals: ["Regain access to the account", "Keep the account secure while doing so"],
  sources: splitSources(testPlanExampleRequirement, testPlanExampleCriteria),
  questions: [
    {
      id: "Q1",
      kind: "contradiction",
      question:
        "R5 says a link works only once, but R6 lets the user open the same link again if the page fails to load. Does a failed page load count as using the link?",
      sourceIds: ["R5", "R6"],
    },
    {
      id: "Q2",
      kind: "ambiguity",
      question: "What does \"fast\" mean here — how soon the email arrives, how quickly the pages respond, or both? A measurable target is needed to test it.",
      sourceIds: ["R9"],
    },
    {
      id: "Q3",
      kind: "missing",
      question: "Are there password rules beyond length, such as rejecting the current password or known-breached passwords?",
      sourceIds: ["R7"],
    },
    {
      id: "Q4",
      kind: "missing",
      question: "Is there a limit on how many reset emails can be requested for one address in a given time?",
      sourceIds: ["R3"],
    },
  ],
  scenarios: [
    {
      id: "TC-01",
      title: "Reset the password with a valid emailed link",
      category: "happy_path",
      priority: "high",
      basis: "requirement",
      sourceIds: ["R1", "R2"],
      preconditions: ["A registered account exists for a test mailbox", "The user is signed out"],
      steps: [
        "Open the sign-in page and select \"Forgot password?\"",
        "Enter the registered email address and submit",
        "Open the reset link from the email",
        "Enter and confirm a new password of 12 or more characters",
        "Sign in with the new password",
      ],
      expected: "The password is changed: sign-in succeeds with the new password and fails with the old one.",
    },
    {
      id: "TC-02",
      title: "The same confirmation appears for registered and unknown addresses",
      category: "permissions_security",
      priority: "high",
      basis: "requirement",
      sourceIds: ["R3"],
      preconditions: ["One registered and one unregistered test address"],
      steps: ["Submit the unregistered address", "Note the confirmation message", "Submit the registered address", "Compare the two messages and response timing"],
      expected: "Both submissions show the identical message, with no difference that reveals which address has an account.",
    },
    {
      id: "TC-03",
      title: "The link works just before 30 minutes and is rejected after",
      category: "boundary",
      priority: "high",
      basis: "requirement",
      sourceIds: ["R4"],
      preconditions: ["Test clock or configurable expiry available"],
      steps: ["Request a reset link", "Open it at 29 minutes and cancel", "Request a new link", "Open it at 31 minutes"],
      expected: "The link opens at 29 minutes. At 31 minutes the page says the link has expired and offers to send a new one.",
    },
    {
      id: "TC-04",
      title: "A used link can't be used again",
      category: "negative",
      priority: "high",
      basis: "requirement",
      sourceIds: ["R5"],
      preconditions: ["A password was just reset with a link"],
      steps: ["Open the same reset link again", "Try to set another new password"],
      expected: "The link is rejected with a clear message and the password stays as set in the first reset.",
    },
    {
      id: "TC-05",
      title: "11-character passwords are rejected, 12-character passwords accepted",
      category: "boundary",
      priority: "medium",
      basis: "requirement",
      sourceIds: ["R7"],
      preconditions: ["A valid, unused reset link"],
      steps: ["Enter an 11-character password and submit", "Enter a 12-character password and submit"],
      expected: "The 11-character password is refused with a message stating the minimum length; the 12-character password is accepted.",
    },
    {
      id: "TC-06",
      title: "Other signed-in sessions are signed out after a reset",
      category: "permissions_security",
      priority: "high",
      basis: "requirement",
      sourceIds: ["R8"],
      preconditions: ["The same account is signed in on a second browser"],
      steps: ["Reset the password from the first browser", "Refresh or navigate in the second browser"],
      expected: "The second browser's session has ended and it is asked to sign in again.",
    },
    {
      id: "TC-07",
      title: "Reopening the link after a failed page load",
      category: "resilience",
      priority: "medium",
      basis: "inferred",
      sourceIds: ["R5", "R6"],
      assumption: "Assumes a failed page load does not use up the link. This depends on the answer to Q1 — confirm before relying on this scenario.",
      preconditions: ["A valid, unused reset link", "A way to interrupt the network while the page loads"],
      steps: ["Open the link and cut the connection before the page finishes loading", "Restore the connection and open the same link again"],
      expected: "The reset page loads and the password can be set.",
    },
    {
      id: "TC-08",
      title: "The whole flow works with a keyboard and screen reader",
      category: "accessibility",
      priority: "medium",
      basis: "inferred",
      sourceIds: [],
      assumption: "The requirement doesn't mention accessibility; assumes the flow should meet WCAG 2.2 AA like the rest of the product.",
      preconditions: ["Screen reader running (e.g. NVDA or VoiceOver)"],
      steps: [
        "Complete the flow using only the keyboard",
        "Submit a too-short password",
        "Listen to how the error is announced",
      ],
      expected: "Every step is reachable by keyboard with visible focus, and errors are announced and linked to their field.",
    },
    {
      id: "TC-09",
      title: "The flow works in each browser in scope",
      category: "compatibility",
      priority: "low",
      basis: "inferred",
      sourceIds: [],
      assumption: "Uses the platform scope given with the requirement; the acceptance criteria don't list browsers themselves.",
      preconditions: ["Access to current Chrome, Firefox, Safari, and mobile Safari"],
      steps: ["Run TC-01 in each browser", "Open the email link on mobile Safari from the mail app"],
      expected: "The reset completes in every browser, including when the link opens from a mobile mail app.",
    },
    {
      id: "TC-10",
      title: "Repeated reset requests are throttled without revealing accounts",
      category: "permissions_security",
      priority: "medium",
      basis: "inferred",
      sourceIds: ["R3"],
      assumption: "Assumes requests should be rate-limited; the text doesn't say (see Q4).",
      preconditions: ["A registered test address"],
      steps: ["Submit a reset request for the same address ten times within a minute"],
      expected: "Further requests are slowed or refused with the same neutral message, and the mailbox is not flooded.",
    },
  ],
};
