import "server-only";

import { access } from "node:fs/promises";
import path from "node:path";

export const NEWSLETTER_INCENTIVE_FILENAME =
  "vionto-ai-pipeline-architecture.pdf";

export async function resolveNewsletterIncentivePath(): Promise<string> {
  const configuredPath = process.env.NEWSLETTER_INCENTIVE_PDF_PATH?.trim();
  const candidates = [
    configuredPath ? path.resolve(configuredPath) : null,
    path.join(process.cwd(), "resources", NEWSLETTER_INCENTIVE_FILENAME),
    path.join(
      process.cwd(),
      "output",
      "pdf",
      NEWSLETTER_INCENTIVE_FILENAME,
    ),
    path.join(
      process.cwd(),
      "..",
      "..",
      "output",
      "pdf",
      NEWSLETTER_INCENTIVE_FILENAME,
    ),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Local development and the standalone image use different roots.
    }
  }

  throw new Error("Newsletter incentive PDF is not available on this server.");
}

export function buildNewsletterIncentiveEmail() {
  const subject = "Your Vionto AI pipeline architecture guide";
  const text = [
    "Thanks for subscribing to ASafarIM Digital's engineering notes.",
    "",
    "Your copy of The Real Architecture Behind Vionto's AI Pipeline is attached.",
    "",
    "Inside: media intelligence, provider routing, narration timing, the render manifest, BullMQ and FFmpeg execution, security controls, and the implementation gaps that still matter.",
    "",
    "No fluff, no funnel - just the architecture behind the production system.",
    "",
    "Ali Safari",
    "ASafarIM Digital",
    "https://asafarim.com",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f1ea;color:#171717;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fffdf8;border:1px solid #d9d3c7;border-radius:18px;overflow:hidden;">
            <tr><td style="height:8px;background:#b45309;"></td></tr>
            <tr>
              <td style="padding:38px 42px 18px;">
                <p style="margin:0 0 24px;font-size:12px;font-weight:700;letter-spacing:2px;color:#b45309;">ASAFARIM DIGITAL</p>
                <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:34px;line-height:1.08;">The real architecture behind Vionto's AI pipeline</h1>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Thanks for subscribing. Your 16-page architecture guide is attached to this email.</p>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">It covers media intelligence, provider routing, narration timing, the render manifest, BullMQ and FFmpeg execution, security controls, and the implementation gaps that still matter.</p>
                <div style="padding:18px 20px;background:#171717;color:#f4f1ea;border-radius:10px;font-size:15px;line-height:1.5;">
                  <strong style="color:#e9c7a5;">THE CORE IDEA</strong><br />
                  AI interprets and directs. Deterministic software renders the final frames.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 42px 38px;color:#68645e;font-size:13px;line-height:1.6;">
                Ali Safari<br />ASafarIM Digital<br />
                <a href="https://asafarim.com" style="color:#b45309;">asafarim.com</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
