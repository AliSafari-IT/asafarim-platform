import { describe, expect, it } from "vitest";
import { estimateMonthlyCents, hasFeature, meterView, PLANS, wouldExceed } from "./plans";
import { assertBillingOpen, isBillingOpen, LicenseGateError, stripeConfigured } from "./gate";
import { mapStatus, tierFromProductName, verifyStripeSignature } from "./stripe";
import { createHmac } from "node:crypto";

describe("plans", () => {
  it("free has no AI/automations; business has both; enterprise is unlimited", () => {
    expect(hasFeature("free", "ai")).toBe(false);
    expect(hasFeature("pro", "ai")).toBe(true);
    expect(hasFeature("pro", "automations")).toBe(false);
    expect(hasFeature("business", "automations")).toBe(true);
    expect(PLANS.enterprise.allowances.ai_proposals).toBe(-1);
  });

  it("wouldExceed respects included + topUp and never blocks unlimited", () => {
    expect(wouldExceed("pro", "ai_proposals", 199, 0, 1)).toBe(false);
    expect(wouldExceed("pro", "ai_proposals", 200, 0, 1)).toBe(true);
    expect(wouldExceed("pro", "ai_proposals", 200, 50, 1)).toBe(false); // top-up
    expect(wouldExceed("enterprise", "ai_proposals", 1e9, 0, 1)).toBe(false);
  });

  it("meterView reports remaining, overage and pressure", () => {
    const v = meterView("pro", "ai_proposals", 180, 0);
    expect(v.remaining).toBe(20);
    expect(v.overage).toBe(false);
    expect(v.pressure).toBeCloseTo(0.9, 5);
    expect(meterView("pro", "ai_proposals", 250, 0).overage).toBe(true);
    expect(meterView("enterprise", "ai_proposals", 999, 0).limit).toBe(Infinity);
  });

  it("estimateMonthlyCents = per-seat price × billable seats; enterprise is null", () => {
    expect(estimateMonthlyCents("pro", 10)).toBe(8000);
    expect(estimateMonthlyCents("pro", 100)).toBe(25 * 800); // capped at maxSeats
    expect(estimateMonthlyCents("enterprise", 50)).toBeNull();
  });
});

describe("license gate", () => {
  it("billing is closed unless TASKSAI_COMMERCIAL_LICENSE_SIGNED=true", () => {
    expect(isBillingOpen({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isBillingOpen({ TASKSAI_COMMERCIAL_LICENSE_SIGNED: "true" } as never)).toBe(true);
    expect(() => assertBillingOpen({} as NodeJS.ProcessEnv)).toThrow(LicenseGateError);
  });
  it("stripeConfigured requires both the gate and a key", () => {
    expect(stripeConfigured({ TASKSAI_COMMERCIAL_LICENSE_SIGNED: "true" } as never)).toBe(false);
    expect(stripeConfigured({ TASKSAI_COMMERCIAL_LICENSE_SIGNED: "true", STRIPE_SECRET_KEY: "sk_test_x" } as never)).toBe(true);
    expect(stripeConfigured({ STRIPE_SECRET_KEY: "sk_test_x" } as never)).toBe(false);
  });
});

describe("stripe helpers", () => {
  it("verifyStripeSignature accepts a fresh valid sig, rejects stale/tampered", () => {
    const secret = "whsec_test";
    const body = '{"id":"evt_1"}';
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    expect(verifyStripeSignature(body, `t=${t},v1=${v1}`, secret)).toBe(true);
    expect(verifyStripeSignature(body + " ", `t=${t},v1=${v1}`, secret)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t - 9999},v1=${v1}`, secret)).toBe(false);
  });
  it("maps status + tier", () => {
    expect(mapStatus("trialing")).toBe("trialing");
    expect(mapStatus("unpaid")).toBe("past_due");
    expect(tierFromProductName("TasksAI business")).toBe("business");
  });
});
