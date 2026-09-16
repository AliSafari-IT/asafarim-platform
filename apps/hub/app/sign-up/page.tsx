"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, FormRow, Input, Kicker, Label } from "@asafarim/ui";
import { PasswordField } from "../_components/PasswordField";
import {
  AddressFields,
  EMPTY_ADDRESS,
  type AddressFieldsValue,
} from "../_components/AddressFields";
import {
  AuthCheckpointScene,
  type AuthCheckpointState,
} from "../_components/AuthCheckpointScene";
import { CheckIcon, UserPlusIcon } from "../_components/AuthIcons";
import styles from "../sign-in/_components/auth.module.css";

function SignUpPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const signInHref = `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showAddress, setShowAddress] = useState(false);
  const [address, setAddress] = useState<AddressFieldsValue>(EMPTY_ADDRESS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sceneState, setSceneState] = useState<AuthCheckpointState>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setSceneState("error");
      return;
    }

    setIsLoading(true);
    setSceneState("checking");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          username,
          email,
          password,
          location: showAddress ? address : undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(
          data.error ?? "Could not create your account. Please try again."
        );
        setSceneState("error");
        return;
      }
      setSceneState("success");
      router.push(`${signInHref}&created=1`);
    } catch {
      setError("Something went wrong. Please try again.");
      setSceneState("error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={styles.screen} data-scene-fullbleed>
      <div className={styles.topRow}>
        <div className={styles.intro}>
          <Kicker index="ID">Authentication</Kicker>
          <h1 style={{ marginBottom: "0.35rem" }}>Create your account</h1>
          <p className="u-muted" style={{ margin: 0 }}>
            Already have one?{" "}
            <Link
              href={signInHref}
              style={{ color: "var(--accent)", fontWeight: 600 }}
            >
              Sign in
            </Link>
          </p>

          <ul className={styles.introFeatures}>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <CheckIcon />
              </span>
              Free account, ready in under a minute
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <CheckIcon />
              </span>
              One login for every ASafarIM app
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <CheckIcon />
              </span>
              Address is optional — only if an app needs it
            </li>
          </ul>

          <p className={styles.introStat}>
            <strong>0</strong> extra passwords to remember
          </p>
        </div>

        <div className={styles.content}>
          <div className={`ui-card ui-card--elevated ${styles.card}`}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>
                <UserPlusIcon />
              </span>
              <div>
                <p className={styles.cardEyebrow}>New member</p>
                <p className={styles.cardTitle}>Set up your account</p>
              </div>
            </div>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <form onSubmit={handleSubmit}>
              <div className={styles.formGrid}>
                <FormRow>
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </FormRow>
                <FormRow>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    required
                    minLength={3}
                    maxLength={24}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                </FormRow>
              </div>
              <FormRow>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </FormRow>
              <div className={styles.formGrid}>
                <PasswordField
                  id="password"
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  required
                />
                <PasswordField
                  id="confirm-password"
                  label="Confirm password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  required
                />
              </div>

              <button
                type="button"
                onClick={() => setShowAddress((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  fontWeight: 600,
                  fontSize: "var(--text-sm)",
                  cursor: "pointer",
                  padding: 0,
                  margin: "0.5rem 0 1rem",
                }}
              >
                {showAddress
                  ? "− Hide address (optional)"
                  : "+ Add your address (optional)"}
              </button>

              {showAddress ? (
                <AddressFields
                  value={address}
                  onChange={setAddress}
                  idPrefix="signup-addr"
                />
              ) : null}

              <Button
                type="submit"
                disabled={isLoading}
                style={{ width: "100%", marginTop: "0.5rem" }}
              >
                {isLoading ? "Creating account…" : "Create account →"}
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className={styles.stage}>
        <AuthCheckpointScene state={sceneState} variant="enroll" />
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpPageContent />
    </Suspense>
  );
}
