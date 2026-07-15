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
  "This page provides general information about how the ASafarIM Platform handles data. It is not final legal text and will receive professional review before being relied upon.";

export const privacySections: LegalSection[] = [
  {
    title: "Who we are",
    body: "ASafarIM Digital is a software studio based in Hasselt, Belgium. This website and the related ASafarIM Platform apps (Hub, Showcase, Admin) are operated by the studio.",
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
    body: "These terms cover the use of the public ASafarIM Digital website and, where applicable, accounts on the ASafarIM Platform (Hub and related apps).",
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
    body: "Unless stated otherwise, the software, design, and content of the platform belong to ASafarIM Digital. Open-source packages are licensed under their respective licenses as published.",
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
