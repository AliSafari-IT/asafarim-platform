"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Card } from "@asafarim/ui";

const inputStyle = {
  display: "block",
  width: "100%",
  padding: "0.5rem 0.75rem",
  marginBottom: "0.75rem",
  borderRadius: "0.4rem",
  border: "1px solid #334155",
  backgroundColor: "#0f172a",
  color: "#e2e8f0",
  fontSize: "1rem",
} as const;

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setPending(false);

    if (result?.error) {
      setError("Invalid email or password.");
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
    <Card title="Sign in">
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        {error ? <p style={{ color: "#f87171" }}>{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </Card>
  );
}

export default function SignInPage() {
  return (
    <div style={{ maxWidth: "28rem", margin: "3rem auto" }}>
      <h1 style={{ color: "#f1f5f9" }}>Sign in to ASafarIM</h1>
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
