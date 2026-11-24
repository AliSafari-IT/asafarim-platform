"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button } from "@asafarim/ui";
<<<<<<< HEAD
import { MAX_IMPORT_BYTES, type ImportVersionChoice, type ProfileImportPreview } from "../../lib/profile/exportImport";
=======
import type { ImportVersionChoice, ProfileImportPreview } from "../../lib/profile/exportImport";
>>>>>>> origin/main

interface Destination {
  hasProfile: boolean;
  latestVersionNumber: number | null;
  latestIsConfirmed: boolean;
}

interface ImportResponse {
  code?: string;
  field?: string;
  versions?: ImportVersionChoice[];
  preview?: ProfileImportPreview;
  destination?: Destination;
  versionId?: string;
  versionNumber?: number;
  unchanged?: boolean;
}

const SECTIONS = ["experience", "skills", "education", "certifications", "languages", "links"] as const;
const FIELDS = ["fullName", "email", "phone", "headline", "summary", "baseLocation", "workAuthorization", "preferences"] as const;

/**
 * The preview and confirmation for importing a ResuMatch export (#942).
 *
 * Nothing is written until the candidate presses Import, and the server
 * reads the file again then. The import lands as an unconfirmed version,
 * so the profile form below still has to be confirmed before tailoring.
 */
export function ProfileImportPanel({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProfileImportPreview | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [choices, setChoices] = useState<ImportVersionChoice[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);

  const explain = useCallback(
    (body: ImportResponse) =>
      body.code
        ? t(`resumatch.import.error.${body.code}`, { field: body.field ?? "" })
        : t("resumatch.import.error.IMPORT_FAILED"),
    [t],
  );

  const send = useCallback(
    async (mode: "preview" | "import", versionId: string | null) => {
      const form = new FormData();
      form.set("file", file);
      form.set("mode", mode);
      if (versionId) form.set("versionId", versionId);
      if (mode === "import" && replace) form.set("replaceExisting", "true");
      const response = await fetch("/api/profile/import", { method: "POST", body: form });
      return { ok: response.ok, body: (await response.json()) as ImportResponse };
    },
    [file, replace],
  );

  const load = useCallback(
    async (versionId: string | null) => {
      setBusy(true);
      setError(null);
<<<<<<< HEAD
      if (file.size > MAX_IMPORT_BYTES) {
        // Checked here too: above the server's request limit the body would
        // arrive cut short and only say "invalid request".
        setError(t("resumatch.import.error.FILE_TOO_LARGE"));
        setBusy(false);
        return;
      }
=======
>>>>>>> origin/main
      try {
        const { ok, body } = await send("preview", versionId);
        if (ok && body.preview) {
          setPreview(body.preview);
          setDestination(body.destination ?? null);
          setChoices(null);
        } else if (body.code === "NO_CONFIRMED_VERSION" && body.versions) {
          setPreview(null);
          setChoices(body.versions);
        } else {
          setPreview(null);
          setError(explain(body));
        }
      } catch {
        setError(t("resumatch.import.error.network"));
      } finally {
        setBusy(false);
      }
    },
<<<<<<< HEAD
    [send, explain, t, file],
=======
    [send, explain, t],
>>>>>>> origin/main
  );

  useEffect(() => {
    void load(null);
    // Only when a new file comes in; a version choice calls load itself.
  }, [file]);

  const runImport = useCallback(async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const { ok, body } = await send("import", preview.source.id);
      if (!ok) {
        setError(explain(body));
        return;
      }
      onDone(
        body.unchanged
          ? t("resumatch.import.unchanged")
          : t("resumatch.import.done", { number: String(body.versionNumber ?? "") }),
      );
    } catch {
      setError(t("resumatch.import.error.network"));
    } finally {
      setBusy(false);
    }
  }, [preview, send, explain, onDone, t]);

  const needsReplace = destination?.hasProfile ?? false;

  return (
    <section className="rx-import" aria-labelledby="rx-import-title" aria-busy={busy}>
      <h3 id="rx-import-title" className="rx-import__title">
        {t("resumatch.import.title")}
      </h3>
      <p className="rx-import__muted">{t("resumatch.import.intro")}</p>

      {busy && !preview && !choices ? <p className="jm-mono">{t("resumatch.import.reading")}</p> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {choices ? (
        <fieldset className="rx-import__choose">
          <legend>{t("resumatch.import.choose.title")}</legend>
          <p className="rx-import__muted">{t("resumatch.import.choose.body")}</p>
          {choices.map((choice) => (
            <label key={choice.id} className="rx-import__option">
              <input
                type="radio"
                name="rx-import-version"
                value={choice.id}
                checked={chosen === choice.id}
                onChange={() => setChosen(choice.id)}
              />
              {t("resumatch.import.choose.option", {
                number: String(choice.versionNumber),
                date: choice.createdAt?.slice(0, 10) ?? "—",
              })}
            </label>
          ))}
          <div className="rx-import__actions">
            <Button size="sm" disabled={!chosen || busy} onClick={() => void load(chosen)}>
              {t("resumatch.import.choose.preview")}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
              {t("resumatch.import.cancel")}
            </Button>
          </div>
        </fieldset>
      ) : null}

      {preview ? (
        <>
          <p>
            {t(preview.usedConfirmedVersion ? "resumatch.import.source.confirmed" : "resumatch.import.source.chosen", {
              number: String(preview.source.versionNumber),
            })}
            {preview.exportedAt ? ` ${t("resumatch.import.exportedAt", { date: preview.exportedAt.slice(0, 10) })}` : ""}
          </p>

          <h4 className="rx-import__subtitle">{t("resumatch.import.counts.title")}</h4>
          <dl className="rx-import__counts">
            {SECTIONS.map((section) => (
              <div key={section} className="rx-import__count">
                <dt>{t(`resumatch.import.section.${section}`)}</dt>
                <dd>
                  {t("resumatch.import.counts.row", {
                    imported: String(preview.counts[section].imported),
                    total: String(preview.counts[section].inExport),
                  })}
                </dd>
              </div>
            ))}
          </dl>

          <h4 className="rx-import__subtitle">{t("resumatch.import.fields.title")}</h4>
          <p className="rx-import__muted">
            {FIELDS.filter((f) => preview.fields[f]).length > 0
              ? FIELDS.filter((f) => preview.fields[f])
                  .map((f) => t(`resumatch.import.field.${f}`))
                  .join(", ")
              : t("resumatch.import.fields.none")}
          </p>

          {preview.excluded.length > 0 ? (
            <>
              <h4 className="rx-import__subtitle">{t("resumatch.import.excluded.title")}</h4>
              <ul className="rx-import__excluded">
                {preview.excluded.map((item) => (
                  <li key={item.part}>{t(`resumatch.import.excluded.${item.part}`, { count: String(item.count) })}</li>
                ))}
              </ul>
              <p className="rx-import__muted">{t("resumatch.import.excluded.why")}</p>
            </>
          ) : null}

          <Alert tone="info">{t("resumatch.import.unconfirmed")}</Alert>
          <p className="rx-import__muted">{t("resumatch.insights.strengthNote")}</p>

          {needsReplace ? (
            <>
              <Alert tone="warning">
                {t("resumatch.import.existing", { number: String(destination?.latestVersionNumber ?? "") })}
              </Alert>
              <label className="rx-import__option">
                <input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />
                {t("resumatch.import.replace")}
              </label>
            </>
          ) : null}

          <div className="rx-import__actions">
            <Button disabled={busy || (needsReplace && !replace)} onClick={() => void runImport()}>
              {t("resumatch.import.confirm")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onCancel}>
              {t("resumatch.import.cancel")}
            </Button>
          </div>
        </>
      ) : null}

      {!preview && !choices && !busy ? (
        <div className="rx-import__actions">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("resumatch.import.cancel")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
