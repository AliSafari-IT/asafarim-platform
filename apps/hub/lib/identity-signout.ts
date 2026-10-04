/**
 * Hub sign-out → end the person's sessions at the identity service
 * (id.asafarim.site), so apps on their own domains sign them out too (#782,
 * item 4). A STUB until P2.3 deploys the identity service: behind
 * HUB_IDENTITY_SIGNOUT_ENABLED, and even when on it only reports that the call
 * is pending. Signing out of Hub itself never depends on it.
 */
export type IdentitySignOutResult = "disabled" | "pending_p2_3";

export function identitySignOutEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.HUB_IDENTITY_SIGNOUT_ENABLED === "true";
}

export async function endIdentitySessions(
  _userId: string,
  env: Record<string, string | undefined> = process.env,
): Promise<IdentitySignOutResult> {
  if (!identitySignOutEnabled(env)) return "disabled";
  // P2.3: call the identity service's end-session for this user here.
  return "pending_p2_3";
}
