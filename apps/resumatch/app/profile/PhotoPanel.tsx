"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button, Card, ConfirmDialog } from "@asafarim/ui";
import {
  MAX_PHOTO_BYTES,
  MAX_SOURCE_PHOTO_BYTES,
  PHOTO_OUTPUT_PIXELS,
  type PhotoShape,
} from "../../lib/profile/photo";

export interface PhotoPanelPhoto {
  src: string;
  shape: PhotoShape;
  includeByDefault: boolean;
}

/** Side of the on-screen crop square, in CSS pixels. */
const STAGE = 260;
const MAX_ZOOM = 4;
const ACCEPT = "image/jpeg,image/png,image/webp";

interface Draft {
  url: string;
  bitmap: ImageBitmap;
  zoom: number;
  /** Top-left of the scaled image, relative to the stage. */
  x: number;
  y: number;
}

function baseScale(bitmap: ImageBitmap): number {
  return STAGE / Math.min(bitmap.width, bitmap.height);
}

/** Keep the image covering the whole stage: no empty edge in the crop. */
function clamp(draft: Draft): Draft {
  const scale = baseScale(draft.bitmap) * draft.zoom;
  const minX = STAGE - draft.bitmap.width * scale;
  const minY = STAGE - draft.bitmap.height * scale;
  return {
    ...draft,
    x: Math.min(0, Math.max(minX, draft.x)),
    y: Math.min(0, Math.max(minY, draft.y)),
  };
}

function centred(url: string, bitmap: ImageBitmap): Draft {
  const scale = baseScale(bitmap);
  return {
    url,
    bitmap,
    zoom: 1,
    x: (STAGE - bitmap.width * scale) / 2,
    y: (STAGE - bitmap.height * scale) / 2,
  };
}

/** The visible square, drawn at PHOTO_OUTPUT_PIXELS and re-encoded as JPEG.
 *  Re-encoding through a canvas is also what drops the original's EXIF
 *  (location, camera); the server strips metadata again regardless. */
async function renderCrop(draft: Draft): Promise<Blob> {
  const scale = baseScale(draft.bitmap) * draft.zoom;
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_OUTPUT_PIXELS;
  canvas.height = PHOTO_OUTPUT_PIXELS;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("NO_CANVAS");
  context.fillStyle = "#ffffff"; // a transparent PNG gets a white, not black, background
  context.fillRect(0, 0, PHOTO_OUTPUT_PIXELS, PHOTO_OUTPUT_PIXELS);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    draft.bitmap,
    -draft.x / scale,
    -draft.y / scale,
    STAGE / scale,
    STAGE / scale,
    0,
    0,
    PHOTO_OUTPUT_PIXELS,
    PHOTO_OUTPUT_PIXELS
  );
  for (const quality of [0.88, 0.78, 0.65]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (blob && blob.size <= MAX_PHOTO_BYTES) return blob;
  }
  throw new Error("TOO_LARGE");
}

/**
 * The optional CV photo on /profile: add, crop (drag or arrow keys, zoom
 * slider), choose round or square, choose whether new CVs show it, replace
 * and remove. Everything before the upload happens in the browser; the
 * original file never leaves the device, only the cropped 600 × 600 JPEG.
 */
export function PhotoPanel({
  initialPhoto,
}: {
  initialPhoto: PhotoPanelPhoto | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const ids = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const [photo, setPhoto] = useState(initialPhoto);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [shape, setShape] = useState<PhotoShape>(
    initialPhoto?.shape ?? "circle"
  );
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{
    tone: "info" | "error";
    text: string;
  } | null>(null);

  // Release the decoded image and its object URL when a new one is picked,
  // the crop is cancelled or saved, or the panel unmounts. Keyed on the
  // bitmap, not the draft: panning and zooming make a new draft object
  // around the same bitmap, which must stay open.
  const bitmap = draft?.bitmap ?? null;
  const objectUrl = draft?.url ?? null;
  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      bitmap?.close();
    },
    [bitmap, objectUrl]
  );

  const errorText = useCallback(
    (code: string | undefined) => {
      const known = [
        "TOO_LARGE",
        "NOT_JPEG",
        "NOT_SQUARE",
        "BAD_DIMENSIONS",
        "CORRUPT",
        "EMPTY",
      ];
      return t(
        `resumatch.photo.error.${code && known.includes(code) ? code : "generic"}`
      );
    },
    [t]
  );

  async function pick(file: File) {
    setMessage(null);
    if (!ACCEPT.split(",").includes(file.type)) {
      setMessage({ tone: "error", text: t("resumatch.photo.error.type") });
      return;
    }
    if (file.size > MAX_SOURCE_PHOTO_BYTES) {
      setMessage({
        tone: "error",
        text: t("resumatch.photo.error.sourceTooLarge", { max: "15 MB" }),
      });
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      if (Math.min(bitmap.width, bitmap.height) < 200) {
        bitmap.close();
        setMessage({
          tone: "error",
          text: t("resumatch.photo.error.tooSmall"),
        });
        return;
      }
      setDraft(centred(URL.createObjectURL(file), bitmap));
    } catch {
      setMessage({ tone: "error", text: t("resumatch.photo.error.type") });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function zoomTo(next: number) {
    setDraft((current) => {
      if (!current) return current;
      // Zoom around the centre of the crop, so the face stays put.
      const ratio = next / current.zoom;
      const centre = STAGE / 2;
      return clamp({
        ...current,
        zoom: next,
        x: centre - (centre - current.x) * ratio,
        y: centre - (centre - current.y) * ratio,
      });
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 20 : 5;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setDraft((current) =>
        current
          ? clamp({
              ...current,
              x: current.x + move[0],
              y: current.y + move[1],
            })
          : current
      );
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      if (draft) zoomTo(Math.min(MAX_ZOOM, draft.zoom + 0.1));
    } else if (event.key === "-") {
      event.preventDefault();
      if (draft) zoomTo(Math.max(1, draft.zoom - 0.1));
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!draft) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: draft.x,
      y: draft.y,
    };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDraft((current) =>
      current
        ? clamp({
            ...current,
            x: drag.x + event.clientX - drag.startX,
            y: drag.y + event.clientY - drag.startY,
          })
        : current
    );
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    try {
      const blob = await renderCrop(draft);
      const form = new FormData();
      form.set("photo", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      const response = await fetch("/api/profile/photo", {
        method: "POST",
        body: form,
      });
      const body = (await response.json().catch(() => ({}))) as {
        photo?: PhotoPanelPhoto;
        error?: string;
      };
      if (!response.ok || !body.photo) {
        setMessage({ tone: "error", text: errorText(body.error) });
        return;
      }
      // A new upload keeps the chosen shape.
      let saved = body.photo;
      if (saved.shape !== shape) saved = (await patch({ shape })) ?? saved;
      setPhoto(saved);
      setDraft(null);
      setMessage({ tone: "info", text: t("resumatch.photo.saved") });
      router.refresh();
    } catch (error) {
      setMessage({
        tone: "error",
        text: errorText(error instanceof Error ? error.message : undefined),
      });
    } finally {
      setBusy(false);
    }
  }

  async function patch(settings: {
    shape?: PhotoShape;
    includeByDefault?: boolean;
  }): Promise<PhotoPanelPhoto | null> {
    const response = await fetch("/api/profile/photo", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { photo?: PhotoPanelPhoto };
    return body.photo ?? null;
  }

  async function changeSetting(settings: {
    shape?: PhotoShape;
    includeByDefault?: boolean;
  }) {
    if (settings.shape) setShape(settings.shape);
    if (!photo) return; // before the first upload, shape is just a local choice
    setBusy(true);
    setMessage(null);
    try {
      const updated = await patch(settings);
      if (!updated) throw new Error("PATCH_FAILED");
      setPhoto(updated);
      router.refresh();
    } catch {
      if (settings.shape) setShape(photo.shape);
      setMessage({ tone: "error", text: t("resumatch.photo.error.generic") });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setConfirming(false);
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/profile/photo", { method: "DELETE" });
      if (!response.ok && response.status !== 404)
        throw new Error("DELETE_FAILED");
      setPhoto(null);
      setMessage({ tone: "info", text: t("resumatch.photo.removed") });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: t("resumatch.photo.error.delete") });
    } finally {
      setBusy(false);
    }
  }

  const scale = draft ? baseScale(draft.bitmap) * draft.zoom : 1;

  return (
    <div id="cv-photo" className="rm-photo">
      <Card title={t("resumatch.photo.title")}>
        <p className="rm-photo__intro">{t("resumatch.photo.intro")}</p>
        <p className="rm-photo__regions">{t("resumatch.photo.regions")}</p>

        {draft ? (
          <div className="rm-photo__editor">
            <p id={`${ids}-help`} className="rm-photo__help">
              {t("resumatch.photo.crop.help")}
            </p>
            <div
              className={`rm-photo__stage rm-photo__stage--${shape}`}
              style={{ width: STAGE, height: STAGE }}
              tabIndex={0}
              role="group"
              aria-label={t("resumatch.photo.crop.aria")}
              aria-describedby={`${ids}-help`}
              onKeyDown={onKeyDown}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              data-testid="photo-crop-stage"
            >
              <img
                src={draft.url}
                alt=""
                draggable={false}
                style={{
                  width: draft.bitmap.width * scale,
                  height: draft.bitmap.height * scale,
                  transform: `translate(${draft.x}px, ${draft.y}px)`,
                }}
              />
              <span className="rm-photo__mask" aria-hidden="true" />
            </div>
            <label className="rm-photo__zoom">
              {t("resumatch.photo.crop.zoom")}
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={draft.zoom}
                onChange={(event) => zoomTo(Number(event.target.value))}
              />
            </label>
          </div>
        ) : photo ? (
          <div className="rm-photo__current">
            <img
              className={`rm-photo__thumb rm-photo__thumb--${shape}`}
              src={photo.src}
              alt={t("resumatch.photo.currentAlt")}
              width={112}
              height={112}
              data-testid="profile-photo"
            />
          </div>
        ) : (
          <p className="rm-photo__none">{t("resumatch.photo.none")}</p>
        )}

        <fieldset className="rm-photo__shape" disabled={busy}>
          <legend>{t("resumatch.photo.shape.legend")}</legend>
          {(["circle", "square"] as const).map((option) => (
            <label key={option}>
              <input
                type="radio"
                name={`${ids}-shape`}
                value={option}
                checked={shape === option}
                onChange={() => void changeSetting({ shape: option })}
              />
              {t(`resumatch.photo.shape.${option}`)}
            </label>
          ))}
        </fieldset>

        {photo && !draft ? (
          <label className="rm-photo__default">
            <input
              type="checkbox"
              checked={photo.includeByDefault}
              disabled={busy}
              onChange={(event) =>
                void changeSetting({ includeByDefault: event.target.checked })
              }
              data-testid="photo-include-default"
            />
            <span>
              {t("resumatch.photo.includeDefault")}
              <span className="rm-photo__default-hint">
                {t("resumatch.photo.includeDefaultHint")}
              </span>
            </span>
          </label>
        ) : null}

        <div className="rm-photo__actions">
          {draft ? (
            <>
              <Button onClick={() => void save()} disabled={busy}>
                {busy ? t("resumatch.photo.saving") : t("resumatch.photo.save")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDraft(null)}
                disabled={busy}
              >
                {t("resumatch.photo.cancel")}
              </Button>
            </>
          ) : (
            <>
              <label
                className={`ui-btn ui-btn--${photo ? "ghost" : "primary"} rm-photo__pick${busy ? " is-disabled" : ""}`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="rm-photo__file"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void pick(file);
                  }}
                  data-testid="photo-file"
                />
                {photo
                  ? t("resumatch.photo.replace")
                  : t("resumatch.photo.add")}
              </label>
              {photo ? (
                <Button
                  variant="danger"
                  onClick={() => setConfirming(true)}
                  disabled={busy}
                >
                  {t("resumatch.photo.remove")}
                </Button>
              ) : null}
            </>
          )}
        </div>
        <p className="rm-photo__formats">{t("resumatch.photo.formats")}</p>

        <div aria-live="polite">
          {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
        </div>
      </Card>

      <ConfirmDialog
        open={confirming}
        title={t("resumatch.photo.dialog.title")}
        message={t("resumatch.photo.dialog.message")}
        confirmLabel={t("resumatch.photo.dialog.confirm")}
        cancelLabel={t("resumatch.photo.dialog.cancel")}
        tone="danger"
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
