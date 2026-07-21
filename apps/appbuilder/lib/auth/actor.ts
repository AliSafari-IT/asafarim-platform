/**
 * The authenticated caller performing a repository/service operation.
 *
 * `principalId` is the platform SSO user id and `roles` are the platform
 * roles (e.g. "superadmin"), both sourced only from the trusted server-side
 * session (see lib/auth/session.ts#getActor) — repository code must never
 * accept an actor id or role list supplied by a request body/query/params,
 * or scoping becomes bypassable.
 */
export interface Actor {
  principalId: string;
  roles: string[];
}
