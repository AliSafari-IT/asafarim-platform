/**
 * Low-level fal.ai queue client (server-only).
 *
 * fal.ai hosts many image-to-video models (LTX, WAN, Kling, …) behind one
 * unified queue API and one key. Unlike Kling's direct API this is BYOK-aware:
 * every call takes the resolved key so a user's own `FAL_KEY` (or the server
 * env fallback) can be threaded in per request.
 *
 * Queue lifecycle:
 *   POST {base}/{model}                              → { request_id, status }
 *   GET  {base}/{model}/requests/{id}/status         → { status }
 *   GET  {base}/{model}/requests/{id}                → model-specific result
 * Auth: `Authorization: Key <FAL_KEY>`.
 */

const QUEUE_BASE = "https://queue.fal.run";
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * fal quirk: you SUBMIT to the full endpoint path (e.g.
 * `fal-ai/ltx-video/image-to-video`) but poll status/result at the *app id* —
 * the first two path segments (`fal-ai/ltx-video`). Using the full path for
 * status/result returns HTTP 405, which would leave a finished clip stuck
 * "queued" forever. Models that are already two segments (e.g. `fal-ai/wan-i2v`)
 * are unaffected.
 */
export function falAppId(model: string): string {
  return model.split("/").slice(0, 2).join("/");
}

export type FalQueueStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";

export function isFalConfigured(): boolean {
  return Boolean(process.env.FAL_KEY?.trim());
}

export class FalApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "FalApiError";
  }
}

async function falFetch(
  apiKey: string,
  url: string,
  init?: { method?: string; body?: unknown }
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    throw new FalApiError(
      `fal.ai request failed: ${error instanceof Error ? error.message : String(error)}`,
      -1
    );
  } finally {
    clearTimeout(timer);
  }

  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const detail =
      (payload && (payload.detail ?? payload.error ?? payload.message)) ||
      `HTTP ${res.status}`;
    throw new FalApiError(`fal.ai error: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`, res.status);
  }
  return payload ?? {};
}

export interface FalSubmitResult {
  requestId: string;
  status: FalQueueStatus;
}

/** Submit a job to a fal model's queue. `model` is the fal model id/path. */
export async function submitFalTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>
): Promise<FalSubmitResult> {
  const data = await falFetch(apiKey, `${QUEUE_BASE}/${model}`, { method: "POST", body: input });
  const requestId = String(data.request_id ?? "");
  if (!requestId) throw new FalApiError("fal.ai did not return a request_id.", -1);
  return { requestId, status: (data.status as FalQueueStatus) ?? "IN_QUEUE" };
}

/** Poll a queued job's status. */
export async function getFalStatus(
  apiKey: string,
  model: string,
  requestId: string
): Promise<FalQueueStatus> {
  const data = await falFetch(
    apiKey,
    `${QUEUE_BASE}/${falAppId(model)}/requests/${encodeURIComponent(requestId)}/status`
  );
  return (data.status as FalQueueStatus) ?? "IN_QUEUE";
}

/** Fetch a completed job's result (model-specific shape). */
export async function getFalResult(
  apiKey: string,
  model: string,
  requestId: string
): Promise<Record<string, unknown>> {
  return falFetch(apiKey, `${QUEUE_BASE}/${falAppId(model)}/requests/${encodeURIComponent(requestId)}`);
}

/** Download a finished clip (temporary fal URL) into a Buffer. */
export async function downloadFalClip(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new FalApiError(`Clip download failed with HTTP ${res.status}.`, res.status);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
