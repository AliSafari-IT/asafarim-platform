"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button, Card } from "@asafarim/ui";
import { ContactPreferencesFields, contactPreferencesProblem } from "../../components/contactPreferences/ContactPreferencesFields";
import { EMPTY_PREFERENCES, type ContactPreferences } from "../../lib/contactPreferences/contract";

/**
 * The saved contact preferences (#940): the defaults every application
 * email uses unless the candidate changes or leaves them out there.
 */
export function ContactPreferencesPanel({ initial }: { initial: ContactPreferences | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [value, setValue] = useState<ContactPreferences>(initial ?? EMPTY_PREFERENCES);
  const [saved, setSaved] = useState<ContactPreferences | null>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  // The stored value changed under the form (erased, or saved elsewhere,
  // then refreshed): start again from it, so a later save can't write
  // back values that are gone.
  const storedKey = JSON.stringify(initial);
  const [seen, setSeen] = useState(storedKey);
  if (seen !== storedKey) {
    setSeen(storedKey);
    setSaved(initial);
    setValue(initial ?? EMPTY_PREFERENCES);
  }
  const problem = contactPreferencesProblem(value);
  const unchanged = saved !== null && JSON.stringify(saved) === JSON.stringify(value);

  async function put(preferences: ContactPreferences | null) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/contact-preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences }),
      });
      const data = (await res.json().catch(() => ({}))) as { preferences?: ContactPreferences | null; code?: string };
      if (!res.ok) {
        setNote({ tone: "error", text: data.code ? t(`resumatch.contact.error.${data.code}`) : t("resumatch.contact.error.save") });
        return;
      }
      const stored = data.preferences ?? null;
      setSaved(stored);
      setValue(stored ?? EMPTY_PREFERENCES);
      setNote({ tone: "info", text: t(stored ? "resumatch.contact.saved" : "resumatch.contact.removed") });
      // Keeps the page's own copy (and the erase button's "has data") current.
      router.refresh();
    } catch {
      setNote({ tone: "error", text: t("resumatch.contact.error.save") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="contact-preferences" className="rm-contact" data-testid="contact-preferences-panel">
      <Card title={t("resumatch.contact.title")}>
        <p className="rm-contact__intro">{t("resumatch.contact.intro")}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem) void put(value);
          }}
        >
          <ContactPreferencesFields value={value} onChange={setValue} disabled={busy} />
          <div className="rm-contact__actions">
            <Button type="submit" disabled={busy || problem !== null || unchanged}>
              {t("resumatch.contact.save")}
            </Button>
            {saved ? (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void put(null)}>
                {t("resumatch.contact.remove")}
              </Button>
            ) : null}
          </div>
        </form>
        {note ? (
          <div className="rm-contact__note">
            <Alert tone={note.tone}>{note.text}</Alert>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
