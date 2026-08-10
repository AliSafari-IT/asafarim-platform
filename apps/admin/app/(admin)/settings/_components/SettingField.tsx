"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Select,
  Textarea,
} from "@asafarim/ui";
import { resetPlatformSetting, updatePlatformSetting } from "../actions";
import type { SettingType, SettingValue } from "../../../../lib/settings";

export interface SettingFieldProps {
  settingKey: string;
  label: string;
  description: string;
  type: SettingType;
  maxLength?: number;
  min?: number;
  max?: number;
  unit?: string;
  options?: readonly string[];
  maxItems?: number;
  highImpact?: boolean;
  value: SettingValue;
  defaultValue: SettingValue;
  overridden: boolean;
  updatedAt: string | null;
  updatedByEmail: string | null;
  disabled?: boolean;
}

/** The editor's working copy: every type edits as text except boolean. */
function toDraft(value: SettingValue): string {
  if (Array.isArray(value)) return value.join("\n");
  return String(value);
}

function describe(value: SettingValue): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(empty)";
  if (typeof value === "boolean") return value ? "enabled" : "disabled";
  if (value === "") return "(empty)";
  return String(value);
}

type PendingConfirm =
  | { kind: "save"; next: SettingValue }
  | { kind: "reset" }
  | null;

export function SettingField({
  settingKey,
  label,
  description,
  type,
  maxLength,
  min,
  max,
  unit,
  options,
  maxItems,
  highImpact,
  value,
  defaultValue,
  overridden,
  updatedAt,
  updatedByEmail,
  disabled,
}: SettingFieldProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<string>(type === "boolean" ? "" : toDraft(value));
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<PendingConfirm>(null);

  /** Turn the editor's text back into the typed value the action expects. */
  function parseDraft(text: string): SettingValue {
    if (type === "number") return Number(text);
    if (type === "string[]") {
      return text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    }
    return text;
  }

  async function commitSave(next: SettingValue) {
    setPending(true);
    setError("");
    setSaved(false);
    try {
      const result = await updatePlatformSetting({ key: settingKey, value: next });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function commitReset() {
    setPending(true);
    setError("");
    try {
      const result = await resetPlatformSetting({ key: settingKey });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (type !== "boolean") setDraft(toDraft(defaultValue));
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function requestSave(next: SettingValue) {
    setError("");
    setSaved(false);
    // High-impact keys change behaviour for everyone at once, so they get an
    // explicit confirmation — through the shared dialog, never window.confirm.
    if (highImpact) {
      setConfirming({ kind: "save", next });
      return;
    }
    void commitSave(next);
  }

  const dirty = type !== "boolean" && draft !== toDraft(value);
  const fieldId = `setting-${settingKey}`;

  const confirmCopy =
    confirming?.kind === "save"
      ? {
          title: `High-impact setting: ${label}`,
          message: `This changes ${settingKey} platform-wide, from ${describe(
            value
          )} to ${describe(confirming.next)}. Continue?`,
          confirmLabel: "Apply platform-wide",
        }
      : {
          title: `Reset ${label}?`,
          message: `${settingKey} returns to its catalog default: ${describe(defaultValue)}.`,
          confirmLabel: "Reset to default",
        };

  return (
    <div className="ui-setting">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="ui-setting__head">
        <label htmlFor={fieldId} className="ui-setting__label">
          {label} <span className="u-mono">{settingKey}</span>
        </label>
        <span className="ui-chips">
          {highImpact ? <Badge tone="warning">high impact</Badge> : null}
          <Badge tone={overridden ? "info" : "neutral"}>
            {overridden ? "database" : "default"}
          </Badge>
          {saved ? <Badge tone="success">saved</Badge> : null}
        </span>
      </div>

      <p className="u-muted ui-setting__description">{description}</p>

      {type === "boolean" ? (
        <label className="ui-setting__toggle">
          <input
            id={fieldId}
            type="checkbox"
            checked={Boolean(value)}
            disabled={disabled || pending}
            onChange={(event) => requestSave(event.target.checked)}
          />
          {value ? "enabled" : "disabled"}
        </label>
      ) : (
        <div className="ui-setting__editor">
          <div className="ui-setting__input">
            {type === "select" ? (
              <Select
                id={fieldId}
                value={draft}
                disabled={disabled || pending}
                onChange={(event) => setDraft(event.target.value)}
                options={(options ?? []).map((option) => ({
                  value: option,
                  label: option,
                }))}
              />
            ) : type === "text" ? (
              <Textarea
                id={fieldId}
                value={draft}
                rows={2}
                maxLength={maxLength}
                disabled={disabled || pending}
                onChange={(event) => setDraft(event.target.value)}
              />
            ) : type === "string[]" ? (
              <Textarea
                id={fieldId}
                value={draft}
                rows={Math.min(6, Math.max(2, draft.split("\n").length + 1))}
                disabled={disabled || pending}
                onChange={(event) => setDraft(event.target.value)}
                aria-describedby={`${fieldId}-hint`}
              />
            ) : type === "number" ? (
              <Input
                id={fieldId}
                type="number"
                value={draft}
                min={min}
                max={max}
                disabled={disabled || pending}
                onChange={(event) => setDraft(event.target.value)}
              />
            ) : type === "color" ? (
              <span className="ui-setting__color">
                <Input
                  id={fieldId}
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(draft) ? draft : "#000000"}
                  disabled={disabled || pending}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <span className="u-mono">{draft}</span>
              </span>
            ) : (
              <Input
                id={fieldId}
                value={draft}
                maxLength={maxLength}
                disabled={disabled || pending}
                onChange={(event) => setDraft(event.target.value)}
              />
            )}

            {type === "string[]" ? (
              <p id={`${fieldId}-hint`} className="u-muted ui-setting__hint">
                One entry per line{maxItems ? ` · up to ${maxItems}` : ""}.
              </p>
            ) : null}
            {type === "number" && (min !== undefined || max !== undefined) ? (
              <p className="u-muted ui-setting__hint">
                {min ?? "—"}–{max ?? "—"} {unit ?? ""}
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            variant="console"
            size="sm"
            disabled={disabled || pending || !dirty}
            onClick={() => requestSave(parseDraft(draft))}
          >
            {pending ? "saving…" : "save"}
          </Button>
        </div>
      )}

      <div className="ui-setting__foot">
        {overridden && updatedAt ? (
          <span className="u-mono">
            set {updatedAt.slice(0, 16).replace("T", " ")} UTC
            {updatedByEmail ? ` · ${updatedByEmail}` : ""}
          </span>
        ) : (
          <span className="u-mono">catalog default · {describe(defaultValue)}</span>
        )}
        {overridden && !disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirming({ kind: "reset" })}
          >
            reset to default
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmCopy.confirmLabel}
        tone="danger"
        confirmDisabled={pending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const request = confirming;
          setConfirming(null);
          if (request?.kind === "save") void commitSave(request.next);
          else if (request?.kind === "reset") void commitReset();
        }}
      />
    </div>
  );
}
