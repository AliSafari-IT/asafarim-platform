"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Alert, Button, FormRow, Input, Label } from "@asafarim/ui";
import { OtpInput } from "./OtpInput";
import styles from "./auth.module.css";

/**
 * Two-step OTP sign-in: request a code by email, then verify it.
 * NextAuth's "email-code" credentials provider (packages/auth) is the
 * canonical security gate for the verify step — this component only calls
 * the request API and then signIn("email-code", ...).
 */
export function EmailCodeForm({ callbackUrl, disabled }: { callbackUrl: string; disabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function resetToRequest() {
    setStep("request");
    setCode("");
    setError("");
    setSuccess("");
  }

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/email-code/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to send code. Please try again.");
        return;
      }
      setSuccess(data.message ?? "Check your email for a 6-character login code.");
      setStep("verify");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const result = await signIn("email-code", { email, code, redirect: false });
      if (result?.error) {
        setError("Invalid or expired code. Please try again.");
        return;
      }
      if (callbackUrl.startsWith("/")) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        window.location.href = callbackUrl;
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const isDisabled = disabled || isLoading;

  if (step === "request") {
    return (
      <form onSubmit={handleRequestCode}>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <FormRow>
          <Label htmlFor="ec-email">Email address</Label>
          <Input
            id="ec-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormRow>
        <Button type="submit" disabled={isDisabled || !email.includes("@")} style={{ width: "100%" }}>
          {isLoading ? "Sending code…" : "Send login code →"}
        </Button>
      </form>
    );
  }

  return (
    <div>
      {success ? <Alert tone="info">{success}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className={styles.sentTo}>
        <div>
          <div className="u-mono" style={{ fontSize: "0.7rem", textTransform: "uppercase" }}>
            Code sent to
          </div>
          <div>{email}</div>
        </div>
        <button type="button" className={styles.linkBtn} onClick={resetToRequest}>
          Change
        </button>
      </div>

      <form onSubmit={handleVerifyCode}>
        <OtpInput value={code} onChange={setCode} disabled={isDisabled} />
        <Button type="submit" disabled={isDisabled || code.length !== 6} style={{ width: "100%" }}>
          {isLoading ? "Verifying…" : "Sign in →"}
        </Button>
      </form>
    </div>
  );
}
