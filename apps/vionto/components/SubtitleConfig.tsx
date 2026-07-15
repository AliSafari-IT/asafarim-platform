"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import {
  ChevronDown,
  ChevronUp,
  Type,
  AlignCenter,
  Timer,
  Download,
  Eye,
} from "lucide-react";
import type { SubtitleConfig as SubtitleConfigType } from "@/lib/server/render-manifest";
import {
  SUBTITLE_PRESETS,
  DEFAULT_SUBTITLE_PRESET,
  getSubtitlePresetStyle,
  type SubtitlePresetId,
} from "@/lib/subtitle-presets";

// Theme-aware style utilities
const theme = {
  text: "text-[var(--color-text)]",
  textMuted: "text-[var(--color-text-muted)]",
  textSubtle: "text-[var(--color-text-subtle)]",
  bgSurface: "bg-[var(--color-surface)]",
  bgSurfaceSoft: "bg-[var(--color-surface-soft)]",
  bgSurfaceElevated: "bg-[var(--color-surface-elevated)]",
  border: "border-[var(--color-border)]",
  borderStrong: "border-[var(--color-border-strong)]",
  accent: "bg-[var(--color-accent)]",
  accentText: "text-[var(--color-accent)]",
  primarySoft: "bg-[var(--color-primary-soft)]",
  primaryText: "text-[var(--color-primary)]",
};

type Props = {
  projectId: string | null;
  versionId?: string | null;
  aspectRatio: string;
  onChange?: (config: SubtitleConfigType) => void;
};

const FONT_OPTIONS = [
  "Arial",
  "Georgia",
  "Courier New",
  "Verdana",
  "Trebuchet MS",
  "Impact",
  "Helvetica",
  "Times New Roman",
];

const SAMPLE_TEXT = "This is how your subtitles will look in the final video.";

function SubtitlePreview({
  config,
  aspectRatio,
}: {
  config: SubtitleConfigType;
  aspectRatio: string;
}) {
  const { style } = config;
  const arMap: Record<string, { w: number; h: number }> = {
    "16:9": { w: 320, h: 180 },
    "9:16": { w: 180, h: 320 },
    "1:1": { w: 240, h: 240 },
    "4:3": { w: 280, h: 210 },
  };
  const dims = arMap[aspectRatio] ?? arMap["16:9"];

  const posMap: Record<string, string> = {
    top: "top: 12%",
    center: "top: 50%; transform: translateY(-50%)",
    bottom: "bottom: 12%",
  };

  const textStyle: React.CSSProperties = {
    fontFamily: style.fontName,
    fontSize: Math.min(style.fontSize * 0.55, 24),
    fontWeight: style.fontWeight === "bold" ? 700 : 400,
    color: style.color,
    textAlign: (style.alignment ?? "center") as any,
    textTransform: style.textTransform === "uppercase" ? "uppercase" : style.textTransform === "lowercase" ? "lowercase" : "none",
    WebkitTextStroke: style.outlineWidth > 0 ? `${Math.max(0.5, style.outlineWidth * 0.3)}px ${style.outlineColor}` : undefined,
    textShadow: style.shadow ? `${style.shadowOffset}px ${style.shadowOffset}px ${style.shadowOffset * 2}px ${style.shadowColor}` : undefined,
    padding: `${style.padding * 0.4}px ${style.padding * 0.6}px`,
    borderRadius: style.borderRadius,
    backgroundColor:
      style.backgroundColor && style.backgroundColor !== "transparent" && style.backgroundOpacity > 0
        ? `${style.backgroundColor}${Math.round(style.backgroundOpacity * 255).toString(16).padStart(2, "0")}`
        : undefined,
    lineHeight: 1.4,
    maxWidth: "88%",
    wordWrap: "break-word",
  };

  return (
    <div
      className={`relative rounded-lg overflow-hidden w-full ${theme.bgSurfaceElevated} ${theme.border}`}
      style={{ maxWidth: dims.w, aspectRatio: `${dims.w}/${dims.h}`, borderWidth: 1 }}
    >
      <div className="absolute inset-0 flex items-center justify-center opacity-20">
        <Eye className={`w-10 h-10 ${theme.textMuted}`} />
      </div>
      {config.enabled && (
        <div
          className="absolute left-0 right-0 flex justify-center px-2"
          style={{ ...(style.position === "top" ? { top: "10%" } : style.position === "center" ? { top: "50%", transform: "translateY(-50%)" } : { bottom: "10%" }) }}
        >
          <span style={textStyle}>{SAMPLE_TEXT}</span>
        </div>
      )}
      {!config.enabled && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xs ${theme.textSubtle} italic`}>Subtitles disabled</span>
        </div>
      )}
    </div>
  );
}

export function SubtitleConfig({ projectId, versionId, aspectRatio, onChange }: Props) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<SubtitleConfigType>({
    presetId: DEFAULT_SUBTITLE_PRESET,
    style: getSubtitlePresetStyle(DEFAULT_SUBTITLE_PRESET),
    timing: {
      maxCharsPerSegment: 80,
      minDisplayMs: 1200,
      maxDisplayMs: 7000,
      gapMs: 100,
      splitOnPunctuation: true,
      splitLongSentences: true,
    },
    export: { burnIn: true, exportSrt: false, exportVtt: false },
    enabled: true,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const url = versionId
      ? `/api/projects/${projectId}/subtitles?versionId=${versionId}`
      : `/api/projects/${projectId}/subtitles`;
    fetch(url)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setConfig(data);
          onChange?.(data);
          setLoaded(true);
        }
      })
      .catch(() => {});
  }, [projectId, versionId, onChange]);

  const saveConfig = useCallback(
    (newConfig: SubtitleConfigType) => {
      if (!projectId) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          await fetch(`/api/projects/${projectId}/subtitles`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(versionId ? { ...newConfig, versionId } : newConfig),
          });
        } catch {}
        setIsSaving(false);
      }, 600);
    },
    [projectId, versionId]
  );

  const updateConfig = useCallback(
    (patch: Partial<SubtitleConfigType>) => {
      setConfig((prev) => {
        const next = { ...prev, ...patch };
        onChange?.(next);
        saveConfig(next);
        return next;
      });
    },
    [onChange, saveConfig]
  );

  const updateStyle = useCallback(
    (patch: Partial<SubtitleConfigType["style"]>) => {
      setConfig((prev) => {
        const next = { ...prev, style: { ...prev.style, ...patch } };
        onChange?.(next);
        saveConfig(next);
        return next;
      });
    },
    [onChange, saveConfig]
  );

  const updateTiming = useCallback(
    (patch: Partial<SubtitleConfigType["timing"]>) => {
      setConfig((prev) => {
        const next = { ...prev, timing: { ...prev.timing, ...patch } };
        onChange?.(next);
        saveConfig(next);
        return next;
      });
    },
    [onChange, saveConfig]
  );

  const updateExport = useCallback(
    (patch: Partial<SubtitleConfigType["export"]>) => {
      setConfig((prev) => {
        const next = { ...prev, export: { ...prev.export, ...patch } };
        onChange?.(next);
        saveConfig(next);
        return next;
      });
    },
    [onChange, saveConfig]
  );

  const selectPreset = useCallback(
    (presetId: SubtitlePresetId) => {
      const presetStyle = getSubtitlePresetStyle(presetId);
      const next: SubtitleConfigType = {
        ...config,
        presetId,
        style: { ...presetStyle },
      };
      setConfig(next);
      onChange?.(next);
      saveConfig(next);
    },
    [config, onChange, saveConfig]
  );

  return (
    <div className="space-y-4">
      {/* Enable/Disable toggle */}
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-medium ${theme.text}`}>
          {t("vionto.subtitles.title")}
        </h3>
        <div className="flex items-center gap-2">
          {isSaving && <span className={`text-[10px] ${theme.accentText} animate-pulse`}>Saving...</span>}
          <button
            type="button"
            onClick={() => updateConfig({ enabled: !config.enabled })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${config.enabled ? theme.accent : "bg-[var(--color-text-muted)]/30"}`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-[var(--color-surface)] shadow ring-0 transition ${config.enabled ? "translate-x-4" : "translate-x-0"}`}
            />
          </button>
        </div>
      </div>

      {config.enabled && (
        <>
          {/* Preview */}
          <div className="flex justify-center">
            <SubtitlePreview config={config} aspectRatio={aspectRatio} />
          </div>

          {/* Preset selector */}
          <div>
            <label className={`block text-xs ${theme.textMuted} mb-1.5`}>
              {t("vionto.subtitles.preset")}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {SUBTITLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectPreset(preset.id)}
                  className={`text-left px-2.5 py-2 rounded-md text-xs transition border ${
                    config.presetId === preset.id
                      ? `border-[var(--color-accent)] bg-[var(--color-accent)]/20 ${theme.text} shadow-sm`
                      : `${theme.border} ${theme.bgSurfaceSoft} ${theme.textMuted} hover:bg-[var(--color-surface-elevated)] hover:${theme.borderStrong}`
                  }`}
                  style={{ borderWidth: 1 }}
                >
                  <div className="font-medium">{t(preset.labelKey)}</div>
                  <div className={`text-[10px] ${theme.textSubtle} mt-0.5 line-clamp-1`}>
                    {t(preset.descriptionKey)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Advanced settings toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-1.5 text-xs ${theme.textMuted} hover:${theme.text} transition`}
          >
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {t("vionto.subtitles.advanced")}
          </button>

          {showAdvanced && (
            <div className={`space-y-4 border-t ${theme.border} pt-4`}>
              {/* ── Visual Styling ── */}
              <SettingsGroup icon={Type} title={t("vionto.subtitles.styling")}>
                <div className="grid grid-cols-2 gap-2">
                  <SelectField
                    label={t("vionto.subtitles.font")}
                    value={config.style.fontName}
                    options={FONT_OPTIONS.map((f) => ({ label: f, value: f }))}
                    onChange={(v) => updateStyle({ fontName: v })}
                  />
                  <NumberField
                    label={t("vionto.subtitles.fontSize")}
                    value={config.style.fontSize}
                    min={8}
                    max={128}
                    onChange={(v) => updateStyle({ fontSize: v })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <SelectField
                    label={t("vionto.subtitles.fontWeight")}
                    value={config.style.fontWeight}
                    options={[
                      { label: "Normal", value: "normal" },
                      { label: "Bold", value: "bold" },
                    ]}
                    onChange={(v) => updateStyle({ fontWeight: v as any })}
                  />
                  <SelectField
                    label={t("vionto.subtitles.textTransform")}
                    value={config.style.textTransform}
                    options={[
                      { label: "Preserve", value: "preserve" },
                      { label: "UPPERCASE", value: "uppercase" },
                      { label: "lowercase", value: "lowercase" },
                      { label: "Sentence", value: "sentence" },
                    ]}
                    onChange={(v) => updateStyle({ textTransform: v as any })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ColorField
                    label={t("vionto.subtitles.textColor")}
                    value={config.style.color}
                    onChange={(v) => updateStyle({ color: v })}
                  />
                  <ColorField
                    label={t("vionto.subtitles.outlineColor")}
                    value={config.style.outlineColor}
                    onChange={(v) => updateStyle({ outlineColor: v })}
                  />
                </div>
                <NumberField
                  label={t("vionto.subtitles.outlineWidth")}
                  value={config.style.outlineWidth}
                  min={0}
                  max={8}
                  onChange={(v) => updateStyle({ outlineWidth: v })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <ColorField
                    label={t("vionto.subtitles.bgColor")}
                    value={config.style.backgroundColor === "transparent" ? "#000000" : config.style.backgroundColor}
                    onChange={(v) => updateStyle({ backgroundColor: v })}
                  />
                  <RangeField
                    label={t("vionto.subtitles.bgOpacity")}
                    value={config.style.backgroundOpacity}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => updateStyle({ backgroundOpacity: v })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label={t("vionto.subtitles.borderRadius")}
                    value={config.style.borderRadius}
                    min={0}
                    max={20}
                    onChange={(v) => updateStyle({ borderRadius: v })}
                  />
                  <NumberField
                    label={t("vionto.subtitles.padding")}
                    value={config.style.padding}
                    min={0}
                    max={40}
                    onChange={(v) => updateStyle({ padding: v })}
                  />
                </div>
                <ToggleField
                  label={t("vionto.subtitles.shadow")}
                  value={config.style.shadow}
                  onChange={(v) => updateStyle({ shadow: v })}
                />
                {config.style.shadow && (
                  <div className="grid grid-cols-2 gap-2">
                    <ColorField
                      label={t("vionto.subtitles.shadowColor")}
                      value={config.style.shadowColor}
                      onChange={(v) => updateStyle({ shadowColor: v })}
                    />
                    <NumberField
                      label={t("vionto.subtitles.shadowOffset")}
                      value={config.style.shadowOffset}
                      min={0}
                      max={10}
                      onChange={(v) => updateStyle({ shadowOffset: v })}
                    />
                  </div>
                )}
              </SettingsGroup>

              {/* ── Positioning ── */}
              <SettingsGroup icon={AlignCenter} title={t("vionto.subtitles.positioning")}>
                <div className="grid grid-cols-2 gap-2">
                  <SelectField
                    label={t("vionto.subtitles.position")}
                    value={config.style.position}
                    options={[
                      { label: "Bottom", value: "bottom" },
                      { label: "Center", value: "center" },
                      { label: "Top", value: "top" },
                    ]}
                    onChange={(v) => updateStyle({ position: v as any })}
                  />
                  <SelectField
                    label={t("vionto.subtitles.alignment")}
                    value={config.style.alignment}
                    options={[
                      { label: "Left", value: "left" },
                      { label: "Center", value: "center" },
                      { label: "Right", value: "right" },
                    ]}
                    onChange={(v) => updateStyle({ alignment: v as any })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label={t("vionto.subtitles.marginV")}
                    value={config.style.marginV}
                    min={0}
                    max={300}
                    onChange={(v) => updateStyle({ marginV: v })}
                  />
                  <NumberField
                    label={t("vionto.subtitles.marginH")}
                    value={config.style.marginH}
                    min={0}
                    max={300}
                    onChange={(v) => updateStyle({ marginH: v })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label={t("vionto.subtitles.maxLineWidth")}
                    value={config.style.maxLineWidth}
                    min={10}
                    max={80}
                    onChange={(v) => updateStyle({ maxLineWidth: v })}
                  />
                  <NumberField
                    label={t("vionto.subtitles.maxLines")}
                    value={config.style.maxLines}
                    min={1}
                    max={4}
                    onChange={(v) => updateStyle({ maxLines: v })}
                  />
                </div>
              </SettingsGroup>

              {/* ── Timing ── */}
              <SettingsGroup icon={Timer} title={t("vionto.subtitles.timing")}>
                <NumberField
                  label={t("vionto.subtitles.maxChars")}
                  value={config.timing.maxCharsPerSegment}
                  min={20}
                  max={200}
                  onChange={(v) => updateTiming({ maxCharsPerSegment: v })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label={t("vionto.subtitles.minDisplay")}
                    value={config.timing.minDisplayMs}
                    min={500}
                    max={5000}
                    step={100}
                    onChange={(v) => updateTiming({ minDisplayMs: v })}
                  />
                  <NumberField
                    label={t("vionto.subtitles.maxDisplay")}
                    value={config.timing.maxDisplayMs}
                    min={2000}
                    max={15000}
                    step={500}
                    onChange={(v) => updateTiming({ maxDisplayMs: v })}
                  />
                </div>
                <NumberField
                  label={t("vionto.subtitles.gap")}
                  value={config.timing.gapMs}
                  min={0}
                  max={2000}
                  step={50}
                  onChange={(v) => updateTiming({ gapMs: v })}
                />
                <ToggleField
                  label={t("vionto.subtitles.splitPunctuation")}
                  value={config.timing.splitOnPunctuation}
                  onChange={(v) => updateTiming({ splitOnPunctuation: v })}
                />
                <ToggleField
                  label={t("vionto.subtitles.splitLong")}
                  value={config.timing.splitLongSentences}
                  onChange={(v) => updateTiming({ splitLongSentences: v })}
                />
              </SettingsGroup>

              {/* ── Export ── */}
              <SettingsGroup icon={Download} title={t("vionto.subtitles.exportOptions")}>
                <ToggleField
                  label={t("vionto.subtitles.burnIn")}
                  value={config.export.burnIn}
                  onChange={(v) => updateExport({ burnIn: v })}
                />
                <ToggleField
                  label={t("vionto.subtitles.exportSrt")}
                  value={config.export.exportSrt}
                  onChange={(v) => updateExport({ exportSrt: v })}
                />
                <ToggleField
                  label={t("vionto.subtitles.exportVtt")}
                  value={config.export.exportVtt}
                  onChange={(v) => updateExport({ exportVtt: v })}
                />
              </SettingsGroup>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Small form components ───────────────────────────────────────

function SettingsGroup({
  icon: Icon,
  title,
  children,
}: {
  icon: React.FC<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-1.5 text-xs ${theme.textMuted} font-medium`}>
        <Icon className={`w-3.5 h-3.5 ${theme.primaryText}`} />
        {title}
      </div>
      <div className="space-y-2 pl-0.5">{children}</div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className={`block text-[10px] ${theme.textSubtle} mb-0.5`}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded ${theme.bgSurfaceSoft} border ${theme.border} text-xs ${theme.text} px-2 py-1 focus:outline-none focus:border-[var(--color-accent)]/40`}
        style={{ borderWidth: 1 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className={`block text-[10px] ${theme.textSubtle} mb-0.5`}>{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
        className={`w-full rounded ${theme.bgSurfaceSoft} border ${theme.border} text-xs ${theme.text} px-2 py-1 focus:outline-none focus:border-[var(--color-accent)]/40`}
        style={{ borderWidth: 1 }}
      />
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className={`block text-[10px] ${theme.textSubtle} mb-0.5`}>
        {label} <span className={theme.textMuted}>{Math.round(value * 100)}%</span>
      </label>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-[var(--color-accent)]"
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className={`block text-[10px] ${theme.textSubtle} mb-0.5`}>{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-6 w-6 rounded border ${theme.border} cursor-pointer bg-transparent`}
          style={{ borderWidth: 1 }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`flex-1 rounded ${theme.bgSurfaceSoft} border ${theme.border} text-xs ${theme.text} px-2 py-1 focus:outline-none focus:border-[var(--color-accent)]/40`}
          style={{ borderWidth: 1 }}
        />
      </div>
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={`text-xs ${theme.textMuted}`}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${value ? theme.accent : "bg-[var(--color-text-muted)]/30"}`}
      >
        <span
          className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-[var(--color-surface)] shadow ring-0 transition ${value ? "translate-x-3" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}
