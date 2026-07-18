import { buildKey, putObjectBytes, deleteObject } from "@asafarim/storage";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

export type SaveAvatarResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

function inferContentType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

function extensionFor(contentType: string): string {
  return (
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/svg+xml": "svg",
    }[contentType] ?? "bin"
  );
}

export function validateAvatar(file: File): { ok: true } | { ok: false; error: string } {
  if (!file || file.size === 0) {
    return { ok: false, error: "Please select an image file." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: "Avatar must be smaller than 2 MB." };
  }
  const contentType = inferContentType(file);
  if (!ALLOWED_AVATAR_TYPES.includes(contentType)) {
    return { ok: false, error: "Avatar must be a JPEG, PNG, WebP, GIF, or SVG." };
  }
  return { ok: true };
}

export async function saveAvatar(userId: string, file: File): Promise<SaveAvatarResult> {
  const validation = validateAvatar(file);
  if (!validation.ok) return validation;

  const contentType = inferContentType(file);
  const ext = extensionFor(contentType);
  const key = buildKey(`hub/avatars/${userId.slice(0, 8)}`, ext);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await putObjectBytes(key, buffer, contentType);
    return { ok: true, url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return { ok: false, error: message };
  }
}

export async function removeAvatar(url: string): Promise<void> {
  try {
    const parsed = new URL(url);
    const key = parsed.pathname.replace(/^\//, "");
    await deleteObject(key);
  } catch {
    // ignore — not a URL we can parse
  }
}
