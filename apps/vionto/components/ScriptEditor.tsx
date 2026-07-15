"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Captions, Save, RefreshCw, Wand2 } from "lucide-react";

export type ScriptVersion = {
  id: string;
  narrationText: string | null;
  srtText: string | null;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  isUserEdited: boolean;
  createdAt: string;
};

type ScriptEditorProps = {
  versions: ScriptVersion[];
  projectId: string;
  onGenerate: (projectId: string) => Promise<void>;
  onSave: (scriptId: string, narration: string, srt: string) => Promise<void>;
  isGenerating: boolean;
};

export function ScriptEditor({ versions, projectId, onGenerate, onSave, isGenerating }: ScriptEditorProps) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [narration, setNarration] = useState("");
  const [srt, setSrt] = useState("");
  const [saving, setSaving] = useState(false);

  const activeVersion = versions[activeIndex] ?? null;

  useEffect(() => {
    const nextIndex = Math.min(activeIndex, Math.max(versions.length - 1, 0));
    if (nextIndex !== activeIndex) {
      setActiveIndex(nextIndex);
    }

    const v = versions[nextIndex];
    setNarration(v?.narrationText ?? "");
    setSrt(v?.srtText ?? "");
  }, [versions, activeIndex]);

  const selectVersion = useCallback(
    (idx: number) => {
      setActiveIndex(idx);
      const v = versions[idx];
      if (v) {
        setNarration(v.narrationText ?? "");
        setSrt(v.srtText ?? "");
      }
    },
    [versions]
  );

  const handleSave = async () => {
    if (!activeVersion) return;
    setSaving(true);
    try {
      await onSave(activeVersion.id, narration, srt);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    await onGenerate(projectId);
  };

  return (
    <div className="script-editor-card">
      <div className="script-editor-toolbar">
        <div className="script-editor-toolbar-row">
          <div className="script-editor-title text-[var(--color-text)]">
            <Captions size={18} />
            <h2>{t("vionto.script.title")}</h2>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="script-regenerate-button"
          >
            {isGenerating ? <RefreshCw size={15} className="animate-spin" /> : <Wand2 size={15} />}
            <span>{isGenerating ? t("vionto.script.generating") : t("vionto.script.regenerate")}</span>
          </button>
        </div>

        {versions.length > 0 && (
          <label className="script-version-field">
            <span>Version</span>
            <select
              className="script-version-select"
              value={activeIndex}
              onChange={(e) => selectVersion(Number(e.target.value))}
              aria-label="Select script version"
            >
              {versions.map((v, i) => (
                <option key={v.id} value={i}>
                  {v.isUserEdited ? `v${versions.length - i} (edited)` : `v${versions.length - i}`}
                  {v.provider ? ` · ${v.provider}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {activeVersion ? (
        <div className="flex flex-col gap-3">
          <textarea
            className="script-textarea"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder={t("vionto.script.placeholder")}
          />
          <details className="text-sm">
            <summary className="cursor-pointer text-[var(--color-text-muted)]">
              SRT subtitles
            </summary>
            <textarea
              className="script-textarea script-textarea-srt"
              value={srt}
              onChange={(e) => setSrt(e.target.value)}
            />
          </details>
          <div className="script-editor-footer">
            <div className="script-meta">
              {activeVersion.provider && (
                <span className="mr-2">
                  {activeVersion.provider} · {activeVersion.model ?? "unknown model"}
                </span>
              )}
              {activeVersion.isUserEdited && (
                <span className="rounded bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-[var(--color-accent)]">
                  edited
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface)] disabled:opacity-50"
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              {t("vionto.script.save")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-8 text-[var(--color-text-muted)]">
          <Captions size={32} />
          <p className="text-sm">{t("vionto.script.empty")}</p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="script-regenerate-button"
          >
            {isGenerating ? <RefreshCw size={15} className="animate-spin" /> : <Wand2 size={15} />}
            <span>{isGenerating ? t("vionto.script.generating") : t("vionto.script.regenerate")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
