import { describe, expect, it } from "vitest";
import {
  MAX_JOB_FILE_BYTES,
  addFiles,
  checkSelection,
  combineJobFileTexts,
  parseSourceFiles,
  uploadSourceUrl,
} from "./jobFiles";

const f = (name: string, size: number, lastModified = 1) => ({ name, size, lastModified });

describe("checkSelection", () => {
  it("accepts up to five files within the limits", () => {
    expect(checkSelection([f("a.pdf", 10), f("b.pdf", 20)]).ok).toBe(true);
    expect(checkSelection([]).ok).toBe(false);
  });

  it("flags too many files, an over-size file, an empty one and the combined size", () => {
    expect(checkSelection(Array.from({ length: 6 }, (_, i) => f(`${i}.txt`, 1))).overall).toBe("TOO_MANY_FILES");
    const one = checkSelection([f("big.pdf", MAX_JOB_FILE_BYTES + 1), f("empty.txt", 0), f("ok.txt", 5)]);
    expect(one.perFile).toEqual(["FILE_TOO_LARGE", "EMPTY_FILE", null]);
    expect(one.ok).toBe(false);
    const total = checkSelection([f("a", 9 * 1024 * 1024), f("b", 9 * 1024 * 1024), f("c", 3 * 1024 * 1024)]);
    expect(total.overall).toBe("TOTAL_TOO_LARGE");
  });
});

describe("addFiles", () => {
  it("appends new picks and skips the same file picked twice", () => {
    const list = addFiles([f("a.pdf", 1)], [f("a.pdf", 1, 2), f("b.pdf", 2), f("a.pdf", 3)]);
    expect(list.map((x) => `${x.name}:${x.size}`)).toEqual(["a.pdf:1", "b.pdf:2", "a.pdf:3"]);
  });

  it("never trims an over-full list", () => {
    const six = addFiles([], Array.from({ length: 6 }, (_, i) => f(`${i}`, 1)));
    expect(six).toHaveLength(6);
  });
});

describe("combineJobFileTexts", () => {
  it("keeps one file's text as it is", () => {
    expect(combineJobFileTexts([{ name: "a.pdf", text: "Hello" }], 100)).toBe("Hello");
  });

  it("heads each of several files by its name and caps the result", () => {
    const text = combineJobFileTexts(
      [
        { name: "a.pdf", text: "First\n" },
        { name: "b.docx", text: "Second" },
      ],
      1000,
    );
    expect(text).toBe("=== File 1 of 2: a.pdf ===\nFirst\n\n=== File 2 of 2: b.docx ===\nSecond");
    expect(combineJobFileTexts([{ name: "a", text: "x".repeat(50) }, { name: "b", text: "y" }], 20)).toHaveLength(20);
  });
});

describe("uploadSourceUrl and parseSourceFiles", () => {
  it("names one file, or the first and a count", () => {
    expect(uploadSourceUrl(["a.pdf"])).toBe("upload://a.pdf");
    expect(uploadSourceUrl(["a.pdf", "b.pdf", "c.md"])).toBe("upload://a.pdf (+2 more)");
  });

  it("reads back a stored list and drops anything malformed", () => {
    const stored = [{ name: "a.pdf", contentType: "application/pdf", bytes: 10, characters: 5 }];
    expect(parseSourceFiles(stored)).toEqual(stored);
    expect(parseSourceFiles(null)).toBeNull();
    expect(parseSourceFiles([])).toBeNull();
    expect(parseSourceFiles([{ name: "a" }])).toBeNull();
  });
});
