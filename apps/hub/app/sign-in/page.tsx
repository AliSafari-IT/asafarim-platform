"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Alert, Button, FormRow, Input, Kicker, Label } from "@asafarim/ui";
import { GoogleButton } from "./_components/GoogleButton";
import { PasswordField } from "../_components/PasswordField";
import { MethodTabs, type SignInMethod } from "./_components/MethodTabs";
import { EmailCodeForm } from "./_components/EmailCodeForm";
import styles from "./_components/auth.module.css";

function normalizeCallbackUrl(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (raw.startsWith("/sign-in") || raw.startsWith("/sign-up")) return "/dashboard";
    return raw;
  }
  return "/dashboard";
}

function SignInPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const callbackUrl = normalizeCallbackUrl(searchParams.get("callbackUrl"));
  const urlError = searchParams.get("error");
  const justCreated = searchParams.get("created") === "1";
  const signUpHref = `/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  const [method, setMethod] = useState<SignInMethod>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (urlError === "CredentialsSignin") setError("Invalid email or password.");
  }, [urlError]);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
      router.refresh();
    }
  }, [status, callbackUrl, router]);

  function handleMethodChange(m: SignInMethod) {
    setMethod(m);
    setError("");
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("Invalid email or password.");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setIsLoading(true);
    await signIn("google", { callbackUrl, redirect: true });
  }

  const globalDisabled = isLoading || status === "loading";

  return (
    <div style={{ maxWidth: "30rem", margin: "3rem auto" }}>
      <Kicker index="ID">Authentication</Kicker>
      <h1 style={{ marginBottom: "0.35rem" }}>Sign in to ASafarIM</h1>
      <p className="u-muted" style={{ marginBottom: "var(--space-5)" }}>
        New here?{" "}
        <Link href={signUpHref} style={{ color: "var(--accent)", fontWeight: 600 }}>
          Create an account
        </Link>
      </p>

      <div className={`ui-card ui-card--elevated ${styles.card}`}>
        {justCreated ? <Alert tone="info">Account created — sign in below.</Alert> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}

        <GoogleButton onClick={handleGoogleSignIn} disabled={globalDisabled} label="Continue with Google" />

        <div className={styles.divider}>
          <span className={styles.dividerLabel}>or</span>
        </div>

        <MethodTabs active={method} onChange={handleMethodChange} disabled={globalDisabled} />

        {method === "password" ? (
          <form onSubmit={handlePasswordSubmit}>
            <FormRow>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormRow>
            <PasswordField
              id="password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
            />
            <Button type="submit" disabled={globalDisabled} style={{ width: "100%" }}>
              {isLoading ? "Signing in…" : "Sign in →"}
            </Button>
          </form>
        ) : (
          <EmailCodeForm callbackUrl={callbackUrl} disabled={globalDisabled} />
        )}
      </div>

      <p className={styles.footNote}>one account · every asafarim app</p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInPageContent />
    </Suspense>
  );
}
