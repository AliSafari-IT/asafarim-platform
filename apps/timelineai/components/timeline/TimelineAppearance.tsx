"use client";

import type { ThemeSettings } from "@/lib/schemas";
import {
  getLayoutOptions,
  resolveThemePreset,
  THEME_PRESETS,
  type TimelineLayout,
  type TimelineType,
} from "@/lib/timeline-config";

export interface TimelineAppearanceProps {
  timelineType: TimelineType;
  layout: TimelineLayout;
  theme: ThemeSettings | null | undefined;
  onLayoutChange: (layout: TimelineLayout) => void;
  onThemeChange: (patch: Partial<ThemeSettings>) => void;
}

/**
 * "Timeline appearance" — everything that changes how ONE timeline looks.
 *
 * Both selectors are real radio groups rather than buttons with aria-pressed:
 * the choices are mutually exclusive and a radiogroup gives arrow-key movement
 * between options for free, which a row of buttons would not.
 */
export function TimelineAppearance({
  timelineType,
  layout,
  theme,
  onLayoutChange,
  onThemeChange,
}: TimelineAppearanceProps) {
  const layoutOptions = getLayoutOptions(timelineType);
  const preset = resolveThemePreset(theme?.preset);

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-[var(--color-border,rgba(0,0,0,0.15))] p-4">
      <div>
        <h2 className="font-medium">Timeline appearance</h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted,inherit)]">
          Changes only this timeline. Your app theme stays unchanged.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Layout</legend>
        <p className="sr-only" id="layout-help">
          Three layouts suit this timeline type. Choosing one never changes your events.
        </p>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-describedby="layout-help" aria-label="Layout">
          {layoutOptions.map((option) => {
            const Icon = option.icon;
            const selected = layout === option.id;
            return (
              <label
                key={option.id}
                className="flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-primary)]"
                style={{
                  borderColor: selected ? "var(--color-primary)" : "var(--color-border,rgba(0,0,0,0.15))",
                  background: selected ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : undefined,
                }}
              >
                <input
                  type="radio"
                  name="timeline-layout"
                  className="sr-only"
                  value={option.id}
                  checked={selected}
                  onChange={() => onLayoutChange(option.id)}
                />
                <Icon size={18} aria-hidden style={{ color: selected ? "var(--color-primary)" : undefined }} />
                <span className="text-sm font-medium">{option.name}</span>
                <span className="text-xs text-[var(--color-text-muted,inherit)]">{option.description}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Timeline theme</legend>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Timeline theme">
          {THEME_PRESETS.map((option) => {
            const selected = preset === option.id;
            return (
              <label
                key={option.id}
                className="flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-left transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-primary)]"
                style={{
                  borderColor: selected ? "var(--color-primary)" : "var(--color-border,rgba(0,0,0,0.15))",
                  background: selected ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : undefined,
                }}
              >
                <input
                  type="radio"
                  name="timeline-theme"
                  className="sr-only"
                  value={option.id}
                  checked={selected}
                  onChange={() => onThemeChange({ preset: option.id })}
                />
                {/* A miniature of the preset: page, card, accent. */}
                <span className="flex h-8 overflow-hidden rounded border border-black/10" aria-hidden>
                  <span className="flex-1" style={{ background: option.swatch[0] }} />
                  <span className="flex-1" style={{ background: option.swatch[1] }} />
                  <span className="w-1/3" style={{ background: option.swatch[2] }} />
                </span>
                <span className="text-sm font-medium">{option.name}</span>
                <span className="text-xs text-[var(--color-text-muted,inherit)]">{option.description}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Density</span>
          <select
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
            value={theme?.density ?? "comfortable"}
            onChange={(e) => onThemeChange({ density: e.target.value as ThemeSettings["density"] })}
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="spacious">Spacious</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Card style</span>
          <select
            className="rounded border border-[var(--color-border,rgba(0,0,0,0.2))] bg-transparent px-3 py-2"
            value={theme?.cardStyle ?? "flat"}
            onChange={(e) => onThemeChange({ cardStyle: e.target.value as ThemeSettings["cardStyle"] })}
          >
            <option value="flat">Flat</option>
            <option value="elevated">Elevated</option>
            <option value="outlined">Outlined</option>
          </select>
        </label>
      </div>

      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-1 font-medium">Show</legend>
        {(
          [
            ["showDates", "Dates"],
            ["showDescriptions", "Descriptions"],
            ["showImages", "Images"],
            ["showIcons", "Icons"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={theme?.[key] ?? true}
              onChange={(e) => onThemeChange({ [key]: e.target.checked } as Partial<ThemeSettings>)}
            />
            {label}
          </label>
        ))}
      </fieldset>
    </section>
  );
}
