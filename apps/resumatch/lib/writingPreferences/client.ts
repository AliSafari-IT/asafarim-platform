import type { WritingPreferences, WritingPreferencesError, WritingPreferencesView } from "./contract";

/** Browser side of PUT /api/writing-preferences (#931), shared by the
 *  profile panel and the Tailor card's "Remember" button. */
export type PutWritingPreferencesResult =
  | { kind: "saved"; current: WritingPreferencesView | null; changed: boolean }
  | { kind: "stale"; current: WritingPreferencesView | null }
  | { kind: "invalid"; code: WritingPreferencesError | null }
  | { kind: "failed" };

export async function putWritingPreferences(
  preferences: WritingPreferences,
  baseRevisionId: string | null,
): Promise<PutWritingPreferencesResult> {
  try {
    const res = await fetch("/api/writing-preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences, baseRevisionId }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      current?: WritingPreferencesView | null;
      changed?: boolean;
      code?: string;
    };
    if (res.ok) return { kind: "saved", current: data.current ?? null, changed: data.changed !== false };
    if (res.status === 409) return { kind: "stale", current: data.current ?? null };
    if (res.status === 422) return { kind: "invalid", code: (data.code as WritingPreferencesError | undefined) ?? null };
    return { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}
