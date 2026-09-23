"use client";

import { useState } from "react";
import { Alert, Button, Input } from "@asafarim/ui";
import { sendTestEmail, type TestEmailResult } from "../actions";

/**
 * Sends one test message through the platform mailer using the live SMTP
 * config (console overrides, else SMTP_* env), so a changed relay can be
 * verified without triggering a real OTP or password-reset email.
 */
export function TestEmailPanel({ disabled }: { disabled?: boolean }) {
  const [to, setTo] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TestEmailResult | null>(null);

  async function send() {
    setPending(true);
    setResult(null);
    try {
      setResult(await sendTestEmail({ to }));
    } catch {
      setResult({ ok: false, error: "Something went wrong. Please try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ui-setting">
      <div className="ui-setting__head">
        <label htmlFor="smtp-test-to" className="ui-setting__label">
          Send test email
        </label>
      </div>
      <p className="u-muted ui-setting__description">
        Sends one message with the current configuration — saved console values first,
        SMTP_* env vars for the rest. Save any changes above before testing.
      </p>
      {result ? (
        <Alert tone={result.ok ? "info" : "error"}>{result.ok ? result.message : result.error}</Alert>
      ) : null}
      <div className="ui-setting__editor">
        <div className="ui-setting__input">
          <Input
            id="smtp-test-to"
            type="email"
            placeholder="you@example.com"
            value={to}
            maxLength={320}
            autoComplete="email"
            disabled={disabled || pending}
            onChange={(event) => setTo(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && to.trim() && !pending) void send();
            }}
          />
        </div>
        <Button
          type="button"
          variant="console"
          size="sm"
          disabled={disabled || pending || to.trim() === ""}
          onClick={() => void send()}
        >
          {pending ? "sending…" : "send test"}
        </Button>
      </div>
      {disabled ? (
        <p className="u-muted ui-setting__hint">Requires settings.secrets.edit — it uses the stored SMTP password.</p>
      ) : null}
    </div>
  );
}
