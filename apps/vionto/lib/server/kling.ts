import { createHmac } from "node:crypto";

/**
 * Server-only Kling AI client (image-to-video).
 *
 * Auth: short-lived HS256 JWT built from the access key (`iss`) and signed
 * with the secret key — sent as `Authorization: Bearer <jwt>`. Generation is
 * asynchronous: create a task, then poll it until `succeed`/`failed` and
 * download the temporary result URL promptly.
 *
 * Never expose KLING_API_SECRET through NEXT_PUBLIC_* or client responses.
 */

const DEFAULT_API_BASE = "https://api-singapore.klingai.com";
const DEFAULT_MODEL = "kling-v1-6";
const REQUEST_TIMEOUT_MS = 30_000;
const JWT_TTL_SECONDS = 1800;

export type KlingConfig = {
  accessKey: string;
  secretKey: string;
  apiBase: string;
  model: string;
};

export function isKlingConfigured(): boolean {
  return Boolean(process.env.KLING_API_KEY?.trim() && process.env.KLING_API_SECRET?.trim());
}

export function getKlingConfig(): KlingConfig {
  const accessKey = process.env.KLING_API_KEY?.trim();
  const secretKey = process.env.KLING_API_SECRET?.trim();
  if (!accessKey || !secretKey) {
    throw new Error(
      "Kling is not configured. Set KLING_API_KEY and KLING_API_SECRET " +
        "(and optionally KLING_API_BASE / KLING_MODEL)."
    );
  }
  return {
    accessKey,
    secretKey,
    apiBase: process.env.KLING_API_BASE?.trim() || DEFAULT_API_BASE,
    model: process.env.KLING_MODEL?.trim() || DEFAULT_MODEL,
  };
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** Build the short-lived HS256 JWT Kling expects. */
export function createKlingJwt(config: KlingConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({ iss: config.accessKey, exp: now + JWT_TTL_SECONDS, nbf: now - 5 })
  );
  const signature = createHmac("sha256", config.secretKey)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export class KlingApiError extends Error {
  constructor(
    message: string,
    /** Kling business code (non-zero) or HTTP status when the body was unusable. */
    public readonly code: number,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = "KlingApiError";
  }
}

/** Kling-side task lifecycle states. */
export type KlingTaskStatus = "submitted" | "processing" | "succeed" | "failed";

export type KlingTask = {
  taskId: string;
  status: KlingTaskStatus;
  statusMessage: string | null;
  /** Present once status === "succeed". Temporary URL — download promptly. */
  videos: Array<{ id: string; url: string; duration: number | null }>;
  raw: Record<string, unknown>;
};

type KlingEnvelope = {
  code: number;
  message?: string;
  request_id?: string;
  data?: Record<string, unknown>;
};

async function klingFetch(
  config: KlingConfig,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${config.apiBase}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${createKlingJwt(config)}`,
        "Content-Type": "application/json",
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    throw new KlingApiError(
      `Kling request failed: ${error instanceof Error ? error.message : String(error)}`,
      -1
    );
  } finally {
    clearTimeout(timer);
  }

  const envelope = (await res.json().catch(() => null)) as KlingEnvelope | null;
  if (!envelope || typeof envelope.code !== "number") {
    throw new KlingApiError(`Kling returned an unexpected response (HTTP ${res.status}).`, res.status);
  }
  if (envelope.code !== 0) {
    throw new KlingApiError(
      envelope.message || `Kling error code ${envelope.code}`,
      envelope.code,
      envelope.request_id
    );
  }
  return envelope.data ?? {};
}

function parseTask(data: Record<string, unknown>): KlingTask {
  const result = (data.task_result ?? {}) as { videos?: Array<Record<string, unknown>> };
  return {
    taskId: String(data.task_id ?? ""),
    status: (data.task_status as KlingTaskStatus) ?? "submitted",
    statusMessage: typeof data.task_status_msg === "string" ? data.task_status_msg : null,
    videos: (result.videos ?? []).map((v) => ({
      id: String(v.id ?? ""),
      url: String(v.url ?? ""),
      duration: v.duration != null ? Number(v.duration) : null,
    })),
    raw: data,
  };
}

export type CreateImageToVideoInput = {
  /** Publicly fetchable (short-lived presigned) image URL, or base64 payload. */
  imageUrl: string;
  prompt?: string;
  negativePrompt?: string;
  mode?: "std" | "pro";
  /** Kling supports 5 or 10 second clips. */
  durationSeconds?: 5 | 10;
  /** Our own id, echoed back by Kling for correlation. */
  externalTaskId?: string;
  model?: string;
};

/** Submit an asynchronous image-to-video generation task. */
export async function createImageToVideoTask(input: CreateImageToVideoInput): Promise<KlingTask> {
  const config = getKlingConfig();
  const data = await klingFetch(config, "/v1/videos/image2video", {
    method: "POST",
    body: {
      model_name: input.model ?? config.model,
      image: input.imageUrl,
      ...(input.prompt ? { prompt: input.prompt } : {}),
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      mode: input.mode ?? "std",
      duration: String(input.durationSeconds ?? 5),
      ...(input.externalTaskId ? { external_task_id: input.externalTaskId } : {}),
    },
  });
  return parseTask(data);
}

/** Query a previously submitted image-to-video task. */
export async function getImageToVideoTask(taskId: string): Promise<KlingTask> {
  const config = getKlingConfig();
  const data = await klingFetch(config, `/v1/videos/image2video/${encodeURIComponent(taskId)}`);
  return parseTask(data);
}

/** Download a finished clip (temporary provider URL) into a Buffer. */
export async function downloadClip(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new KlingApiError(`Clip download failed with HTTP ${res.status}.`, res.status);
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
