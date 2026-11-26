import { describe, expect, it } from "vitest";
import { decodeEncodedWords, htmlToText, parseEml } from "./eml";

const enc = (s: string) => new TextEncoder().encode(s.replace(/\n/g, "\r\n"));

describe("parseEml", () => {
  it("reads headers and a plain-text body", () => {
    const preview = parseEml(
      enc(`From: Talent Team <talent@example.com>
To: me@example.com
Subject: =?UTF-8?B?VGhhbmtzIGZvciBhcHBseWluZyDinJM=?=
Date: Fri, 20 Nov 2026 14:31:00 +0100
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

We received your application for Data Engineer. Reference: ABC-123.=0A=
Caf=C3=A9 regards`),
    );
    expect(preview.from).toBe("Talent Team <talent@example.com>");
    expect(preview.subject).toBe("Thanks for applying ✓");
    expect(preview.text).toContain("Reference: ABC-123.");
    expect(preview.text).toContain("Café regards");
    expect(preview.fromHtml).toBe(false);
  });

  it("prefers text/plain in multipart/alternative and counts attached files", () => {
    const preview = parseEml(
      enc(`From: a@example.com
Subject: Interview
Content-Type: multipart/mixed; boundary="outer"

--outer
Content-Type: multipart/alternative; boundary=inner

--inner
Content-Type: text/plain

Plain version
--inner
Content-Type: text/html

<p>HTML version</p>
--inner--
--outer
Content-Type: application/pdf
Content-Disposition: attachment; filename="invite.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQK
--outer--`),
    );
    expect(preview.text).toBe("Plain version");
    expect(preview.attachedFiles).toBe(1);
  });

  it("reduces an HTML-only email to text: no script, no markup, no remote images", () => {
    const preview = parseEml(
      enc(`From: a@example.com
Subject: Hi
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: base64

${Buffer.from('<html><head><style>p{}</style></head><body><script>alert("x")</script><p>Hello &amp; welcome</p><img src="https://track.example/p.gif" onerror="alert(1)"><br>Bye</body></html>').toString("base64")}`),
    );
    expect(preview.fromHtml).toBe(true);
    expect(preview.text.replace(/\n+/g, "\n")).toBe("Hello & welcome\nBye");
    expect(preview.text).not.toMatch(/<|alert|track\.example/);
  });

  it("caps very long bodies", () => {
    const preview = parseEml(enc(`From: a@example.com\nSubject: Long\n\n${"x".repeat(60_000)}`));
    expect(preview.truncated).toBe(true);
    expect(preview.text.length).toBe(50_000);
  });
});

describe("helpers", () => {
  it("decodes Q encoded words", () => {
    expect(decodeEncodedWords("=?iso-8859-1?Q?Caf=E9_ouvert?=")).toBe("Café ouvert");
  });
  it("decodes numeric entities and drops comments", () => {
    expect(htmlToText("<!-- x --><div>A&#39;s &#x263A;</div>")).toBe("A's ☺");
  });
});
