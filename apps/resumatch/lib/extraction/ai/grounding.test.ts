import { describe, expect, it } from "vitest";
import { emptyProfile } from "../../profile/contract";
import { groundExperienceSummaries } from "./grounding";

const SOURCE = `Jane Doe

EXPERIENCE
ICT Developer at Acme Corp
2020-01 to 2023-12
Built full-stack web applications with ASP.NET Core and React.
Reduced page load time by 40%.`;

function withSummary(summary: string | null) {
  return {
    ...emptyProfile(),
    experience: [
      {
        title: "ICT Developer",
        employer: "Acme Corp",
        startedOn: "2020-01",
        endedOn: "2023-12",
        isCurrent: false,
        summary,
      },
    ],
  };
}

describe("groundExperienceSummaries", () => {
  it("keeps a summary whose notable tokens all trace back to the source text", () => {
    const content = withSummary("Built full-stack applications with ASP.NET Core and React, cutting load time by 40%.");
    const result = groundExperienceSummaries(content, SOURCE);
    expect(result.experience[0].summary).not.toBeNull();
  });

  it("drops a summary that mentions a technology not present anywhere in the source", () => {
    const content = withSummary("Led a team using Kubernetes and Terraform to deploy microservices.");
    const result = groundExperienceSummaries(content, SOURCE);
    expect(result.experience[0].summary).toBeNull();
  });

  it("drops a summary that invents a metric not present in the source", () => {
    const content = withSummary("Improved performance by 95% across the platform.");
    const result = groundExperienceSummaries(content, SOURCE);
    expect(result.experience[0].summary).toBeNull();
  });

  it("leaves a null summary as null, and other fields untouched", () => {
    const content = withSummary(null);
    const result = groundExperienceSummaries(content, SOURCE);
    expect(result.experience[0].summary).toBeNull();
    expect(result.experience[0].employer).toBe("Acme Corp");
  });

  it("is a no-op when no experience entry has a summary at all", () => {
    const content = emptyProfile();
    const result = groundExperienceSummaries(content, SOURCE);
    expect(result).toEqual(content);
  });
});
