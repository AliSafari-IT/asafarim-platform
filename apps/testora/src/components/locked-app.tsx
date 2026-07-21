"use client";

import { LogIn, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL || "http://localhost:3001";

/**
 * Shown in place of a private app's data when the viewer is not signed in.
 * Access is managed by the platform SSO — signing in through the ASafarIM
 * identity (any active user) unlocks every private app at once.
 */
export function LockedApp({ name }: { projectId: string; name: string }) {
  function signIn() {
    const callbackUrl = typeof window !== "undefined" ? window.location.href : "";
    window.location.href = `${HUB_URL}/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="mx-auto mt-10 w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-400" />
            “{name}” is private
          </CardTitle>
          <CardDescription>
            Sign in with your ASafarIM account to view this app&apos;s requirements, suites,
            fixtures, cases and results. One sign-in covers every private app across the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={signIn}>
            <LogIn className="h-4 w-4" />
            Sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
