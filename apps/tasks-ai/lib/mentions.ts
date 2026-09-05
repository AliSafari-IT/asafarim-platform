/**
 * Mention parsing for comment bodies. The client inserts mentions as
 * `@[Display Name](mem_xxx)`; this extracts the membership ids. Pure and
 * framework-free so it is unit-tested and safe to run on the server.
 *
 * Abuse guard (M04 security tests): the same id mentioned many times counts
 * once, and a body may mention at most MAX_MENTIONS distinct members — a
 * comment that "@"s the whole company does not fan out to the whole company.
 */
export const MAX_MENTIONS = 20;

// The id inside the parens is a Membership id (cuid). Kept permissive:
// alphanumeric, 8–40 chars. Non-existent ids are dropped later when the
// service resolves them against the workspace's memberships.
const TOKEN = /@\[[^\]]{1,80}\]\(([a-z0-9]{8,40})\)/gi;

export function parseMentions(body: string): string[] {
  const ids = new Set<string>();
  for (const m of body.matchAll(TOKEN)) {
    ids.add(m[1]);
    if (ids.size >= MAX_MENTIONS) break;
  }
  return [...ids];
}

/** Render mentions to plain text for email/notification previews. */
export function stripMentions(body: string): string {
  return body.replace(/@\[([^\]]{1,80})\]\([a-z0-9]{8,40}\)/gi, "@$1");
}
