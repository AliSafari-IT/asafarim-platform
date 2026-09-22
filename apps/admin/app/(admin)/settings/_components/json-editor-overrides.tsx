"use client";

import type { ComponentType } from "react";

export interface JsonEditorOverrideProps {
  /** Raw JSON text — the same draft representation the generic editor uses. */
  value: string;
  onChange: (rawJsonText: string) => void;
  disabled?: boolean;
}

/**
 * Per-key bespoke editors for `json`-typed settings, keyed by setting key.
 *
 * A `json` setting renders the generic textarea editor unless its key has
 * an entry here — e.g. a later branding/marketing issue registering a
 * slide-list editor instead of raw JSON. A plain keyed lookup is enough at
 * this scale; no plugin system.
 *
 * An override still operates on raw JSON text (not the parsed value) so it
 * plugs into `SettingField`'s existing draft/validate/save flow unchanged —
 * it only has to call `onChange` with valid JSON text.
 */
export const JSON_EDITOR_OVERRIDES: Record<string, ComponentType<JsonEditorOverrideProps>> = {};
