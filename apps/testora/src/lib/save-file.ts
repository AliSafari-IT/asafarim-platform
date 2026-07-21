/**
 * Save text to a file the production way: open the OS "Save As" dialog via the
 * File System Access API so the user picks the folder *and* the name in one
 * step. Falls back to a normal download (using the suggested name) on browsers
 * without the API (e.g. Firefox/Safari).
 *
 * Client-only — it touches `window`/`document`.
 */

interface MinimalWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface MinimalFileHandle {
  createWritable(): Promise<MinimalWritable>;
}
type SaveFilePicker = (options?: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<MinimalFileHandle>;

export interface SaveFileOptions {
  /** Default name shown in the dialog, including extension. */
  suggestedName: string;
  mimeType: string;
  extension: string;
  description: string;
}

export type SaveOutcome = "saved" | "cancelled" | "downloaded";

export async function saveTextFile(content: string, opts: SaveFileOptions): Promise<SaveOutcome> {
  const blob = new Blob([content], { type: `${opts.mimeType};charset=utf-8` });
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: opts.suggestedName,
        types: [{ description: opts.description, accept: { [opts.mimeType]: [`.${opts.extension}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (err) {
      // User dismissed the dialog — not an error worth surfacing.
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // Anything else (e.g. permission/quirk): fall through to a plain download.
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = opts.suggestedName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
