import { describe, expect, it } from "vitest";
import {
  type PositionedItem,
  detectColumnBoundaries,
  detectMarginLabels,
  reconstructPage,
} from "./pdfLayout";

const PAGE_WIDTH = 596;

function item(text: string, x: number, y: number, width: number): PositionedItem {
  return { text, x, y, width, height: 8 };
}

/**
 * A sidebar-plus-body CV, drawn the way a PDF producer emits one: the two
 * columns interleaved, because drawing order is not reading order.
 */
function twoColumnPage(): PositionedItem[] {
  return [
    // Full-width header, spanning the gutter — the reason a strict
    // "nothing crosses the gutter" rule finds no columns at all.
    item("SAM DE VRIES", 60, 800, 470),
    // Interleaved body: sidebar at x=25, main column at x=250.
    item("SKILLS", 25, 700, 60),
    item("Senior Engineer at Example", 250, 700, 280),
    item("TypeScript, PostgreSQL", 25, 685, 150),
    item("2020 - present", 250, 685, 280),
    item("Docker, Kubernetes", 25, 670, 150),
    item("Built and maintained services", 250, 670, 280),
    item("LANGUAGES", 25, 640, 80),
    item("Engineer at Other", 250, 640, 280),
    item("Dutch native", 25, 625, 150),
    item("2016 - 2020", 250, 625, 280),
  ];
}

describe("column detection", () => {
  it("finds the gutter in a two-column page", () => {
    const boundaries = detectColumnBoundaries(twoColumnPage(), PAGE_WIDTH);
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]).toBeGreaterThan(175);
    expect(boundaries[0]).toBeLessThan(250);
  });

  it("is not defeated by a full-width heading crossing the gutter", () => {
    // The name spans both columns. Requiring a completely empty band found
    // no columns on a real CV for exactly this reason.
    const withoutHeader = twoColumnPage().filter((entry) => entry.text !== "SAM DE VRIES");
    expect(detectColumnBoundaries(withoutHeader, PAGE_WIDTH)).toHaveLength(1);
    expect(detectColumnBoundaries(twoColumnPage(), PAGE_WIDTH)).toHaveLength(1);
  });

  it("finds no columns in a single-column page", () => {
    const items = Array.from({ length: 20 }, (_, index) =>
      item(`Line ${index} of an ordinary single column document`, 60, 700 - index * 15, 420),
    );
    expect(detectColumnBoundaries(items, PAGE_WIDTH)).toEqual([]);
  });

  it("does not split off a lone marginal note", () => {
    // One item to the left of a wide gap is a page number or a margin note,
    // not a column, and splitting there would fragment the document.
    const items = [
      item("7", 20, 40, 6),
      ...Array.from({ length: 20 }, (_, index) =>
        item(`Body line ${index}`, 200, 700 - index * 15, 300),
      ),
    ];
    expect(detectColumnBoundaries(items, PAGE_WIDTH)).toEqual([]);
  });

  it("ignores gaps too narrow to be a gutter", () => {
    // A consistent indent is not a column separator.
    const items = Array.from({ length: 20 }, (_, index) =>
      index % 2 === 0
        ? item(`Heading ${index}`, 60, 700 - index * 15, 100)
        : item(`Indented body ${index}`, 172, 700 - index * 15, 300),
    );
    expect(detectColumnBoundaries(items, PAGE_WIDTH)).toEqual([]);
  });
});

describe("reading order", () => {
  it("reads each column fully before moving to the next", () => {
    const text = reconstructPage(twoColumnPage(), PAGE_WIDTH);
    const lines = text.split("\n");

    // The sidebar's own content must be contiguous: SKILLS immediately
    // followed by the skills, not by the main column's first role.
    const skillsAt = lines.indexOf("SKILLS");
    expect(skillsAt).toBeGreaterThanOrEqual(0);
    expect(lines[skillsAt + 1]).toBe("TypeScript, PostgreSQL");
    expect(lines[skillsAt + 2]).toBe("Docker, Kubernetes");

    const languagesAt = lines.indexOf("LANGUAGES");
    expect(languagesAt).toBeGreaterThan(skillsAt);
    expect(lines[languagesAt + 1]).toBe("Dutch native");
  });

  it("never merges two columns onto one line", () => {
    // The failure this replaced: "ABOUT ME and React, implementing scalable
    // back-end services" — a sidebar heading and body text sharing a baseline.
    for (const line of reconstructPage(twoColumnPage(), PAGE_WIDTH).split("\n")) {
      expect(line).not.toMatch(/SKILLS.+Senior Engineer/);
      expect(line).not.toMatch(/LANGUAGES.+Engineer at Other/);
    }
  });

  it("orders a single column top to bottom", () => {
    const items = [
      item("third", 60, 600, 100),
      item("first", 60, 700, 100),
      item("second", 60, 650, 100),
    ];
    expect(reconstructPage(items, PAGE_WIDTH).split("\n")).toEqual(["first", "second", "third"]);
  });

  it("joins runs on one line, inserting a space only at a real gap", () => {
    // pdf.js splits a visual line into runs, sometimes mid-word.
    const items = [item("Type", 60, 700, 30), item("Script", 90, 700, 34), item("and SQL", 140, 700, 50)];
    expect(reconstructPage(items, PAGE_WIDTH)).toBe("TypeScript and SQL");
  });

  it("returns nothing for a page with no text", () => {
    expect(reconstructPage([], PAGE_WIDTH)).toBe("");
    expect(reconstructPage([item("   ", 10, 10, 10)], PAGE_WIDTH)).toBe("");
  });
});

describe("margin labels", () => {
  /**
   * Some CVs set each section label in the left margin *beside* its block
   * rather than above it, so the label's baseline lands partway down the
   * text it introduces. Three runs out of sixty on the reported document —
   * far too little to be a column, yet carrying every heading there is.
   */
  function marginLabelPage(): PositionedItem[] {
    return [
      // About block, with its label beside the second line.
      item("Full-stack developer skilled in .NET and React,", 180, 700, 330),
      item("ABOUT ME", 27, 685, 88),
      item("with a focus on clean architecture.", 180, 685, 330),
      item("Delivered work across the whole lifecycle.", 180, 670, 330),
      // Experience block, label beside the third line.
      item("ExampleTech | Geel, Belgium", 180, 620, 330),
      item("Scientific App Developer", 180, 605, 330),
      item("EXPERIENCE", 22, 590, 103),
      item("December 2020 - December 2023", 180, 590, 330),
      item("Built and maintained web applications.", 180, 575, 330),
      // Education block.
      item("Informatics - Programming", 180, 520, 330),
      item("EDUCATION", 27, 505, 100),
      item("Hogeschool Example  2018 - 2020", 180, 505, 330),
      // Enough body text for the labels to be the small minority they are on
      // a real page — three runs out of sixty on the reported document. A
      // sparser fixture makes the labels 25% of the page, which is a
      // document made of headings, not a CV.
      ...Array.from({ length: 24 }, (_, index) =>
        item(`Further detail line ${index} of the education block.`, 180, 490 - index * 15, 330),
      ),
    ];
  }

  it("places each label above the block it introduces, not inside it", () => {
    const lines = reconstructPage(marginLabelPage(), PAGE_WIDTH).split("\n");

    // The failure this replaced: "ABOUT ME with a focus on clean
    // architecture" — the label merged onto the line it shared a baseline
    // with, two lines into its own section.
    expect(lines[0]).toBe("ABOUT ME");
    expect(lines[1]).toContain("Full-stack developer");

    const experienceAt = lines.indexOf("EXPERIENCE");
    expect(experienceAt).toBeGreaterThan(0);
    expect(lines[experienceAt + 1]).toContain("ExampleTech");
    expect(lines[experienceAt + 2]).toContain("Scientific App Developer");
  });

  it("never leaves a label merged onto a content line", () => {
    for (const line of reconstructPage(marginLabelPage(), PAGE_WIDTH).split("\n")) {
      expect(line).not.toMatch(/ABOUT ME .+architecture/);
      expect(line).not.toMatch(/EXPERIENCE .+December/);
    }
  });

  it("ignores an ordinary word that merely matches a heading name", () => {
    // "experience" mid-sentence in the body is not a margin label. Matching
    // it dragged the detected geometry across the page and defeated the
    // whole mechanism.
    const { labels } = detectMarginLabels(
      [
        ...marginLabelPage(),
        item("experience", 390, 400, 50),
      ],
      PAGE_WIDTH,
    );
    expect(labels.map((label) => label.text)).not.toContain("experience");
  });

  it("leaves a normal heading on its own line alone", () => {
    // A heading with nothing beside it needs no special handling, and
    // treating it as a margin label would move it.
    const items = [
      item("SKILLS", 60, 700, 60),
      item("TypeScript, PostgreSQL", 60, 685, 200),
      item("EXPERIENCE", 60, 650, 90),
      item("Engineer at Example  2020 - 2024", 60, 635, 250),
      ...Array.from({ length: 6 }, (_, index) =>
        item(`Detail line ${index}`, 60, 620 - index * 15, 200),
      ),
    ];
    expect(detectMarginLabels(items, PAGE_WIDTH).labels).toEqual([]);
  });
});
