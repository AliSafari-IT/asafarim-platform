import type { ReferenceResult } from "../../lib/tools/reference/schema";

/** Synthetic example for the internal shell-reference tool. No real data. */
export const shellReferenceExampleInput = `Team sync, Tuesday.
Mina will draft the onboarding email before Friday.
We agreed the signup form needs a clearer error for weak passwords.
Someone should check whether the analytics banner still shows on mobile.`;

export const shellReferenceExampleOutput: ReferenceResult = {
  items: [
    {
      text: "Draft the onboarding email (Mina, before Friday)",
      provenance: "extracted",
      source: "Mina will draft the onboarding email before Friday.",
    },
    {
      text: "Write a clearer weak-password error for the signup form",
      provenance: "extracted",
      source: "We agreed the signup form needs a clearer error for weak passwords.",
    },
    {
      text: "Check the analytics banner on mobile",
      provenance: "extracted",
      source: "Someone should check whether the analytics banner still shows on mobile.",
    },
    {
      text: "Review the new password error copy with whoever owns signup",
      provenance: "inferred",
    },
    {
      text: "Who checks the analytics banner, and by when?",
      provenance: "uncertain",
    },
  ],
};
