"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button, ConfirmDialog } from "@asafarim/ui";
import {
  EVIDENCE_KINDS,
  MAX_EVIDENCE_DETAIL_CHARS,
  MAX_EVIDENCE_TITLE_CHARS,
  type EvidenceKind,
  type EvidenceScope,
  sameExperience,
  type ExperienceRef,
} from "../../lib/evidence/contract";
import type { EvidenceView } from "../../lib/evidence/store";

/**
 * Background evidence for one job (#929): the candidate adds projects,
 * achievements, responsibilities or their motivation, reviews them, and
 * confirms them. Only confirmed items are used, and an item applies to this
 * application unless the candidate explicitly keeps it for all of them.
 */

interface Draft {
  /** Set when editing an existing item. */
  id: string | null;
  baseRevisionId: string | null;
  kind: EvidenceKind;
  title: string;
  detail: string;
  /** The chosen role as the candidate picked it, or null for no single
   *  role. Kept as the reference itself, not a list position or key, so a
   *  roles refresh while the form is open (a profile fix, a language
   *  switch) only changes how it is shown, never what is saved. */
  role: ExperienceRef | null;
  scope: EvidenceScope;
  /** The job an edited application item already belongs to; it stays there
   *  unless the candidate moves it to background. Null: this job. */
  jobId: string | null;
}

const EMPTY: Draft = { id: null, baseRevisionId: null, kind: "ACHIEVEMENT", title: "", detail: "", role: null, scope: "APPLICATION", jobId: null };

const KEPT_ROLE = "kept";

function roleKey(ref: ExperienceRef): string {
  return JSON.stringify([ref.title, ref.employer, ref.startedOn]);
}

/** The picker label. The start date tells repeat roles (same title and employer) apart. */
function roleLabel(ref: ExperienceRef): string {
  const name = ref.employer ? `${ref.title} · ${ref.employer}` : ref.title;
  return ref.startedOn ? `${name} · ${ref.startedOn}` : name;
}

/** The picker entry for an item's link: an exact match first, then the
 *  same role written differently (case, spacing, a date added later). */
function roleIndexFor(roles: ExperienceRef[], ref: ExperienceRef): number {
  const exact = roles.findIndex((r) => roleKey(r) === roleKey(ref));
  if (exact >= 0) return exact;
  const matches = roles.flatMap((r, index) => (sameExperience(r, ref) ? [index] : []));
  // Two stints match a date-less link: don't guess between them.
  return matches.length === 1 ? matches[0]! : -1;
}

/** The picker value showing a chosen role: its entry in the current list,
 *  or KEPT_ROLE when the list has no single match for it. */
function roleValue(roles: ExperienceRef[], role: ExperienceRef | null): string {
  if (!role) return "";
  const index = roleIndexFor(roles, role);
  return index >= 0 ? roleKey(roles[index]!) : KEPT_ROLE;
}

export function EvidencePanel({ targetJobId, onUsedCountChange }: { targetJobId: string; onUsedCountChange?: (count: number) => void }) {
  const { t } = useTranslation();
  const formId = useId();
  const [items, setItems] = useState<EvidenceView[] | null>(null);
  const [roles, setRoles] = useState<ExperienceRef[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<EvidenceView | null>(null);

  const load = useCallback(async (): Promise<EvidenceView[] | null> => {
    try {
      const res = await fetch(`/api/evidence?targetJobId=${encodeURIComponent(targetJobId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { items: EvidenceView[]; roles: ExperienceRef[] };
      setItems(body.items);
      setRoles(body.roles);
      return body.items;
    } catch {
      setError(t("resumatch.evidence.error.load"));
      return null;
    }
  }, [targetJobId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const usedCount = items?.filter((item) => item.excludedBecause === null).length ?? 0;
  useEffect(() => {
    onUsedCountChange?.(usedCount);
  }, [usedCount, onUsedCountChange]);

  async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; status: number; data: { error?: string; code?: string } | null }> {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    return { ok: res.ok, status: res.status, data };
  }

  async function save(confirm: boolean) {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const role =
      draft.kind === "MOTIVATION" ? null : draft.role;
    const payload = {
      kind: draft.kind,
      title: draft.title,
      detail: draft.detail,
      experienceRef: role,
      scope: draft.scope,
      targetJobId: draft.jobId ?? targetJobId,
      confirm,
      ...(draft.id ? { baseRevisionId: draft.baseRevisionId } : {}),
    };
    try {
      const result = draft.id
        ? await send(`/api/evidence/${draft.id}`, "PUT", payload)
        : await send("/api/evidence", "POST", payload);
      if (result.ok) {
        setDraft(null);
        setNotice(t(confirm ? "resumatch.evidence.saved.confirmed" : "resumatch.evidence.saved.draft"));
        await load();
      } else if (result.data?.code === "EVIDENCE_STALE") {
        // Keep what the candidate typed; point it at the latest revision so
        // the next save is a deliberate one over what is there now.
        const refreshed = await load();
        const latest = refreshed?.find((item) => item.id === draft.id);
        if (latest) setDraft({ ...draft, baseRevisionId: latest.revisionId });
        // Only a successful refresh can show the item is gone; a failed one
        // keeps the id, so the next save can't create a duplicate.
        else if (refreshed) setDraft({ ...draft, id: null, baseRevisionId: null });
        setError(t("resumatch.evidence.error.stale"));
      } else {
        setError(result.data?.error ?? t("resumatch.evidence.error.save"));
      }
    } catch {
      setError(t("resumatch.evidence.error.network"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmItem(item: EvidenceView) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await send(`/api/evidence/${item.id}/confirm`, "POST", { revisionId: item.revisionId });
      if (result.ok) setNotice(t("resumatch.evidence.saved.confirmed"));
      else setError(result.data?.code === "EVIDENCE_STALE" ? t("resumatch.evidence.error.stale") : (result.data?.error ?? t("resumatch.evidence.error.save")));
      await load();
    } catch {
      setError(t("resumatch.evidence.error.network"));
    } finally {
      setBusy(false);
    }
  }

  /** "Use for all applications": the explicit background confirmation. */
  async function keepForAll(item: EvidenceView) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await send(`/api/evidence/${item.id}`, "PUT", {
        baseRevisionId: item.revisionId,
        kind: item.kind,
        title: item.title,
        detail: item.detail,
        experienceRef: item.experienceRef,
        scope: "BACKGROUND",
        confirm: true,
      });
      if (result.ok) setNotice(t("resumatch.evidence.saved.background"));
      else setError(result.data?.code === "EVIDENCE_STALE" ? t("resumatch.evidence.error.stale") : (result.data?.error ?? t("resumatch.evidence.error.save")));
      await load();
    } catch {
      setError(t("resumatch.evidence.error.network"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: EvidenceView) {
    setDeleting(null);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await send(`/api/evidence/${item.id}`, "DELETE", undefined);
      if (!result.ok && result.status !== 404) setError(result.data?.error ?? t("resumatch.evidence.error.save"));
      else setNotice(t("resumatch.evidence.deleted"));
      if (draft?.id === item.id) setDraft(null);
      await load();
    } catch {
      setError(t("resumatch.evidence.error.network"));
    } finally {
      setBusy(false);
    }
  }

  function edit(item: EvidenceView) {
    setNotice(null);
    setError(null);
    setDraft({
      id: item.id,
      baseRevisionId: item.revisionId,
      kind: item.kind,
      title: item.title,
      detail: item.detail,
      // The item's own link, as saved: the picker shows it against the
      // current roles, and an unrelated edit never changes or drops it.
      role: item.experienceRef,
      scope: item.scope,
      jobId: item.scope === "APPLICATION" ? item.targetJobId : null,
    });
  }

  const forJob = items?.filter((item) => item.scope === "APPLICATION" && item.targetJobId === targetJobId) ?? [];
  // Saved for jobs never finished, or other applications: still managed here.
  const otherJobs = items?.filter((item) => item.scope === "APPLICATION" && item.targetJobId !== targetJobId) ?? [];
  const background = items?.filter((item) => item.scope === "BACKGROUND") ?? [];

  function renderItem(item: EvidenceView) {
    return (
      <li key={item.id} className="rm-evidence__item" data-testid="evidence-item">
        <div className="rm-evidence__head">
          <span className="rm-evidence__kind">{t(`resumatch.evidence.kind.${item.kind}`)}</span>
          <strong>{item.title}</strong>
          <span className={`rm-evidence__status rm-evidence__status--${item.excludedBecause === null ? "used" : "unused"}`}>
            {item.excludedBecause === null ? t("resumatch.evidence.status.used") : t(`resumatch.evidence.status.${item.excludedBecause}`)}
          </span>
        </div>
        <p className="rm-evidence__detail">{item.detail}</p>
        {item.excludedBecause === "other_job" ? (
          <p className="rm-evidence__role">
            {t("resumatch.evidence.otherJob.label")}: {item.jobTitle ?? t("resumatch.evidence.otherJob.untitled")}
          </p>
        ) : null}
        {item.experienceRef ? (
          <p className="rm-evidence__role">
            {t("resumatch.evidence.role.label")}: {roleLabel(item.experienceRef)}
          </p>
        ) : null}
        <div className="rm-evidence__actions">
          {item.status === "DRAFT" ? (
            <Button size="sm" disabled={busy} onClick={() => void confirmItem(item)}>
              {t("resumatch.evidence.action.confirm")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => edit(item)}>
            {t("resumatch.evidence.action.edit")}
          </Button>
          {item.scope === "APPLICATION" && item.status === "CONFIRMED" && item.excludedBecause === null ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void keepForAll(item)}>
              {t("resumatch.evidence.action.keepForAll")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeleting(item)}>
            {t("resumatch.evidence.action.delete")}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <details className="rm-evidence" data-testid="evidence-panel">
      <summary>
        {t("resumatch.evidence.summary")} <span className="rm-evidence__count">{t("resumatch.evidence.usedCount", { count: usedCount })}</span>
      </summary>
      <p className="rm-evidence__hint">
        {t("resumatch.evidence.hint")} <Link href="/profile">{t("resumatch.evidence.skillsInProfile")}</Link>
      </p>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? (
        <p className="rm-evidence__notice" role="status">
          {notice}
        </p>
      ) : null}

      {items === null && !error ? <p className="rm-evidence__hint">{t("resumatch.evidence.loading")}</p> : null}

      {items && items.length > 0 ? (
        <>
          <h4 className="rm-evidence__group">{t("resumatch.evidence.group.application")}</h4>
          {forJob.length > 0 ? <ul className="rm-evidence__list">{forJob.map(renderItem)}</ul> : <p className="rm-evidence__hint">{t("resumatch.evidence.group.empty")}</p>}
          <h4 className="rm-evidence__group">{t("resumatch.evidence.group.background")}</h4>
          {background.length > 0 ? <ul className="rm-evidence__list">{background.map(renderItem)}</ul> : <p className="rm-evidence__hint">{t("resumatch.evidence.group.empty")}</p>}
          {otherJobs.length > 0 ? (
            <>
              <h4 className="rm-evidence__group">{t("resumatch.evidence.group.otherJobs")}</h4>
              <ul className="rm-evidence__list">{otherJobs.map(renderItem)}</ul>
            </>
          ) : null}
        </>
      ) : null}

      {draft ? (
        <form
          className="rm-evidence__form"
          aria-label={t(draft.id ? "resumatch.evidence.form.editTitle" : "resumatch.evidence.form.addTitle")}
          onSubmit={(e) => {
            e.preventDefault();
            void save(true);
          }}
        >
          {/* Locked while a save is in flight, so nothing typed meanwhile is lost. */}
          <fieldset className="rm-evidence__fields" disabled={busy}>
          <label className="jm-field">
            <span>{t("resumatch.evidence.form.kind")}</span>
            <select
              className="ui-input ui-select"
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as EvidenceKind, role: e.target.value === "MOTIVATION" ? null : draft.role })}
            >
              {EVIDENCE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`resumatch.evidence.kind.${kind}`)}
                </option>
              ))}
            </select>
            <small>{t(draft.kind === "MOTIVATION" ? "resumatch.evidence.form.kindHelpMotivation" : "resumatch.evidence.form.kindHelpFact")}</small>
          </label>
          <label className="jm-field">
            <span>{t("resumatch.evidence.form.title")}</span>
            <input
              className="ui-input"
              value={draft.title}
              maxLength={MAX_EVIDENCE_TITLE_CHARS}
              required
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="jm-field">
            <span>{t("resumatch.evidence.form.detail")}</span>
            <textarea
              className="ui-input"
              rows={3}
              value={draft.detail}
              maxLength={MAX_EVIDENCE_DETAIL_CHARS}
              required
              aria-describedby={`${formId}-detail-count`}
              onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
            />
            <small id={`${formId}-detail-count`}>
              {t("resumatch.evidence.form.counter", { count: draft.detail.length, max: MAX_EVIDENCE_DETAIL_CHARS })}
            </small>
          </label>
          {draft.kind !== "MOTIVATION" ? (
            <label className="jm-field">
              <span>{t("resumatch.evidence.form.role")}</span>
              <select
                className="ui-input ui-select"
                value={roleValue(roles, draft.role)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    role: e.target.value === "" ? null : e.target.value === KEPT_ROLE ? draft.role : (roles.find((r) => roleKey(r) === e.target.value) ?? null),
                  })
                }
              >
                <option value="">{t("resumatch.evidence.form.noRole")}</option>
                {roles.map((role) => (
                  <option key={roleKey(role)} value={roleKey(role)}>
                    {roleLabel(role)}
                  </option>
                ))}
                {draft.role && roleIndexFor(roles, draft.role) < 0 ? (
                  <option value={KEPT_ROLE}>{t("resumatch.evidence.form.keptRole", { role: roleLabel(draft.role) })}</option>
                ) : null}
              </select>
              <small>{t("resumatch.evidence.form.roleHelp")}</small>
            </label>
          ) : null}
          <fieldset className="rm-evidence__scope">
            <legend>{t("resumatch.evidence.form.scope")}</legend>
            <label>
              <input type="radio" name={`${formId}-scope`} checked={draft.scope === "APPLICATION"} onChange={() => setDraft({ ...draft, scope: "APPLICATION" })} />
              <span>{t("resumatch.evidence.form.scopeApplication")}</span>
            </label>
            <label>
              <input type="radio" name={`${formId}-scope`} checked={draft.scope === "BACKGROUND"} onChange={() => setDraft({ ...draft, scope: "BACKGROUND" })} />
              <span>{t("resumatch.evidence.form.scopeBackground")}</span>
            </label>
          </fieldset>
          <p className="rm-evidence__hint">{t("resumatch.evidence.form.truthNote")}</p>
          <div className="rm-evidence__actions">
            <Button type="submit" disabled={busy}>
              {t("resumatch.evidence.form.saveConfirm")}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(false)}>
              {t("resumatch.evidence.form.saveDraft")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              {t("resumatch.evidence.form.cancel")}
            </Button>
          </div>
          </fieldset>
        </form>
      ) : (
        <Button
          variant="ghost"
          disabled={busy || items === null}
          onClick={() => {
            setNotice(null);
            setError(null);
            setDraft({ ...EMPTY });
          }}
        >
          {t("resumatch.evidence.action.add")}
        </Button>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={t("resumatch.evidence.dialog.title")}
        message={t("resumatch.evidence.dialog.message")}
        confirmLabel={t("resumatch.evidence.dialog.confirm")}
        cancelLabel={t("resumatch.evidence.dialog.cancel")}
        tone="danger"
        onConfirm={() => deleting && void remove(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </details>
  );
}
