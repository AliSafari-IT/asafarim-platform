"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Alert,
  Button,
  FormRow,
  Input,
  Kicker,
  Label,
} from "@asafarim/ui";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await signIn("credentials", {
      identifier,
      password,
      redirect: false,
    });

    setPending(false);

    if (result?.error) {
      setError("That username/email and password combination was not accepted.");
      return;
    }

    if (callbackUrl.startsWith("/")) {
      router.push(callbackUrl);
      router.refresh();
    } else {
      window.location.href = callbackUrl;
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
  return (
    <div style={{ maxWidth: "26rem", margin: "4rem auto", padding: "0 1rem" }}>
      <Kicker index="SYS">Console access</Kicker>
      <h1 style={{ marginBottom: "var(--space-5)" }}>ASafarIM Admin</h1>
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
      <p className="u-mono" style={{ marginTop: "var(--space-4)" }}>
        system access is limited to authorized roles
      </p>
    </div>
  );
}
