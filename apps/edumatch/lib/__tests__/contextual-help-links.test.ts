import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getArticle } from "../help-content";

/**
 * Every screen this PR wired a ContextualHelpLink onto, and the article it
 * should point at. Sourced from the actual file contents (not re-typed
 * here) so a future edit that changes one without the other fails this
 * test instead of silently linking to nothing.
 */
const SCREENS = [
  ["app/student/inquiry/new/page.tsx", "student", "ask-a-question"],
  ["app/student/inquiry/[id]/page.tsx", "student", "ask-a-question"],
  ["app/student/inquiry/[id]/quotes/page.tsx", "student", "tutor-quotes-and-booking"],
  ["app/student/checkout/[quoteId]/page.tsx", "student", "tutor-quotes-and-booking"],
  ["app/student/bookings/page.tsx", "student", "bookings-and-support"],
  ["app/tutor/profile/page.tsx", "tutor", "getting-started"],
  ["app/tutor/verification/page.tsx", "tutor", "getting-started"],
  ["app/tutor/requests/page.tsx", "tutor", "finding-and-quoting-requests"],
  ["app/tutor/bookings/page.tsx", "tutor", "bookings-and-disputes"],
  ["app/tutor/connect/onboard/page.tsx", "tutor", "payments-and-settings"],
  ["app/tutor/earnings/page.tsx", "tutor", "payments-and-settings"],
] as const;

describe("Contextual help links", () => {
  it.each(SCREENS)("%s links to a real %s/%s article", (file, audience, slug) => {
    const expectedHref = `/help/${audience === "tutor" ? "tutors" : "students"}/${slug}`;
    const source = readFileSync(resolve(__dirname, "../../", file), "utf8");

    expect(source).toContain(`<ContextualHelpLink href="${expectedHref}"`);
    expect(getArticle(audience, slug)).toBeDefined();
  });

  it("no ContextualHelpLink on these screens points at bare /help", () => {
    for (const [file] of SCREENS) {
      const source = readFileSync(resolve(__dirname, "../../", file), "utf8");
      expect(source).not.toContain('<ContextualHelpLink href="/help"');
    }
  });
});
