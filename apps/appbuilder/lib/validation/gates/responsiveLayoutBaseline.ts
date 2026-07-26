import { launchSmokeHarness, SmokeHarnessUnavailableError } from "../smoke/harness";
import { persistGateArtifact } from "../artifacts";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

const MOBILE_VIEWPORT = { width: 375, height: 812 };

/**
 * Mobile/responsive layout baseline against the DEMO preview (no
 * session/seed data required — works for any specification): the home page
 * renders with no horizontal scroll overflow at a 375px mobile viewport, and
 * primary navigation remains reachable (either visible directly or behind an
 * accessible menu toggle).
 */
export const responsiveLayoutBaselineGate: GateDefinition = {
  key: "responsive_layout_baseline",
  version: "1.0.0",
  mandatory: true,
  title: "Responsive layout baseline",
  description: "The home page has no horizontal overflow at a 375px mobile viewport, and primary navigation remains reachable.",
  async execute(ctx: GateContext): Promise<GateResult> {
    let harness;
    try {
      harness = await launchSmokeHarness(ctx.ownerPrincipalId);
    } catch (err) {
      if (err instanceof SmokeHarnessUnavailableError) {
        return { status: "infrastructure_error", failureCode: "smoke_harness_unavailable", failureMessage: err.message };
      }
      throw err;
    }

    try {
      await harness.page.setViewportSize(MOBILE_VIEWPORT);
      const url = `${harness.baseUrl}/apps/${encodeURIComponent(ctx.appId)}/preview`;
      await harness.page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });

      const overflow = await harness.page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > doc.clientWidth + 1; // +1px tolerance for subpixel rounding
      });

      const navReachable = await harness.page
        .locator("nav, [role='navigation']")
        .first()
        .isVisible()
        .catch(() => false);

      const screenshot = await harness.page.screenshot({ fullPage: false });
      await persistGateArtifact(ctx.db, {
        runId: ctx.runId,
        appId: ctx.appId,
        gateKey: "responsive_layout_baseline",
        artifact: { kind: "screenshot", label: "Mobile viewport home page", contentType: "image/png", body: screenshot },
      });

      const failures: { code: string; message: string }[] = [];
      if (overflow) failures.push({ code: "horizontal_overflow", message: "Home page has horizontal scroll overflow at a 375px mobile viewport." });
      if (!navReachable) failures.push({ code: "navigation_unreachable", message: "No visible <nav>/[role=navigation] element found at the mobile viewport." });

      if (failures.length > 0) {
        return {
          status: "failed",
          failureCode: "responsive_layout_violation",
          failureMessage: `${failures.length} responsive-layout violation(s) found.`,
          structuredFailures: redactFailures(failures),
        };
      }
      return { status: "passed", evidence: { viewport: MOBILE_VIEWPORT, navReachable } };
    } finally {
      await harness.close();
    }
  },
};
