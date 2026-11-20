"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";

/**
 * "Show my photo on this CV". Saves the choice on this CV only
 * (PATCH /api/tailor/[id]); the profile's default is unchanged. With no
 * photo on the profile it is a link to add one instead.
 */
export function PhotoToggle({
  id,
  hasPhoto,
  initialShown,
}: {
  id: string;
  hasPhoto: boolean;
  initialShown: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [shown, setShown] = useState(initialShown);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!hasPhoto) {
    return (
      <p className="rm-preview-photo">
        <Link href="/profile#cv-photo">{t("resumatch.photo.toggle.add")}</Link>
        <span className="rm-preview-photo__hint">
          {" "}
          · {t("resumatch.photo.toggle.hint")}
        </span>
      </p>
    );
  }

  async function change(next: boolean) {
    setBusy(true);
    setFailed(false);
    setShown(next);
    try {
      const response = await fetch(`/api/tailor/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ showPhoto: next }),
      });
      if (!response.ok) throw new Error(String(response.status));
      router.refresh();
    } catch {
      setShown(!next);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rm-preview-photo">
      <label className="rm-photo-toggle">
        <input
          type="checkbox"
          checked={shown}
          disabled={busy}
          onChange={(event) => void change(event.target.checked)}
          data-testid="cv-photo-toggle"
        />
        {t("resumatch.photo.toggle.label")}
        {failed ? (
          <span role="alert" className="rm-photo-toggle__error">
            {" "}
            {t("resumatch.photo.toggle.failed")}
          </span>
        ) : null}
      </label>
      <span className="rm-preview-photo__hint">
        {t("resumatch.photo.toggle.hint")}
      </span>
    </div>
  );
}
