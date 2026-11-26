/**
 * Browser helpers for the timeline forms. A request with files goes as
 * multipart (`payload` JSON + `file` fields), one without as JSON. Resolves
 * (never rejects) so a form can always tell a failed save from a saved one.
 */
export interface SendResult {
  ok: boolean;
  status: number;
  data: { error?: string; code?: string; file?: string | null; fields?: string[]; [key: string]: unknown };
}

export async function sendTimelineRequest(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  payload?: unknown,
  files: File[] = [],
): Promise<SendResult> {
  try {
    let init: RequestInit;
    if (files.length > 0) {
      const form = new FormData();
      form.set("payload", JSON.stringify(payload ?? {}));
      for (const file of files) form.append("file", file, file.name);
      init = { method, body: form };
    } else if (payload !== undefined) {
      init = { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) };
    } else {
      init = { method };
    }
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as SendResult["data"];
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

/** A random client key for one save intent, kept across retries. */
export function newClientKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
