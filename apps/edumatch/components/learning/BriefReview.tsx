"use client";

/**
 * The Learning Brief, shown back to the student in full before anyone else
 * sees it.
 *
 * Every field is editable here. The AI's reading of the conversation is a
 * draft, not a verdict, and a review step the student cannot act on would be
 * theatre. Confirming is explicit; sharing with tutors is a second, separate
 * click, because those are genuinely different decisions.
 */

import { useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import type { BriefView, TutorCandidateView } from "@/lib/types/learning";
import { TutorCandidateList } from "./TutorCandidateList";

type Props = {
  brief: BriefView;
  candidates: TutorCandidateView[];
  busy: boolean;
  onEdit: (patch: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  onConfirm: () => void;
  onShare: () => void;
};

export function BriefReview({
  brief,
  candidates,
  busy,
  onEdit,
  onBack,
  onConfirm,
  onShare,
}: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const f = brief.fields;
  const confirmed = brief.confirmedAt !== null;

  async function commit(field: string) {
    const value = draft.trim();
    setEditing(null);
    if (!value) return;
    await onEdit({ [field]: value });
  }

  function EditableRow({
    field,
    label,
    value,
  }: {
    field: string;
    label: string;
    value?: string | null;
  }) {
    const isEditing = editing === field;
    return (
      <div className="border-b border-[var(--color-border)] py-3 last:border-b-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {label}
            </p>
            {isEditing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void commit(field)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commit(field);
                  if (e.key === "Escape") setEditing(null);
                }}
                aria-label={label}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            ) : (
              <p className="mt-0.5 text-sm text-[var(--color-text)]">
                {value || (
                  <span className="text-[var(--color-text-muted)]">
                    {t("edumatch.brief.notSet")}
                  </span>
                )}
              </p>
            )}
          </div>
          {!confirmed && !isEditing && (
            <button
              type="button"
              onClick={() => {
                setDraft(value ?? "");
                setEditing(field);
              }}
              className="shrink-0 text-xs text-[var(--color-primary)] hover:underline"
            >
              {t("edumatch.brief.edit")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              {t("edumatch.brief.title")}
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              {t("edumatch.brief.subtitle")}
            </p>
          </div>
          {confirmed && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
              {t("edumatch.brief.confirmedBadge")}
            </span>
          )}
        </div>

        <div className="rounded-lg bg-[var(--color-surface)] px-4">
          <EditableRow
            field="subject"
            label={t("edumatch.brief.field.subject")}
            value={f.subject}
          />
          <EditableRow
            field="topic"
            label={t("edumatch.brief.field.topic")}
            value={f.topic}
          />
          <EditableRow
            field="schoolYear"
            label={t("edumatch.brief.field.schoolYear")}
            value={f.schoolYear ?? f.educationalLevel}
          />
          <EditableRow
            field="learningObjective"
            label={t("edumatch.brief.field.objective")}
            value={f.learningObjective}
          />
          <EditableRow
            field="currentUnderstanding"
            label={t("edumatch.brief.field.understanding")}
            value={f.currentUnderstanding}
          />
          <ListRow
            label={t("edumatch.brief.field.difficulties")}
            values={f.difficulties}
          />
          <ListRow
            label={t("edumatch.brief.field.gaps")}
            values={f.prerequisiteGaps}
          />
          <EditableRow
            field="locationCity"
            label={t("edumatch.brief.field.location")}
            value={f.locationCity}
          />
          <StaticRow
            label={t("edumatch.brief.field.mode")}
            value={f.mode ? t(`edumatch.brief.mode.${f.mode}`) : undefined}
          />
          <StaticRow
            label={t("edumatch.brief.field.language")}
            value={f.language?.toUpperCase()}
          />
          <StaticRow
            label={t("edumatch.brief.field.availability")}
            value={f.availability
              ?.map((w) => `${w.day} ${w.from}–${w.to}`)
              .join(", ")}
          />
          <StaticRow
            label={t("edumatch.brief.field.deadline")}
            value={
              f.deadlineAt
                ? `${f.deadlineAt.slice(0, 10)}${
                    f.deadlineKind && f.deadlineKind !== "NONE"
                      ? ` (${t(`edumatch.brief.deadlineKind.${f.deadlineKind}`)})`
                      : ""
                  }`
                : undefined
            }
          />
          <EditableRow
            field="accessibilityNeeds"
            label={t("edumatch.brief.field.support")}
            value={f.accessibilityNeeds}
          />
          <StaticRow
            label={t("edumatch.brief.field.plan")}
            value={
              f.estimatedSessions && f.sessionMinutes
                ? t("edumatch.brief.planValue", {
                    n: f.estimatedSessions,
                    m: f.sessionMinutes,
                  })
                : undefined
            }
          />
          {brief.attachments.length > 0 && (
            <StaticRow
              label={t("edumatch.brief.field.materials")}
              value={brief.attachments.map((a) => a.filename).join(", ")}
            />
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-[var(--color-border-strong)] px-5 py-2.5 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-surface)]"
          >
            {t("edumatch.brief.keepTalking")}
          </button>
          {!confirmed ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || brief.blockers.length > 0}
              className="rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("edumatch.brief.confirmBtn")}
            </button>
          ) : (
            <button
              type="button"
              onClick={onShare}
              disabled={busy}
              className="rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("edumatch.brief.shareBtn", { n: candidates.length })}
            </button>
          )}
        </div>
        {brief.blockers.length > 0 && (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            {t("edumatch.learn.stillNeeded", {
              fields: brief.blockers.join(", "),
            })}
          </p>
        )}
      </div>

      {confirmed && candidates.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
          <h3 className="text-base font-semibold text-[var(--color-text)]">
            {t("edumatch.brief.previewTitle", { n: candidates.length })}
          </h3>
          <p className="mt-1 mb-4 text-sm text-[var(--color-text-muted)]">
            {t("edumatch.brief.previewDesc")}
          </p>
          <TutorCandidateList candidates={candidates} />
        </div>
      )}
    </section>
  );
}

function StaticRow({ label, value }: { label: string; value?: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="border-b border-[var(--color-border)] py-3 last:border-b-0">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-[var(--color-text)]">
        {value || (
          <span className="text-[var(--color-text-muted)]">
            {t("edumatch.brief.notSet")}
          </span>
        )}
      </p>
    </div>
  );
}

function ListRow({ label, values }: { label: string; values?: string[] }) {
  const { t } = useTranslation();
  return (
    <div className="border-b border-[var(--color-border)] py-3 last:border-b-0">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      {values && values.length > 0 ? (
        <ul className="mt-1 list-inside list-disc text-sm text-[var(--color-text)]">
          {values.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
          {t("edumatch.brief.notSet")}
        </p>
      )}
    </div>
  );
}
