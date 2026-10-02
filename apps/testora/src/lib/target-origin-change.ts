/**
 * Moving a target's secrets with it (#713). A target's test credentials
 * (#702) were saved for one host; if an edit points the target somewhere else
 * they would silently be sent to that other host on the next run. So an edit
 * that changes the ORIGIN of baseUrl, apiUrl or hubUrl on a target that has
 * secrets needs an explicit confirmation — keeping or clearing the secrets —
 * and every origin change is recorded. A path-only change (same origin) never
 * needs confirmation.
 *
 * Pure, so it can be unit-tested; the route does the DB work.
 */

export const URL_FIELDS = ["baseUrl", "apiUrl", "hubUrl"] as const;
export type UrlField = (typeof URL_FIELDS)[number];

export interface OriginChange {
  field: UrlField;
  /** Old origin (null when unset). */
  from: string | null;
  /** New origin (null when cleared). */
  to: string | null;
}

function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return url; // not a URL — compare verbatim
  }
}

/** The URL fields whose origin this edit changes. */
export function originChanges(
  existing: Partial<Record<UrlField, string | null>>,
  patch: Partial<Record<UrlField, string | null | undefined>>,
): OriginChange[] {
  const changes: OriginChange[] = [];
  for (const field of URL_FIELDS) {
    if (patch[field] === undefined) continue; // not part of this edit
    const from = originOf(existing[field]);
    const to = originOf(patch[field]);
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}

export type SecretsAction = "keep" | "clear";

export type SecretsMoveDecision =
  | { ok: true; clearSecrets: boolean }
  | {
      ok: false;
      status: 409;
      body: {
        code: "TARGET_HAS_SECRETS";
        error: string;
        changes: OriginChange[];
        secrets: string[];
      };
    };

/** May this edit go through, and should the target's secrets be cleared? */
export function secretsMoveDecision(input: {
  changes: OriginChange[];
  secretNames: string[];
  confirmSecretsMove?: boolean;
  secretsAction?: SecretsAction;
}): SecretsMoveDecision {
  if (input.changes.length === 0 || input.secretNames.length === 0) return { ok: true, clearSecrets: false };
  // Confirming means choosing: keep or clear. Without an explicit choice the
  // secrets would silently stay — so that's refused like no confirmation.
  if (input.confirmSecretsMove !== true || input.secretsAction === undefined) {
    const moves = input.changes.map((c) => `${c.field}: ${c.from ?? "(none)"} → ${c.to ?? "(none)"}`).join(", ");
    return {
      ok: false,
      status: 409,
      body: {
        code: "TARGET_HAS_SECRETS",
        error: `This target has ${input.secretNames.length} stored secret(s) (${input.secretNames.join(", ")}), and this edit points it at a different origin (${moves}). Confirm whether to keep the secrets for the new origin or clear them.`,
        changes: input.changes,
        secrets: input.secretNames,
      },
    };
  }
  return { ok: true, clearSecrets: input.secretsAction === "clear" };
}
