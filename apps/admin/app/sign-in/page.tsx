"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { createCallbackUrlNormalizer } from "@asafarim/auth/callback-url";
import {
  Alert,
  Button,
  FormRow,
  Input,
  Kicker,
  Label,
  getTrustedPlatformOrigins,
} from "@asafarim/ui";
import { AdminSignInScene, type AdminAuthState } from "./AdminSignInScene";
import styles from "./admin-sign-in.module.css";

function SignInForm({
  onStateChange,
}: {
  onStateChange: (state: AdminAuthState) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // callbackUrl is untrusted query input (#807): decide on the resolved URL, never follow the raw string.
  const rawCallbackUrl = searchParams.get("callbackUrl");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    onStateChange("checking");

    const result = await signIn("credentials", {
      identifier,
      password,
      redirect: false,
    });

    setPending(false);

    if (result?.error) {
      setError(
        "That username/email and password combination was not accepted."
      );
      onStateChange("error");
      return;
    }

    onStateChange("success");

    const callbackUrl = createCallbackUrlNormalizer({
      selfOrigin: window.location.origin,
      trustedOrigins: getTrustedPlatformOrigins(),
      fallback: "/",
      signInPaths: ["/sign-in"],
    })(rawCallbackUrl);
    if (callbackUrl.startsWith("/")) {
      router.push(callbackUrl);
      router.refresh();
    } else {
      window.location.assign(callbackUrl);
    }
  }

  return (
    <div className="ui-card ui-card--console">
      <form onSubmit={handleSubmit}>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <FormRow>
          <Label htmlFor="identifier">Username or email</Label>
          <Input
            id="identifier"
            type="text"
            required
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </FormRow>
        <FormRow>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormRow>
        <Button type="submit" variant="console" disabled={pending}>
          {pending ? "authenticating..." : "authenticate"}
        </Button>
      </form>
    </div>
  );
}

export default function SignInPage() {
  const [authState, setAuthState] = useState<AdminAuthState>("idle");

  return (
    <main className={styles.screen}>
      <AdminSignInScene state={authState} />
      <section
        className={`${styles.formColumn} ${
          authState === "checking"
            ? styles.stateChecking
            : authState === "success"
              ? styles.stateSuccess
              : authState === "error"
                ? styles.stateError
                : ""
        }`}
      >
        <div className={styles.formHeader}>
          <span>Console access</span>
          <span className={styles.signal}>
            {authState === "checking"
              ? "checking"
              : authState === "success"
                ? "authorized"
                : authState === "error"
                  ? "blocked"
                  : "online"}
          </span>
        </div>
        <Kicker index="SYS">Admin gateway</Kicker>
        <h1 style={{ marginBottom: "var(--space-5)" }}>ASafariM Admin</h1>
        <Suspense fallback={null}>
          <div className={styles.formCard}>
            <SignInForm onStateChange={setAuthState} />
          </div>
        </Suspense>
        <p className={styles.footerNote}>
          system access is limited to authorized roles
        </p>
      </section>
    </main>
  );
}
