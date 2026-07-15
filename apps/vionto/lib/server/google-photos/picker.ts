/**
 * Google Photos Picker API client.
 *
 * Flow: create a session → send the user to `pickerUri` → poll until
 * `mediaItemsSet` is true → list the items the user selected. The app only ever
 * sees the items the user explicitly picked, never the whole library.
 *
 * Docs: https://developers.google.com/photos/picker/guides/get-started
 */
import { GOOGLE_PICKER_API_BASE } from "./config";
import { fetchWithRetry, readJson } from "./http";
import type { NormalizedMediaItem } from "./types";

type RawPickerSession = {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
  pollingConfig?: {
    pollInterval?: string; // e.g. "5s"
    timeoutIn?: string;
  };
  expireTime?: string;
};

export type PickerSession = {
  id: string;
  pickerUri: string;
  mediaItemsSet: boolean;
  pollIntervalMs: number;
  expireTime?: string;
};

type RawPickedMediaItem = {
  id: string;
  createTime?: string;
  mediaFile?: {
    baseUrl: string;
    mimeType: string;
    filename?: string;
    mediaFileMetadata?: { width?: number; height?: number };
  };
};

type RawPickedItemsResponse = {
  mediaItems?: RawPickedMediaItem[];
  nextPageToken?: string;
};

function parseDurationMs(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const match = /^([\d.]+)s$/.exec(value.trim());
  if (!match) return fallbackMs;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : fallbackMs;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function toSession(raw: RawPickerSession): PickerSession {
  return {
    id: raw.id,
    pickerUri: raw.pickerUri,
    mediaItemsSet: Boolean(raw.mediaItemsSet),
    pollIntervalMs: parseDurationMs(raw.pollingConfig?.pollInterval, 5000),
    expireTime: raw.expireTime,
  };
}

/** Create a new picker session. */
export async function createPickerSession(accessToken: string): Promise<PickerSession> {
  const res = await fetchWithRetry(`${GOOGLE_PICKER_API_BASE}/sessions`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: "{}",
  });
  return toSession(await readJson<RawPickerSession>(res));
}

/** Poll a picker session's state (has the user finished selecting?). */
export async function getPickerSession(
  accessToken: string,
  sessionId: string,
): Promise<PickerSession> {
  const res = await fetchWithRetry(
    `${GOOGLE_PICKER_API_BASE}/sessions/${encodeURIComponent(sessionId)}`,
    { headers: authHeaders(accessToken) },
  );
  return toSession(await readJson<RawPickerSession>(res));
}

/** Delete a picker session once we're done with it. Best-effort. */
export async function deletePickerSession(
  accessToken: string,
  sessionId: string,
): Promise<void> {
  await fetchWithRetry(
    `${GOOGLE_PICKER_API_BASE}/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE", headers: authHeaders(accessToken) },
  );
}

function normalize(raw: RawPickedMediaItem): NormalizedMediaItem | null {
  const file = raw.mediaFile;
  if (!file?.baseUrl || !file.mimeType) return null;
  return {
    googleId: raw.id,
    baseUrl: file.baseUrl,
    mimeType: file.mimeType,
    filename: file.filename ?? `${raw.id}.jpg`,
    width: file.mediaFileMetadata?.width,
    height: file.mediaFileMetadata?.height,
    creationTime: raw.createTime,
  };
}

/**
 * List all media items the user selected in a finished session, paginating
 * through every page. Returns normalized items.
 */
export async function listPickedItems(
  accessToken: string,
  sessionId: string,
): Promise<NormalizedMediaItem[]> {
  const items: NormalizedMediaItem[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ sessionId, pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetchWithRetry(
      `${GOOGLE_PICKER_API_BASE}/mediaItems?${params.toString()}`,
      { headers: authHeaders(accessToken) },
    );
    const data = await readJson<RawPickedItemsResponse>(res);
    for (const raw of data.mediaItems ?? []) {
      const normalized = normalize(raw);
      if (normalized) items.push(normalized);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}
