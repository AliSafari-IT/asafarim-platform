import { describe, it, expect } from "vitest";
import { DefaultFakeProvider } from "./defaultFake";

const opts = { requestId: "test-1" };
const baseInput = (prompt: string) => ({
  prompt,
  requestedStarterFamily: "blank",
  clarificationHistory: [],
  availableTemplateIds: ["blank", "task_management", "crm"],
});

describe("DefaultFakeProvider", () => {
  it("routes a construction-flavored prompt to the task_management fixture end to end", async () => {
    const provider = new DefaultFakeProvider();
    const analysis = await provider.analyzeRequirements(baseInput("Build a tracker for my construction crew's job sites"), opts);
    expect(analysis.analysis.entities.some((e) => e.name.toLowerCase().includes("project"))).toBe(true);
    const template = await provider.recommendTemplate(
      { analysis: analysis.analysis, availableTemplates: [], requestedStarterFamily: "task_management" },
      opts,
    );
    expect(template.recommendation.templateId).toBe("task_management");
  });

  it("routes a CRM-flavored prompt to the crm fixture", async () => {
    const provider = new DefaultFakeProvider();
    await provider.analyzeRequirements(baseInput("Track our sales pipeline and deal stages"), opts);
    const template = await provider.recommendTemplate(
      { analysis: {} as any, availableTemplates: [], requestedStarterFamily: "crm" },
      opts,
    );
    expect(template.recommendation.templateId).toBe("crm");
  });

  it("falls back to the generic blank scenario for an unrecognized prompt", async () => {
    const provider = new DefaultFakeProvider();
    await provider.analyzeRequirements(baseInput("Something entirely unrelated to any fixture keyword"), opts);
    const template = await provider.recommendTemplate(
      { analysis: {} as any, availableTemplates: [], requestedStarterFamily: "blank" },
      opts,
    );
    expect(template.recommendation.templateId).toBe("blank");
  });

  it("throws a clear ProviderError if recommendTemplate is called before analyzeRequirements", async () => {
    const provider = new DefaultFakeProvider();
    await expect(
      provider.recommendTemplate({ analysis: {} as any, availableTemplates: [], requestedStarterFamily: "blank" }, opts),
    ).rejects.toMatchObject({ code: "unknown" });
  });
});
