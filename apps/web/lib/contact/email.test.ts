import { describe, expect, it } from "vitest";
import { buildNotification, escapeHtml, headerLine } from "./email";

describe("notification e-mail", () => {
  it("escapes everything a visitor typed", () => {
    const { html } = buildNotification({
      name: "<img src=x onerror=alert(1)>",
      email: 'a"b@x.test',
      bodyText: "<script>alert(1)</script>",
      files: [{ fileName: "<b>x</b>.pdf", sizeBytes: 3 }],
      attached: false,
    });
    expect(html).not.toMatch(/<(img|script|b)\b/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("not attached");
  });
  it("escapeHtml and headerLine", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;"
    );
    expect(headerLine("Hi\r\nBcc: evil@x.test")).toBe("Hi Bcc: evil@x.test");
  });
});
