import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getApplicationEmailConfig, senderDisplayName } from "./config";
import { classifySmtpError, createFixtureMailer, recipientOutcome, safeResponse, type OutgoingEmail } from "./mailer";
import {
  additionalRecipientProblems,
  cleanBody,
  companyKey,
  draftSaveSchema,
  isValidRecipient,
  normalizeEmail,
  recipientList,
  recipientSummary,
  sendRequestSchema,
  validateForSend,
} from "./normalize";
import { emailsInText, prefillRecipient } from "./prefill";
import { DEFAULT_SENT_QUERY, hasSentFilters, parseSentQuery, sentListHref, withSentFilter } from "./sentQuery";

describe("companyKey", () => {
  it("treats legal forms, case, accents and punctuation as the same company", () => {
    expect(companyKey("Kingfisher IT BV")).toBe("kingfisher-it");
    expect(companyKey("kingfisher it")).toBe("kingfisher-it");
    expect(companyKey("Acme B.V.")).toBe("acme");
    expect(companyKey("ACME")).toBe("acme");
    expect(companyKey("Société Générale S.A.")).toBe("societe-generale");
    expect(companyKey("Müller & Söhne GmbH")).toBe("muller-and-sohne");
  });
  it("keeps a name that is only a legal form, and never returns an empty key", () => {
    expect(companyKey("BV")).toBe("bv");
    expect(companyKey("")).toBe("unknown");
    expect(companyKey(null)).toBe("unknown");
    expect(companyKey("!!!")).toBe("unknown");
  });
});

describe("recipient and field validation", () => {
  it("accepts one plain address and refuses lists, display names and header injection", () => {
    expect(isValidRecipient("jobs@acme.example")).toBe(true);
    expect(isValidRecipient(" jobs@acme.example ")).toBe(true);
    for (const bad of ["", "jobs", "a@b.c, d@e.f", "Sam <sam@acme.example>", "a@b.example\r\nBcc: x@y.example", "a b@c.example"]) {
      expect(isValidRecipient(bad)).toBe(false);
    }
  });
  it("normalizes the filter key", () => {
    expect(normalizeEmail("  Jobs@Acme.Example ")).toBe("jobs@acme.example");
  });
  it("reports each problem for a send", () => {
    expect(validateForSend({ toEmail: "", contactName: "", subject: "", body: "  " })).toEqual({ toEmail: "required", subject: "required", body: "required" });
    expect(validateForSend({ toEmail: "x", contactName: "<script>", subject: "a\nb", body: "ok" })).toEqual({ toEmail: "invalid", contactName: "invalid", subject: "invalid" });
    expect(validateForSend({ toEmail: "a@b.example", contactName: "Sam", subject: "s".repeat(201), body: "b".repeat(10_001) })).toEqual({ subject: "tooLong", body: "tooLong" });
    expect(validateForSend({ toEmail: "a@b.example", contactName: "", subject: "Hi", body: "Line\r\n\tTwo" })).toEqual({});
  });
  it("takes up to 3 recipients, ignores blank extra fields and refuses duplicates (#944)", () => {
    const base = { toEmail: "a@acme.example", contactName: "", subject: "Hi", body: "Text" };
    expect(validateForSend({ ...base, additionalToEmails: [] })).toEqual({});
    expect(validateForSend({ ...base, additionalToEmails: ["b@acme.example"] })).toEqual({});
    expect(validateForSend({ ...base, additionalToEmails: ["b@acme.example", "c@acme.example"] })).toEqual({});
    expect(validateForSend({ ...base, additionalToEmails: ["b@acme.example", "c@acme.example", "d@acme.example"] })).toEqual({ additionalToEmails: "tooMany" });
    expect(validateForSend({ ...base, additionalToEmails: ["  ", ""] })).toEqual({});
    expect(validateForSend({ ...base, additionalToEmails: ["A@Acme.Example"] })).toEqual({ additionalToEmails: "duplicate" });
    expect(validateForSend({ ...base, additionalToEmails: ["b@acme.example", "B@acme.example "] })).toEqual({ additionalToEmails: "duplicate" });
    expect(validateForSend({ ...base, additionalToEmails: ["x, y@acme.example"] })).toEqual({ additionalToEmails: "invalid" });
    expect(additionalRecipientProblems({ toEmail: "a@acme.example", additionalToEmails: ["", "a@acme.example"] })).toEqual([null, "duplicate"]);
    expect(recipientList({ toEmail: " a@acme.example ", additionalToEmails: ["", " b@acme.example"] })).toEqual(["a@acme.example", "b@acme.example"]);
    expect(recipientSummary("a@acme.example", ["b@acme.example", "c@acme.example"])).toBe("a@acme.example +2");
    expect(recipientSummary("a@acme.example", [])).toBe("a@acme.example");
  });
  it("cleans a body without changing its words", () => {
    expect(cleanBody("Hello  \r\n\r\nWorld\t \n")).toBe("Hello\n\nWorld");
  });
  it("refuses a draft with header line breaks or unknown keys", () => {
    const draft = { toEmail: "", contactName: "", subject: "Hi", body: "", subjectEdited: false, bodyEdited: false, sendCopyToSelf: true, cvPdfId: null, coverLetterPdfId: null, version: null };
    expect(draftSaveSchema.safeParse(draft).success).toBe(true);
    expect(draftSaveSchema.safeParse({ ...draft, subject: "Hi\nBcc: x@y" }).success).toBe(false);
    expect(draftSaveSchema.safeParse({ ...draft, from: "x@y.example" }).success).toBe(false);
    expect(sendRequestSchema.safeParse({ draft, idempotencyKey: "not-a-uuid" }).success).toBe(false);
    expect(sendRequestSchema.safeParse({ draft, idempotencyKey: randomUUID() }).success).toBe(true);
  });
  it("accepts at most 2 extra recipients in a draft, each on one line (#944)", () => {
    const draft = { toEmail: "a@acme.example", contactName: "", subject: "Hi", body: "", subjectEdited: false, bodyEdited: false, sendCopyToSelf: true, cvPdfId: null, coverLetterPdfId: null, version: null };
    expect(draftSaveSchema.safeParse({ ...draft, additionalToEmails: ["b@acme.example", "c@acme.example"] }).success).toBe(true);
    expect(draftSaveSchema.safeParse({ ...draft, additionalToEmails: ["b@acme.example", "c@acme.example", "d@acme.example"] }).success).toBe(false);
    expect(draftSaveSchema.safeParse({ ...draft, additionalToEmails: ["b@acme.example\r\nBcc: x@y.example"] }).success).toBe(false);
  });
});

describe("classifySmtpError", () => {
  it("a server refusal is rejected, even at DATA", () => {
    expect(classifySmtpError({ code: "EENVELOPE", command: "RCPT TO", responseCode: 550, response: "550 no such user" })).toEqual({ kind: "rejected", code: "SMTP_550", response: "550 no such user" });
    expect(classifySmtpError({ code: "EMESSAGE", command: "DATA", responseCode: 552, response: "552 too big" })).toMatchObject({ kind: "rejected", code: "SMTP_552" });
  });
  it("a failure before the message is handed over is rejected", () => {
    expect(classifySmtpError({ code: "EAUTH", command: "AUTH PLAIN" })).toMatchObject({ kind: "rejected", code: "EAUTH_AUTH_PLAIN" });
    expect(classifySmtpError({ code: "ECONNECTION", command: "CONN" })).toMatchObject({ kind: "rejected" });
    expect(classifySmtpError({ code: "EDNS" })).toMatchObject({ kind: "rejected", code: "EDNS" });
  });
  it("a timeout or socket error during or after DATA is uncertain", () => {
    expect(classifySmtpError({ code: "ETIMEDOUT", command: "DATA" })).toEqual({ kind: "uncertain", code: "ETIMEDOUT" });
    expect(classifySmtpError({ code: "ESOCKET" })).toEqual({ kind: "uncertain", code: "ESOCKET" });
    expect(classifySmtpError(new Error("weird"))).toEqual({ kind: "uncertain", code: "UNKNOWN" });
    expect(classifySmtpError(null)).toEqual({ kind: "uncertain", code: "UNKNOWN" });
  });
  it("keeps provider responses short and on one line", () => {
    expect(safeResponse("250 ok\r\nqueued")).toBe("250 ok queued");
    expect(safeResponse("x".repeat(500))).toHaveLength(300);
    expect(safeResponse(undefined)).toBeNull();
  });
});

describe("fixture mailer", () => {
  const email = (address: string): OutgoingEmail => ({
    from: { name: "R", address: "a@resumatch.test" },
    to: [{ name: null, address }],
    replyTo: "r@example.test",
    bcc: null,
    subject: "s",
    text: "t",
    messageId: "<m@resumatch.test>",
    attachments: [],
  });
  it("accepts, rejects and times out by address", async () => {
    const mailer = createFixtureMailer();
    expect(await mailer.send(email("ok@acme.test"))).toMatchObject({ kind: "accepted" });
    expect(await mailer.send(email("reject@acme.test"))).toMatchObject({ kind: "rejected", code: "SMTP_550" });
    expect(await mailer.send(email("timeout@acme.test"))).toMatchObject({ kind: "uncertain" });
    expect(mailer.sent).toHaveLength(1);
  });
  it("sends one message to several recipients and names the ones refused (#944)", async () => {
    const mailer = createFixtureMailer();
    const many = (...addresses: string[]): OutgoingEmail => ({ ...email(addresses[0]!), to: addresses.map((address) => ({ name: null, address })) });
    expect(await mailer.send(many("a@acme.test", "b@acme.test"))).toEqual(expect.objectContaining({ kind: "accepted", rejectedRecipients: [] }));
    expect(await mailer.send(many("a@acme.test", "reject@acme.test"))).toEqual(expect.objectContaining({ kind: "accepted", rejectedRecipients: ["reject@acme.test"] }));
    expect(await mailer.send(many("reject@acme.test", "reject@other.test"))).toMatchObject({ kind: "rejected" });
    expect(await mailer.send(many("a@acme.test", "timeout@acme.test"))).toMatchObject({ kind: "uncertain" });
    expect(mailer.sent).toHaveLength(2);
  });
  it("is a refusal only when every To address was refused", () => {
    const to = [{ name: "Sam", address: "Sam@Acme.example" }, { name: null, address: "hr@acme.example" }];
    expect(recipientOutcome({ to }, [], "id", "250")).toEqual({ kind: "accepted", providerMessageId: "id", response: "250", rejectedRecipients: [] });
    expect(recipientOutcome({ to }, ["sam@acme.example"], "id", "250")).toMatchObject({ kind: "accepted", rejectedRecipients: ["Sam@Acme.example"] });
    expect(recipientOutcome({ to }, ["sam@acme.example", "hr@acme.example"], null, "550")).toEqual({ kind: "rejected", code: "RECIPIENT_REJECTED", response: "550" });
  });
});

describe("configuration", () => {
  it("is off unless switched on", () => {
    expect(getApplicationEmailConfig({} as NodeJS.ProcessEnv).unavailableReason).toBe("disabled");
  });
  it("needs a host, a login and a From address for SMTP, falling back to the platform SMTP settings", () => {
    const env = { RESUMATCH_EMAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.example", SMTP_USER: "u", SMTP_PASSWORD: "p" } as unknown as NodeJS.ProcessEnv;
    expect(getApplicationEmailConfig(env).unavailableReason).toBe("incomplete");
    const ok = getApplicationEmailConfig({ ...env, RESUMATCH_EMAIL_FROM_ADDRESS: "ResuMatch <apply@mail.example>", SMTP_PORT: "587" });
    expect(ok).toMatchObject({ unavailableReason: null, fromAddress: "apply@mail.example", messageIdDomain: "mail.example" });
    expect(ok.smtp).toMatchObject({ host: "smtp.example", port: 587, secure: false });
    const own = getApplicationEmailConfig({ ...env, RESUMATCH_EMAIL_FROM_ADDRESS: "apply@mail.example", RESUMATCH_SMTP_HOST: "other.example" });
    expect(own.smtp).toMatchObject({ host: "other.example", port: 465, secure: true });
  });
  it("refuses the fixture transport in production unless allowed", () => {
    const env = { RESUMATCH_EMAIL_TRANSPORT: "fixture", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;
    expect(getApplicationEmailConfig(env).unavailableReason).toBe("fixture_in_production");
    expect(getApplicationEmailConfig({ ...env, RESUMATCH_EMAIL_ALLOW_FIXTURE: "true" }).unavailableReason).toBeNull();
  });
  it("shows the candidate's name, never their address, in From", () => {
    expect(senderDisplayName("Robin Example", { fromNameSuffix: "via ResuMatch" })).toBe("Robin Example via ResuMatch");
    expect(senderDisplayName('Evil "<x@y>"\r\n', { fromNameSuffix: "via ResuMatch" })).toBe("Evil x@y via ResuMatch");
    expect(senderDisplayName(null, { fromNameSuffix: "via ResuMatch" })).toBe("ResuMatch");
  });
});

describe("recipient prefill", () => {
  it("finds addresses in a posting, skipping no-reply, privacy and image names", () => {
    expect(emailsInText("Mail jobs@acme.example or Jobs@Acme.example. Questions: noreply@acme.example, privacy@acme.example, logo@2x.png")).toEqual(["jobs@acme.example"]);
  });
  it("prefills only when there is exactly one address, and never invents one", () => {
    expect(prefillRecipient({ structuredFields: null, rawText: "Send to hr@acme.example", previous: null })).toMatchObject({ toEmail: "hr@acme.example", toEmailSource: "job_posting" });
    expect(prefillRecipient({ structuredFields: null, rawText: "a@acme.example or b@acme.example", previous: null })).toMatchObject({ toEmail: "", toEmailSource: null, suggestions: ["a@acme.example", "b@acme.example"] });
    expect(prefillRecipient({ structuredFields: null, rawText: "No address here", previous: null })).toMatchObject({ toEmail: "", toEmailSource: null, suggestions: [] });
  });
  it("prefers the address this application was already sent to", () => {
    expect(
      prefillRecipient({ structuredFields: { contactName: "Sam" }, rawText: "hr@acme.example", previous: { contactEmail: "sam@acme.example", contactName: null } }),
    ).toEqual({ toEmail: "sam@acme.example", additionalToEmails: [], contactName: "Sam", toEmailSource: "previous_email", suggestions: [] });
  });
  it("prefills every recipient of the previous email (#944)", () => {
    expect(
      prefillRecipient({
        structuredFields: null,
        rawText: null,
        previous: { contactEmail: "sam@acme.example", contactName: "Sam", additionalRecipients: ["hr@acme.example", "lead@acme.example"] },
      }),
    ).toMatchObject({ toEmail: "sam@acme.example", additionalToEmails: ["hr@acme.example", "lead@acme.example"], contactName: "Sam" });
  });
});

describe("sent list query", () => {
  it("round-trips filters, sort and page through the URL", () => {
    const query = { company: "acme", contact: "jobs@acme.example", application: "cm123", sort: "oldest" as const, page: 3 };
    const href = sentListHref(query);
    expect(href).toBe("/applications/sent?company=acme&contact=jobs%40acme.example&application=cm123&sort=oldest&page=3");
    expect(parseSentQuery(new URLSearchParams(href.split("?")[1]))).toEqual(query);
    expect(sentListHref(DEFAULT_SENT_QUERY)).toBe("/applications/sent");
  });
  it("drops values that are not a key, an address or an id", () => {
    expect(parseSentQuery({ company: "Acme Corp", contact: "not-an-email", application: "../x", sort: "random", page: "-1" })).toEqual(DEFAULT_SENT_QUERY);
    expect(parseSentQuery({ contact: "JOBS@Acme.Example" }).contact).toBe("jobs@acme.example");
  });
  it("adding or removing a filter goes back to page 1 and keeps the others", () => {
    const query = { ...DEFAULT_SENT_QUERY, company: "acme", page: 4 };
    expect(withSentFilter(query, { contact: "a@b.example" })).toEqual({ ...query, contact: "a@b.example", page: 1 });
    expect(withSentFilter(query, { company: null })).toEqual({ ...DEFAULT_SENT_QUERY });
    expect(hasSentFilters(DEFAULT_SENT_QUERY)).toBe(false);
    expect(hasSentFilters({ ...DEFAULT_SENT_QUERY, contact: "a@b.example" })).toBe(true);
  });
});
