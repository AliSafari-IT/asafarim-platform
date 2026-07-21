"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Save } from "lucide-react";

interface SuiteOption {
  suiteId: string;
  title: string;
}

interface FixtureFormProps {
  mode?: "create" | "edit";
  initial?: {
    fixtureId: string;
    suiteId: string;
    title: string;
    baseUrl?: string | null;
    commonInput: Record<string, unknown>;
  };
  defaultSuiteId?: string;
  suiteOptions: SuiteOption[];
  onSuccess?: () => void;
}

export function FixtureForm({ mode = "create", initial, defaultSuiteId, suiteOptions, onSuccess }: FixtureFormProps) {
  const router = useRouter();
  const [fixtureId, setFixtureId] = useState(initial?.fixtureId ?? "");
  const [suiteId, setSuiteId] = useState(initial?.suiteId ?? defaultSuiteId ?? suiteOptions[0]?.suiteId ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [commonInput, setCommonInput] = useState(JSON.stringify(initial?.commonInput ?? {}, null, 2));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    let parsedCommonInput: Record<string, unknown>;
    try {
      parsedCommonInput = commonInput.trim() ? JSON.parse(commonInput) : {};
    } catch {
      setError("Common input must be valid JSON.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(mode === "edit" ? `/api/fixtures/${initial?.fixtureId}` : "/api/fixtures", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "edit"
            ? { title, baseUrl, commonInput: parsedCommonInput, suiteId }
            : { fixtureId, suiteId, title, baseUrl, commonInput: parsedCommonInput },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to save fixture");
        return;
      }
      if (mode === "create") {
        setFixtureId("");
        setTitle("");
        setBaseUrl("");
        setCommonInput("{}");
      }
      onSuccess?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save fixture");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fixture-id">Id</Label>
          <Input
            id="fixture-id"
            placeholder="login-with-email"
            value={fixtureId}
            onChange={(e) => setFixtureId(e.target.value)}
            required
            disabled={mode === "edit"}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fixture-title">Title</Label>
          <Input id="fixture-title" placeholder="Login using email/password" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fixture-suite">Test suite</Label>
        <select
          id="fixture-suite"
          className="h-9 rounded-md border border-border bg-muted px-3 text-sm"
          value={suiteId}
          onChange={(e) => setSuiteId(e.target.value)}
        >
          {suiteOptions.map((suite) => (
            <option key={suite.suiteId} value={suite.suiteId}>
              {suite.title}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fixture-baseurl">
          Base URL (optional — a full URL overrides the requirement&apos;s base URL entirely; a path
          like <code>/en/login</code> is appended to it)
        </Label>
        <Input
          id="fixture-baseurl"
          placeholder="https://example-app.local/login or /en/login"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fixture-common-input">Common input (JSON)</Label>
        <textarea
          id="fixture-common-input"
          className="min-h-[90px] rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono"
          value={commonInput}
          onChange={(e) => setCommonInput(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting} className="self-start">
        {mode === "edit" ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {submitting ? "Saving..." : mode === "edit" ? "Save changes" : "Create fixture"}
      </Button>
    </form>
  );
}
