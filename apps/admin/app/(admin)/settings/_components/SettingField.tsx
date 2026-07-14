"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Input, Textarea } from "@asafarim/ui";
import { resetPlatformSetting, updatePlatformSetting } from "../actions";

export interface SettingFieldProps {
  settingKey: string;
  label: string;
  description: string;
  type: "boolean" | "string" | "text";
  maxLength?: number;
  highImpact?: boolean;
  value: boolean | string;
  defaultValue: boolean | string;
  overridden: boolean;
  disabled?: boolean;
}

export function SettingField({
  settingKey,
  label,
  description,
  type,
  maxLength,
  highImpact,
  value,
  defaultValue,
  overridden,
  disabled,
}: SettingFieldProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<string>(
    type === "boolean" ? "" : String(value)
  );
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(next: boolean | string) {
    setError("");
    setSaved(false);
    if (highImpact) {
      const summary =
        typeof next === "boolean"
          ? next
            ? "ENABLE"
            : "DISABLE"
          : `set to "${next}"`;
      if (
        !window.confirm(
          `High-impact setting: ${label}\n\nYou are about to ${summary} this platform-wide. Continue?`
        )
      ) {
        return;
      }
    }
    setPending(true);
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

  async function reset() {
    setError("");
    if (
      !window.confirm(
        `Reset "${label}" to its default (${JSON.stringify(defaultValue)})?`
      )
    ) {
      return;
    }
    setPending(true);
    try {
      const result = await resetPlatformSetting({ key: settingKey });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (type !== "boolean") setDraft(String(defaultValue));
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const dirty = type !== "boolean" && draft !== String(value);

  return (
    <div
      style={{
        padding: "var(--space-3) 0",
        borderBottom: "1px solid var(--line)",
      }}
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        <label
          htmlFor={`setting-${settingKey}`}
          style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}
        >
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
      <p className="u-muted" style={{ fontSize: "var(--text-xs)", margin: "var(--space-1) 0 var(--space-2)" }}>
        {description}
      </p>

      {type === "boolean" ? (
        <label
          style={{
            display: "inline-flex",
            gap: "var(--space-2)",
            alignItems: "center",
            fontSize: "var(--text-sm)",
            cursor: disabled ? "default" : "pointer",
          }}
        >
          <input
            id={`setting-${settingKey}`}
            type="checkbox"
            checked={Boolean(value)}
            disabled={disabled || pending}
            onChange={(e) => save(e.target.checked)}
          />
          {value ? "enabled" : "disabled"}
        </label>
      ) : (
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "start" }}>
          <div style={{ flex: "1 1 16rem", maxWidth: "30rem" }}>
            {type === "text" ? (
              <Textarea
                id={`setting-${settingKey}`}
                value={draft}
                rows={2}
                maxLength={maxLength}
                disabled={disabled || pending}
                onChange={(e) => setDraft(e.target.value)}
              />
            ) : (
              <Input
                id={`setting-${settingKey}`}
                value={draft}
                maxLength={maxLength}
                disabled={disabled || pending}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
          </div>
          <Button
            type="button"
            variant="console"
            size="sm"
            disabled={disabled || pending || !dirty}
            onClick={() => save(draft)}
          >
            {pending ? "saving…" : "save"}
          </Button>
        </div>
      )}

      {overridden && !disabled ? (
        <div style={{ marginTop: "var(--space-2)" }}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={reset}
          >
            reset to default
          </Button>
        </div>
      ) : null}
    </div>
  );
}
