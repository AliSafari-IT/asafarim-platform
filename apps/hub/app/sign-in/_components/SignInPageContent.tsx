"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import {
  Alert,
  Button,
  FormRow,
  Input,
  Kicker,
  Label,
  getPlatformLinks,
} from "@asafarim/ui";
import { GoogleButton } from "./GoogleButton";
import { PasswordField } from "../../_components/PasswordField";
import { MethodTabs, type SignInMethod } from "./MethodTabs";
import { EmailCodeForm } from "./EmailCodeForm";
import {
  AuthCheckpointScene,
  type AuthCheckpointState,
} from "../../_components/AuthCheckpointScene";
import { CheckIcon, LockIcon } from "../../_components/AuthIcons";
import styles from "./auth.module.css";

const links = getPlatformLinks();
const trustedOrigins = new Set(
  [
    links.web,
    links.hub,
    links.showcase,
    links.admin,
    links.vionto,
    links.testora,
    links.appbuilder,
    links.edumatch,
    links.timelineai,
    links.labs,
    links.jobmatch,
    links.tasksai,
  ].map((url) => new URL(url).origin)
);

function normalizeCallbackUrl(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (raw.startsWith("/sign-in") || raw.startsWith("/sign-up"))
      return "/dashboard";
    return raw;
  }
  try {
    const url = new URL(raw);
    if (trustedOrigins.has(url.origin)) return raw;
  } catch {
    // ignore malformed URLs
  }
  return "/dashboard";
}

function SignInPageContentInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const callbackUrl = normalizeCallbackUrl(searchParams.get("callbackUrl"));
  const urlError = searchParams.get("error");
  const justCreated = searchParams.get("created") === "1";
  const signUpHref = `/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  const [method, setMethod] = useState<SignInMethod>("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sceneState, setSceneState] = useState<AuthCheckpointState>("idle");

  useEffect(() => {
    if (urlError === "CredentialsSignin") {
      setError("Invalid username/email or password.");
      setSceneState("error");
    }
  }, [urlError]);

  const globalDisabled = isLoading || status === "loading";

  async function handleMethodChange(m: SignInMethod) {
    setMethod(m);
    setError("");
    setSceneState("idle");
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSceneState("checking");
    try {
      const result = await signIn("credentials", {
        identifier,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid username/email or password.");
        setSceneState("error");
        return;
      }
      setSceneState("success");
      if (callbackUrl.startsWith("/")) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        window.location.href = callbackUrl;
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setSceneState("error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setIsLoading(true);
    setSceneState("checking");
    await signIn("google", { callbackUrl, redirect: true });
  }

  return (
    <div className={styles.screen} data-scene-fullbleed>
      <div className={styles.topRow}>
        <div className={styles.intro}>
          <Kicker index="ID">Authentication</Kicker>
          <h1 style={{ marginBottom: "0.35rem" }}>Sign in to ASafarIM</h1>
          <p className="u-muted" style={{ margin: 0 }}>
            New here?{" "}
            <Link
              href={signUpHref}
              style={{ color: "var(--accent)", fontWeight: 600 }}
            >
              Create an account
            </Link>
          </p>

          <ul className={styles.introFeatures}>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <CheckIcon />
              </span>
              One identity, every ASafarIM app
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <CheckIcon />
              </span>
              Password, Google, or a one-time email code
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <CheckIcon />
              </span>
              Your session follows you across the platform
            </li>
          </ul>

          <p className={styles.introStat}>
            <strong>11 apps</strong> &middot; one sign-in
          </p>
        </div>

        <div className={styles.content}>
          <div className={`ui-card ui-card--elevated ${styles.card}`}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>
                <LockIcon />
              </span>
              <div>
                <p className={styles.cardEyebrow}>Secure sign-in</p>
                <p className={styles.cardTitle}>Welcome back</p>
              </div>
            </div>

            {justCreated ? (
              <Alert tone="info">Account created — sign in below.</Alert>
            ) : null}
            {error ? <Alert tone="error">{error}</Alert> : null}

            <GoogleButton
              onClick={handleGoogleSignIn}
              disabled={globalDisabled}
              label="Continue with Google"
            />

            <div className={styles.divider}>
              <span className={styles.dividerLabel}>or</span>
            </div>

            <MethodTabs
              active={method}
              onChange={handleMethodChange}
              disabled={globalDisabled}
            />

            {method === "password" ? (
              <form onSubmit={handlePasswordSubmit}>
                <div className={styles.formGrid}>
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
                  <PasswordField
                    id="password"
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={globalDisabled}
                  style={{ width: "100%" }}
                >
                  {isLoading ? "Signing in…" : "Sign in →"}
                </Button>
              </form>
            ) : (
              <EmailCodeForm
                callbackUrl={callbackUrl}
                disabled={globalDisabled}
                onAuthStateChange={setSceneState}
              />
            )}
          </div>
        </div>
      </div>

      <div className={styles.stage}>
        <AuthCheckpointScene state={sceneState} />
      </div>
    </div>
  );
}

export function SignInPageContent() {
  return (
    <Suspense fallback={null}>
      <SignInPageContentInner />
    </Suspense>
  );
}
