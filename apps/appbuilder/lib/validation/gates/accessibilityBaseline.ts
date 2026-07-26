import { launchSmokeHarness, SmokeHarnessUnavailableError } from "../smoke/harness";
import { persistGateArtifact } from "../artifacts";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactDiagnostics, redactFailures } from "../redaction";

const MAX_PAGES_SCANNED = 3;

/**
 * WCAG 2.1 AA accessibility baseline via `@axe-core/playwright`, run
 * against the app's DEMO preview (no session/seed data required — works for
 * any specification, not only the task-management fixture). This is the
 * gate that would have caught the M09-era shared `Badge` success-tone
 * contrast regression (fixed alongside this milestone —
 * see packages/ui/src/styles/components.css) before it ever reached a
 * generated app.
 */
export const accessibilityBaselineGate: GateDefinition = {
  key: "accessibility_baseline",
  version: "1.0.0",
  mandatory: true,
  title: "Accessibility baseline",
  description: "No WCAG 2.1 AA serious/critical violations (axe-core) on the home page and up to two additional pages.",
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
      const { default: AxeBuilder } = await import("@axe-core/playwright");
      const activePages = ctx.specPayload.pages.filter((p) => !p.archived).slice(0, MAX_PAGES_SCANNED);
      const failures: { code: string; message: string }[] = [];
      const evidence: Record<string, unknown> = { pagesScanned: [] as string[] };

      for (const page of activePages) {
        const url = `${harness.baseUrl}/apps/${encodeURIComponent(ctx.appId)}/preview${page.path ? `/${page.path}` : ""}`;
        await harness.page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
        const results = await new AxeBuilder({ page: harness.page as never })
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();
        (evidence.pagesScanned as string[]).push(page.id);

        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        for (const violation of serious) {
          failures.push({ code: `axe:${violation.id}`, message: `Page "${page.name}": ${violation.help} (${violation.nodes.length} node(s), impact: ${violation.impact})` });
        }
      }

      await persistGateArtifact(ctx.db, {
        runId: ctx.runId,
        appId: ctx.appId,
        gateKey: "accessibility_baseline",
        artifact: { kind: "report", label: "axe-core violations summary", contentType: "application/json", body: JSON.stringify(redactDiagnostics({ failures })) },
      });

      if (failures.length > 0) {
        return {
          status: "failed",
          failureCode: "accessibility_violation",
          failureMessage: `${failures.length} serious/critical accessibility violation(s) found.`,
          structuredFailures: redactFailures(failures),
          evidence,
        };
      }
      return { status: "passed", evidence };
    } finally {
      await harness.close();
    }
  },
};
