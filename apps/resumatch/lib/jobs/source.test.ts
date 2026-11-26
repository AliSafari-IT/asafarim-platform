import { describe, expect, it } from "vitest";
import { describeJobSource, fileTypeLabel, formatBytes, jobPageFrom, jobPageHref, splitJobText } from "./source";

describe("describeJobSource", () => {
  it("reads a fetched link and its host", () => {
    const view = describeJobSource({ sourceUrl: "https://www.vdab.be/vindeenjob/vacatures/123" });
    expect(view.kind).toBe("link");
    expect(view.url).toBe("https://www.vdab.be/vindeenjob/vacatures/123");
    expect(view.host).toBe("vdab.be");
  });

  it("never treats a link with credentials or another scheme as a link", () => {
    expect(describeJobSource({ sourceUrl: "https://user:pw@example.com/job" }).kind).toBe("unknown");
    expect(describeJobSource({ sourceUrl: "javascript:alert(1)" }).kind).toBe("unknown");
    expect(describeJobSource({ sourceUrl: "javascript:alert(1)" }).url).toBeNull();
  });

  it("names the pseudo-URL intake paths", () => {
    expect(describeJobSource({ sourceUrl: "pasted://job-description" }).kind).toBe("pasted");
    expect(describeJobSource({ sourceUrl: "email://job-invitation" }).kind).toBe("email");
    expect(describeJobSource({ sourceUrl: "manual://job-entry" }).kind).toBe("manual");
  });

  it("lists stored upload files in order", () => {
    const view = describeJobSource({
      sourceUrl: "upload://offer.pdf (+1 more)",
      sourceFiles: [
        { name: "offer.pdf", contentType: "application/pdf", bytes: 2048, characters: 900 },
        { name: "team.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: 4096, characters: 300 },
      ],
    });
    expect(view.kind).toBe("files");
    expect(view.files.map((f) => f.name)).toEqual(["offer.pdf", "team.docx"]);
    expect(view.files[0].bytes).toBe(2048);
    expect(view.moreFiles).toBe(0);
  });

  it("falls back to the name in the URL for uploads from before 0.6.18", () => {
    expect(describeJobSource({ sourceUrl: "upload://vacature.pdf", sourceFiles: null }).files).toEqual([
      { name: "vacature.pdf", contentType: null, bytes: null },
    ]);
    const multi = describeJobSource({ sourceUrl: "upload://a.pdf (+2 more)" });
    expect(multi.files.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(multi.moreFiles).toBe(2);
    expect(describeJobSource({ sourceUrl: "upload://job-description" }).files).toEqual([]);
  });
});

describe("splitJobText", () => {
  it("keeps single-source text as one section", () => {
    expect(splitJobText("  Backend developer\n\nGenk  ")).toEqual([{ file: null, text: "Backend developer\n\nGenk" }]);
    expect(splitJobText("")).toEqual([]);
  });

  it("splits a multi-file upload at its file headers", () => {
    const text = "=== File 1 of 2: offer.pdf ===\nRole text\n\n=== File 2 of 2: mail.txt ===\nRecruiter note";
    expect(splitJobText(text)).toEqual([
      { file: "offer.pdf", text: "Role text" },
      { file: "mail.txt", text: "Recruiter note" },
    ]);
  });
});

describe("helpers", () => {
  it("formats sizes and types", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(fileTypeLabel("application/pdf", "x.bin")).toBe("PDF");
    expect(fileTypeLabel(null, "offer.docx")).toBe("DOCX");
    expect(fileTypeLabel(null, "noext")).toBeNull();
  });

  it("only accepts the two known back targets", () => {
    expect(jobPageFrom("history")).toBe("history");
    expect(jobPageFrom("https://evil.example")).toBeNull();
    expect(jobPageHref("job 1", "applications")).toBe("/jobs/job%201?from=applications");
  });
});
