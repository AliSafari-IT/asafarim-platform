import { describe, expect, it } from "vitest";
import { contentDisposition, pdfFilename } from "./filename";
import { cvFingerprint, letterFingerprint } from "./fingerprint";
import { internalBaseUrl, pdfRendererConfigured, sessionCookieHeader } from "./render";

describe("PDF file names", () => {
  it("names a PDF like the printed tab title, dropping unsafe characters", () => {
    expect(pdfFilename("Ali Safari", "CV", "Kingfisher IT")).toBe("Ali Safari – CV – Kingfisher IT.pdf");
    expect(pdfFilename(null, "Cover letter", null)).toBe("Cover letter.pdf");
    expect(pdfFilename('A/B\\C:"x"', "CV", "<Acme>")).toBe("A B C x – CV – Acme.pdf");
  });
  it("sends an ASCII fallback and the UTF-8 name", () => {
    expect(contentDisposition("Zoë – CV.pdf", "attachment")).toBe(`attachment; filename="Zoe  CV.pdf"; filename*=UTF-8''Zo%C3%AB%20%E2%80%93%20CV.pdf`);
  });
});

describe("fingerprints", () => {
  const cv = { content: { a: 1, b: [1, 2] }, outputLanguage: "en", skillsLayout: null, skillsParagraph: null, profileVersionContent: { x: 1 }, photo: null };
  it("is stable across key order and changes with the content", () => {
    expect(cvFingerprint(cv)).toBe(cvFingerprint({ ...cv, content: { b: [1, 2], a: 1 } }));
    expect(cvFingerprint(cv)).not.toBe(cvFingerprint({ ...cv, skillsParagraph: "changed" }));
    expect(cvFingerprint(cv)).not.toBe(cvFingerprint({ ...cv, photo: { contentHash: "h", shape: "circle" } }));
  });
  it("a letter's fingerprint follows its job and content", () => {
    const letter = { content: { p: ["x"] }, outputLanguage: "en", profileVersionContent: {}, job: { title: "Dev", employer: "Acme", structuredFields: null }, createdAt: "2026-11-21T00:00:00.000Z" };
    expect(letterFingerprint(letter)).toBe(letterFingerprint({ ...letter }));
    expect(letterFingerprint(letter)).not.toBe(letterFingerprint({ ...letter, job: { ...letter.job, employer: "Other" } }));
  });
});

describe("renderer settings", () => {
  it("forwards only the session cookie", () => {
    expect(sessionCookieHeader("theme=dark; authjs.session-token=abc; tracking=1")).toBe("authjs.session-token=abc");
    expect(sessionCookieHeader("__Secure-authjs.session-token.0=a; __Secure-authjs.session-token.1=b")).toBe("__Secure-authjs.session-token.0=a; __Secure-authjs.session-token.1=b");
    expect(sessionCookieHeader("theme=dark")).toBeNull();
    expect(sessionCookieHeader(null)).toBeNull();
  });
  it("renders against the app's own internal address", () => {
    expect(internalBaseUrl({} as NodeJS.ProcessEnv)).toBe("http://127.0.0.1:3012");
    expect(internalBaseUrl({ PORT: "4000" } as unknown as NodeJS.ProcessEnv)).toBe("http://127.0.0.1:4000");
    expect(internalBaseUrl({ RESUMATCH_INTERNAL_URL: "http://resumatch:3012/" } as unknown as NodeJS.ProcessEnv)).toBe("http://resumatch:3012");
    expect(pdfRendererConfigured({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("standalone build tracing", () => {
  it("ships the whole playwright-core package with the PDF route", async () => {
    // 0.3.0/0.3.1: the tracer missed browsers.json, so every server-side
    // PDF failed in production with MODULE_NOT_FOUND.
    const { default: config } = await import("../../next.config");
    expect(config.outputFileTracingIncludes?.["/api/tailor/\\[id\\]/pdfs"]).toContain("./node_modules/playwright-core/**/*");
  });
});
