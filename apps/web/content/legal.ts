/**
 * Legal page content. General informational placeholders written for the
 * platform's actual behavior (auth cookies, contact messages) — flagged
 * for professional legal review before production use.
 */

export interface LegalSection {
  title: string;
  body: string;
}

export const legalDisclaimer =
  "This page provides general information about how the ASafariM Platform handles data. It is not final legal text and will receive professional review before being relied upon.";

export const privacySections: LegalSection[] = [
  {
    title: "Who we are",
    body: "ASafariM Digital is a software studio based in Hasselt, Belgium. This website and the related ASafariM Platform apps (Hub, Showcase, Admin) are operated by the studio.",
  },
  {
    title: "What we collect",
    body: "The public website can be browsed without an account and does not require personal data. If you create an account on the Hub, we store the details you provide (name, email, optional profile fields) plus what is needed to operate your account securely: a hashed password, session data, and assigned roles.",
  },
  {
    title: "Cookies",
    body: "Signed-in areas use strictly necessary authentication cookies (session tokens) to keep you signed in across platform apps. The public website does not use advertising or cross-site tracking cookies.",
  },
  {
    title: "Contact messages",
    body: "When you send a message through the contact page or by email, we keep the message and your contact details for as long as needed to handle the conversation.",
  },
  {
    title: "AI Workbench tools",
    body: "The tools at /tools work without an account. Text you paste is sent to our server to produce a result and is not stored in a database, written to logs, or sent to analytics. While a run is in progress, and for up to two minutes afterwards, the result is kept in server memory only so a dropped connection can get it back without running it twice. When a tool's live generation is switched on, your text is also sent to Anthropic, the AI provider, which processes it to draft the result under its API terms; when it's off, only prepared examples run and no provider is involved. For each live run we keep an operational record without any of your text: which tool ran, the outcome, timing, token counts, and estimated cost. To limit abuse, your IP address is turned into a salted one-way hash that is kept in server memory for at most an hour after your last run and never stored or logged. Please don't paste passwords, secrets, or sensitive personal information; a result you download is created in your browser and not uploaded.",
  },
  {
    title: "Website analytics",
    body: "The public website uses Umami, a cookie-less analytics service, to count page views and a small set of product events (for example, that a tool ran or a result was exported). Events carry only the tool name, version, mode, and outcome category, never your text, results, email, or IP address.",
  },
  {
    title: "Where data lives",
    body: "Platform data is stored in a PostgreSQL database on infrastructure operated by the studio within the EU. Data is not sold or shared with third parties for marketing.",
  },
  {
    title: "Your rights",
    body: "You can request access to, correction of, or deletion of your personal data at any time by emailing contact@asafarim.com.",
  },
];

export const termsSections: LegalSection[] = [
  {
    title: "About these terms",
    body: "These terms cover the use of the public ASafariM Digital website and, where applicable, accounts on the ASafariM Platform (Hub and related apps).",
  },
  {
    title: "Use of the website",
    body: "The website's content — text, project descriptions, and case studies — is provided for information. You may not misuse the site, attempt to gain unauthorized access, or disrupt its operation.",
  },
  {
    title: "Accounts",
    body: "Hub accounts are personal. You are responsible for keeping your credentials safe and for activity under your account. Accounts that abuse the platform may be deactivated.",
  },
  {
    title: "Content and ownership",
    body: "Unless stated otherwise, the software, design, and content of the platform belong to ASafariM Digital. Open-source packages are licensed under their respective licenses as published.",
  },
  {
    title: "AI Workbench tools",
    body: "AI tool results are drafts produced by software and can be wrong, incomplete, or out of date. Review them before you rely on them; they are not professional advice and don't show that anything was tested, scheduled, or verified. Live runs are limited per visitor and per day, and tools can be paused at any time. Don't submit content you don't have the right to share or that contains secrets or other people's personal data.",
  },
  {
    title: "No warranties",
    body: "Public demos and experiments are provided as-is, without warranty of availability or fitness for a particular purpose.",
  },
  {
    title: "Contact",
    body: "Questions about these terms can be sent to contact@asafarim.com.",
  },
];
