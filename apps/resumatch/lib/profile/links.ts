import type { LinkEntry, LinkKind } from "./contract";

/**
 * Display helpers for profile links, shared by the CV (print + DOCX), the
 * cover-letter frame and the profile form, so all of them show a link the
 * same way. Pure functions over what the candidate typed: nothing here adds,
 * guesses or completes a link beyond the scheme.
 */

/** Header order on a CV: the profiles recruiters look for first. */
const HEADER_ORDER: LinkKind[] = ["linkedin", "github", "website", "portfolio", "npm", "other"];

/**
 * What the candidate typed, as a URL the contract accepts. "github.com/me"
 * gets `https://`; anything with a scheme is left alone, so an
 * `ftp:`/`javascript:` value still fails validation instead of being
 * rewritten into something that passes.
 */
export function normalizeLinkUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

/** "https://www.linkedin.com/in/me/" → "linkedin.com/in/me". */
export function displayUrl(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

/** The text a link shows as: its label when it has one, else the URL. */
export function linkText(link: LinkEntry): string {
  return link.label ? `${link.label}: ${displayUrl(link.url)}` : displayUrl(link.url);
}

/** Links about the candidate (LinkedIn, GitHub, site…), in header order.
 *  Products are left out; they get their own section. */
export function headerLinks(links: LinkEntry[]): LinkEntry[] {
  return HEADER_ORDER.flatMap((kind) => links.filter((link) => link.kind === kind));
}

/** Products and projects the candidate built, in the order they listed them. */
export function productLinks(links: LinkEntry[]): LinkEntry[] {
  return links.filter((link) => link.kind === "product");
}
