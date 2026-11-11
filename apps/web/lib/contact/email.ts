/**
 * The notification e-mail to the site owner. Everything a visitor typed is escaped, and
 * the message body goes out as plain text only: the visitor's pasted HTML is shown in the
 * sandboxed viewer in the inbox, never injected into the owner's mail client.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

/** A header-safe single line: no CR/LF (header injection), bounded length. */
export const headerLine = (value: string, max = 200): string =>
  value.replace(/[\r\n\u2028\u2029]+/g, " ").slice(0, max);

export interface NotificationInput {
  name: string;
  email: string;
  bodyText: string;
  files: { fileName: string; sizeBytes: number }[];
  /** True when the files travel with the e-mail (off by default; see CONTACT_EMAIL_ATTACH). */
  attached: boolean;
}

export function buildNotification({
  name,
  email,
  bodyText,
  files,
  attached,
}: NotificationInput) {
  const list = files
    .map((f) => `- ${f.fileName} (${f.sizeBytes} bytes)`)
    .join("\n");
  const note = attached
    ? ""
    : "\n\n(The files were scanned and are kept in the sender's inbox; they are not attached to this e-mail.)";
  const text =
    `Name: ${name}\nEmail: ${email}\n\n${bodyText}` +
    (files.length ? `\n\nAttachments (${files.length}):\n${list}${note}` : "");
  const html =
    `<p><strong>Name:</strong> ${escapeHtml(name)}</p>` +
    `<p><strong>Email:</strong> ${escapeHtml(email)}</p><hr />` +
    `<div style="white-space:pre-wrap">${escapeHtml(bodyText)}</div>` +
    (files.length
      ? `<hr /><p><strong>Attachments (${files.length}):</strong></p><ul>` +
        files
          .map(
            (f) => `<li>${escapeHtml(f.fileName)} — ${f.sizeBytes} bytes</li>`
          )
          .join("") +
        `</ul>` +
        (attached
          ? ""
          : `<p><em>The files were scanned and are kept in the sender's inbox; they are not attached to this e-mail.</em></p>`)
      : "");
  return { text, html };
}
