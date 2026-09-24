import { describe, expect, it } from "vitest";
import { emptyProfile } from "../../profile/contract";
import { groundExperienceSummaries, groundHeadlineAndSummary } from "./grounding";

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

describe("groundHeadlineAndSummary", () => {
  function withProse(headline: string | null, summary: string | null) {
    return { ...emptyProfile(), headline, summary };
  }

  it("keeps a well-grounded headline and summary unchanged", () => {
    const content = withProse(
      "Full-Stack Developer · React · ASP.NET Core",
      "Experienced developer building web applications with ASP.NET Core and React at Acme Corp. Cut page load time by 40%.",
    );
    const result = groundHeadlineAndSummary(content, SOURCE);
    expect(result.headline).toBe(content.headline);
    expect(result.summary).toBe(content.summary);
  });

  it("does not count fragment-initial capitals — Title Case and generic openers are not proper nouns", () => {
    // "Senior", "Results-driven" appear nowhere in SOURCE; only their
    // position (start of a fragment) keeps an honest AI summary from being
    // dropped wholesale.
    const content = withProse("Senior Engineer · React", "Results-driven engineer. Skilled with React.");
    const result = groundHeadlineAndSummary(content, SOURCE);
    expect(result.headline).not.toBeNull();
    expect(result.summary).not.toBeNull();
  });

  it("drops a summary that invents a scale-of-impact number", () => {
    const content = withProse(null, "Developer who led a team of 50 engineers at Acme Corp.");
    expect(groundHeadlineAndSummary(content, SOURCE).summary).toBeNull();
  });

  it("drops a summary naming a mid-sentence technology absent from the source", () => {
    const content = withProse(null, "Developer who deployed services on Kubernetes at Acme Corp.");
    expect(groundHeadlineAndSummary(content, SOURCE).summary).toBeNull();
  });

  it("drops a headline naming a distinctively-shaped technology absent from the source", () => {
    // "Node.js" has an interior dot — unmistakably a tech name in any
    // capitalization, and the entry after a "·" is exactly where a
    // fabricated skill would sit.
    const content = withProse("Full-Stack Developer · Node.js", null);
    expect(groundHeadlineAndSummary(content, SOURCE).headline).toBeNull();
  });

  it("drops a headline that invents a number", () => {
    const content = withProse("Full-Stack Developer · 15+ Years", null);
    expect(groundHeadlineAndSummary(content, SOURCE).headline).toBeNull();
  });

  it("KNOWN GAP: a plain-word fabricated tech name in a headline is not caught", () => {
    // Documents the accepted limitation from the ungroundedProseTokenCount
    // doc comment: "Terraform" is shaped like any Title Case word
    // ("Engineer"), so a headline can't tell them apart. The same claim in
    // a summary IS caught — see the mid-sentence Kubernetes test above. If
    // this test ever starts failing because the headline check got
    // stronger, that's an improvement: update this test, not the code.
    const content = withProse("Full-Stack Developer · Terraform", null);
    expect(groundHeadlineAndSummary(content, SOURCE).headline).not.toBeNull();
  });

  it("checks a grounded word at a sentence end without needing the source to punctuate it identically", () => {
    // SOURCE has "React." but the summary ends its sentence with "React" —
    // and separately writes "React." where the source has "React" mid-line.
    const content = withProse(null, "Built interfaces with ASP.NET Core and React. Also used React.");
    expect(groundHeadlineAndSummary(content, SOURCE).summary).not.toBeNull();
  });

  it("drops only the offending field, leaving the grounded one intact", () => {
    const content = withProse("Full-Stack Developer · React", "Developer who led a team of 50 engineers.");
    const result = groundHeadlineAndSummary(content, SOURCE);
    expect(result.headline).toBe("Full-Stack Developer · React");
    expect(result.summary).toBeNull();
  });

  it("does not touch experience summaries (regression guard)", () => {
    const content = {
      ...withProse("Full-Stack Developer · React", null),
      experience: [
        {
          title: "ICT Developer",
          employer: "Acme Corp",
          startedOn: "2020-01",
          endedOn: "2023-12",
          isCurrent: false,
          summary: "Led a team using Kubernetes.",
        },
      ],
    };
    // groundHeadlineAndSummary must leave the (ungrounded) experience
    // summary alone — that is groundExperienceSummaries' job, unchanged.
    expect(groundHeadlineAndSummary(content, SOURCE).experience[0].summary).toBe("Led a team using Kubernetes.");
  });

  it("is a no-op when there is no headline or summary", () => {
    const content = withProse(null, null);
    expect(groundHeadlineAndSummary(content, SOURCE)).toEqual(content);
  });
});
