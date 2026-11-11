import { describe, expect, it } from "vitest";
import { checkFileContent, sanitizeFileName } from "./file-check";

/** A minimal zip with the given entry names (stored, empty), enough for the central directory. */
function zip(names: string[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const n = Buffer.from(name);
    const local = Buffer.alloc(30 + n.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(n.length, 26);
    n.copy(local, 30);
    const cd = Buffer.alloc(46 + n.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(n.length, 28);
    cd.writeUInt32LE(offset, 42);
    n.copy(cd, 46);
    locals.push(local);
    central.push(cd);
    offset += local.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

const pdf = (body = "") =>
  Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog ${body}>>\nendobj\ntrailer\n<<>>\n%%EOF\n`
  );

describe("checkFileContent: PDF", () => {
  it("accepts a plain PDF", () =>
    expect(checkFileContent("a.pdf", pdf()).ok).toBe(true));
  it("rejects a file that only claims to be a PDF", () =>
    expect(checkFileContent("a.pdf", Buffer.from("MZ....")).ok).toBe(false));
  it.each([
    "/JavaScript",
    "/JS (app.alert(1))",
    "/OpenAction 5 0 R",
    "/Launch",
    "/EmbeddedFile",
    "/AA << >>",
    "/Encrypt 9 0 R",
  ])("rejects active content %s", (body) =>
    expect(checkFileContent("a.pdf", pdf(body)).ok).toBe(false)
  );
  it("sees through #XX name escapes", () =>
    expect(checkFileContent("a.pdf", pdf("/J#61vaScript 1 0 R")).ok).toBe(
      false
    ));
  it("does not flag harmless names that merely start the same", () =>
    expect(checkFileContent("a.pdf", pdf("/JSON /Author (x)")).ok).toBe(true));
});

describe("checkFileContent: Office", () => {
  const docx = ["[Content_Types].xml", "word/document.xml", "_rels/.rels"];
  it("accepts a plain docx", () =>
    expect(checkFileContent("a.docx", zip(docx)).ok).toBe(true));
  it("rejects macros", () =>
    expect(
      checkFileContent("a.docx", zip([...docx, "word/vbaProject.bin"])).ok
    ).toBe(false));
  it("rejects embedded objects", () =>
    expect(
      checkFileContent(
        "a.docx",
        zip([...docx, "word/embeddings/oleObject1.bin"])
      ).ok
    ).toBe(false));
  it("rejects a docx that is really a xlsx", () =>
    expect(
      checkFileContent(
        "a.docx",
        zip(["[Content_Types].xml", "xl/workbook.xml"])
      ).ok
    ).toBe(false));
  it("rejects zip-slip paths", () =>
    expect(
      checkFileContent(
        "a.xlsx",
        zip(["[Content_Types].xml", "xl/a.xml", "../evil.xml"])
      ).ok
    ).toBe(false));
  it("rejects a non-zip", () =>
    expect(checkFileContent("a.pptx", Buffer.from("hello")).ok).toBe(false));
});

describe("checkFileContent: images and text", () => {
  it("accepts a PNG signature, rejects a PNG that is an executable", () => {
    expect(
      checkFileContent(
        "a.png",
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])
      ).ok
    ).toBe(true);
    expect(checkFileContent("a.png", Buffer.from("MZ\x90\x00")).ok).toBe(false);
  });
  it("accepts UTF-8 text, rejects binary and invalid UTF-8", () => {
    expect(checkFileContent("a.txt", Buffer.from("héllo")).ok).toBe(true);
    expect(checkFileContent("a.txt", Buffer.from([0x68, 0x00, 0x69])).ok).toBe(
      false
    );
    expect(checkFileContent("a.csv", Buffer.from([0xff, 0xfe, 0xfd])).ok).toBe(
      false
    );
  });
  it("rejects empty files and unknown types", () => {
    expect(checkFileContent("a.pdf", Buffer.alloc(0)).ok).toBe(false);
    expect(checkFileContent("a.exe", Buffer.from("x")).ok).toBe(false);
    expect(checkFileContent("a.svg", Buffer.from("<svg/>")).ok).toBe(false);
  });
});

describe("sanitizeFileName", () => {
  it("drops paths, control and bidi characters, and hidden double extensions", () => {
    expect(sanitizeFileName("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(sanitizeFileName("C:\\x\\invoice.exe.pdf")).toBe("invoice_exe.pdf");
    expect(sanitizeFileName("annual\u202Efdp.exe")).toBe("annualfdp.exe");
    expect(sanitizeFileName("a\r\nb: c.pdf")).toBe("ab c.pdf");
    expect(sanitizeFileName("...")).toBe("file");
  });
});
