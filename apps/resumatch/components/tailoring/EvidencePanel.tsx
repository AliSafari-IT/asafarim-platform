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
  /** Index into `roles`, or "" for no single role. */
  role: string;
  scope: EvidenceScope;
}

const EMPTY: Draft = { id: null, baseRevisionId: null, kind: "ACHIEVEMENT", title: "", detail: "", role: "", scope: "APPLICATION" };

function roleKey(ref: ExperienceRef): string {
  return JSON.stringify([ref.title, ref.employer, ref.startedOn]);
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
    const role = draft.kind !== "MOTIVATION" && draft.role !== "" ? roles[Number(draft.role)] ?? null : null;
    const payload = {
      kind: draft.kind,
      title: draft.title,
      detail: draft.detail,
      experienceRef: role,
      scope: draft.scope,
      targetJobId,
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
        const latest = (await load())?.find((item) => item.id === draft.id);
        if (latest) setDraft({ ...draft, baseRevisionId: latest.revisionId });
        else setDraft({ ...draft, id: null, baseRevisionId: null });
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
    const index = item.experienceRef ? roles.findIndex((r) => roleKey(r) === roleKey(item.experienceRef!)) : -1;
    setNotice(null);
    setError(null);
    setDraft({
      id: item.id,
      baseRevisionId: item.revisionId,
      kind: item.kind,
      title: item.title,
      detail: item.detail,
      role: index >= 0 ? String(index) : "",
      scope: item.scope,
    });
  }

  const forJob = items?.filter((item) => item.scope === "APPLICATION") ?? [];
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
        {item.experienceRef ? (
          <p className="rm-evidence__role">
            {t("resumatch.evidence.role.label")}: {item.experienceRef.employer ? `${item.experienceRef.title} · ${item.experienceRef.employer}` : item.experienceRef.title}
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
          <label className="jm-field">
            <span>{t("resumatch.evidence.form.kind")}</span>
            <select
              className="ui-input ui-select"
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as EvidenceKind, role: e.target.value === "MOTIVATION" ? "" : draft.role })}
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
              <select className="ui-input ui-select" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                <option value="">{t("resumatch.evidence.form.noRole")}</option>
                {roles.map((role, index) => (
                  <option key={roleKey(role)} value={String(index)}>
                    {role.employer ? `${role.title} · ${role.employer}` : role.title}
                  </option>
                ))}
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
