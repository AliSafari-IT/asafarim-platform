/**
 * The commercial gate (docs: M14 / compliance/decisions.md). Payment
 * acceptance and paid-plan activation are **refused** until the operating
 * entity + commercial license are in place, signalled by
 * `TASKSAI_COMMERCIAL_LICENSE_SIGNED=true`. Until then the app runs on the
 * free plan only, no checkout, no invoices. This is a code guard on top of
 * the documented gate, not a substitute for the legal work.
 */
export class LicenseGateError extends Error {
  constructor() {
    super(
      "TasksAI billing is not open. Paid plans require the operating entity and a " +
        "commercial license to be in place (compliance/decisions.md).",
    );
    this.name = "LicenseGateError";
  }
}

export function isBillingOpen(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TASKSAI_COMMERCIAL_LICENSE_SIGNED === "true";
}

export function assertBillingOpen(env?: NodeJS.ProcessEnv): void {
  if (!isBillingOpen(env)) throw new LicenseGateError();
}

/** Stripe is only wired when billing is open AND a test/live key is set. */
export function stripeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return isBillingOpen(env) && Boolean(env.STRIPE_SECRET_KEY);
}
