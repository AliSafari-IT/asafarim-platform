/**
 * The authenticated caller performing a repository/service operation.
 *
 * `principalId` is the platform SSO user id, always sourced from the
 * server-side session (M03 wires the real SSO check) — repository code
 * must never accept an actor id supplied by request body/query/params, or
 * scoping becomes bypassable.
 */
export interface Actor {
  principalId: string;
}
