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
      <div className="rm-appearance__setting">
        <p className="rm-appearance__control">
          <Link href="/profile#cv-photo" className="rm-preview-link">
            {t("resumatch.photo.toggle.add")}
          </Link>
        </p>
        <p className="rm-appearance__hint">{t("resumatch.photo.toggle.hint")}</p>
      </div>
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
    <div className="rm-appearance__setting">
      <label className="rm-photo-toggle rm-appearance__control">
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
      <p className="rm-appearance__hint">{t("resumatch.photo.toggle.hint")}</p>
    </div>
  );
}
