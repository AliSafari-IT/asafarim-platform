/**
 * Shared types for the Google Photos integration — normalized so the rest of
 * the app never depends on Google's raw response shapes.
 */

/** A media item the user selected (from a picker session or shared album). */
export type NormalizedMediaItem = {
  /** Google's stable media item id — used for dedupe. */
  googleId: string;
  /** Base URL to fetch bytes from (append size params before download). */
  baseUrl: string;
  mimeType: string;
  filename: string;
  width?: number;
  height?: number;
  /** Photo creation time, if Google provided one (ISO string). */
  creationTime?: string;
};

/** Outcome of importing a single media item into the upload session. */
export type ImportItemResult =
  | {
      googleId: string;
      status: "imported";
      key: string;
      filename: string;
    }
  | {
      googleId: string;
      status: "skipped";
      reason: "duplicate" | "unsupported_type" | "too_large";
      filename?: string;
    }
  | {
      googleId: string;
      status: "failed";
      reason: string;
      filename?: string;
    };

export type ImportSummary = {
  sessionId: string;
  imported: number;
  skipped: number;
  failed: number;
  results: ImportItemResult[];
};
