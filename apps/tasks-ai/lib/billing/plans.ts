/**
 * Packaging (docs: M14). Pure — the plan matrix, entitlement checks, and
 * usage-transparency maths are all here and unit-tested. Prices are
 * hypotheses from the M00 charter, in EUR cents per seat per month.
 */
export type PlanTier = "free" | "pro" | "business" | "enterprise";

export interface Plan {
  tier: PlanTier;
  priceCentsPerSeat: number | null; // null = custom / contact
  maxSeats: number | null;
  maxProjects: number | null;
  features: {
    ai: boolean;
    automations: boolean;
    integrations: boolean;
    analytics: boolean;
    apiTokens: boolean;
    sso: boolean; // enterprise only (M15 delivers it)
  };
  /** monthly included allowances; -1 = unlimited */
  allowances: { ai_proposals: number; automation_runs: number };
}

export const PLANS: Record<PlanTier, Plan> = {
  free: {
    tier: "free",
    priceCentsPerSeat: 0,
    maxSeats: 3,
    maxProjects: 2,
    features: { ai: false, automations: false, integrations: false, analytics: false, apiTokens: false, sso: false },
    allowances: { ai_proposals: 0, automation_runs: 0 },
  },
  pro: {
    tier: "pro",
    priceCentsPerSeat: 800,
    maxSeats: 25,
    maxProjects: null,
    features: { ai: true, automations: false, integrations: false, analytics: false, apiTokens: true, sso: false },
    allowances: { ai_proposals: 200, automation_runs: 0 },
  },
  business: {
    tier: "business",
    priceCentsPerSeat: 1400,
    maxSeats: null,
    maxProjects: null,
    features: { ai: true, automations: true, integrations: true, analytics: true, apiTokens: true, sso: false },
    allowances: { ai_proposals: 1000, automation_runs: 5000 },
  },
  enterprise: {
    tier: "enterprise",
    priceCentsPerSeat: null,
    maxSeats: null,
    maxProjects: null,
    features: { ai: true, automations: true, integrations: true, analytics: true, apiTokens: true, sso: true },
    allowances: { ai_proposals: -1, automation_runs: -1 },
  },
};

export type Feature = keyof Plan["features"];
export type Meter = keyof Plan["allowances"];

export function planFor(tier: PlanTier): Plan {
  return PLANS[tier];
}

export function hasFeature(tier: PlanTier, feature: Feature): boolean {
  return PLANS[tier].features[feature];
}

export interface MeterView {
  meter: Meter;
  used: number;
  included: number;
  topUp: number;
  limit: number; // included + topUp, or Infinity for unlimited
  remaining: number;
  overage: boolean;
  /** what pushes cost: which meter is closest to its limit */
  pressure: number; // 0..1
}

export function meterView(
  tier: PlanTier,
  meter: Meter,
  used: number,
  topUp = 0,
): MeterView {
  const included = PLANS[tier].allowances[meter];
  if (included === -1) {
    return { meter, used, included: -1, topUp, limit: Infinity, remaining: Infinity, overage: false, pressure: 0 };
  }
  const limit = included + topUp;
  const remaining = Math.max(0, limit - used);
  return {
    meter,
    used,
    included,
    topUp,
    limit,
    remaining,
    overage: used >= limit,
    pressure: limit === 0 ? (used > 0 ? 1 : 0) : Math.min(1, used / limit),
  };
}

/** Would consuming `n` more units of `meter` exceed the plan's limit? */
export function wouldExceed(tier: PlanTier, meter: Meter, used: number, topUp: number, n = 1): boolean {
  const included = PLANS[tier].allowances[meter];
  if (included === -1) return false;
  return used + n > included + topUp;
}

/** Estimated monthly bill in cents for a workspace on `tier` with `seats`. */
export function estimateMonthlyCents(tier: PlanTier, seats: number): number | null {
  const p = PLANS[tier];
  if (p.priceCentsPerSeat == null) return null;
  const billable = p.maxSeats ? Math.min(seats, p.maxSeats) : seats;
  return p.priceCentsPerSeat * Math.max(0, billable);
}
