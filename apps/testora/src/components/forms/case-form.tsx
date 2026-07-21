"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Save } from "lucide-react";

type ScriptType = "single" | "multi" | "scripted";

const SCRIPT_PLACEHOLDER = `const urlInput = Selector('input.glass-input');
await t.typeText(urlInput, 'https://example.com/listing', { replace: true });
await t.click(Selector('button').withText('Start'));`;

interface FixtureOption {
  fixtureId: string;
  title: string;
}

interface CaseFormProps {
  mode?: "create" | "edit";
  initial?: {
    caseId: string;
    fixtureId: string;
    title: string;
    scriptType: ScriptType;
    input?: Record<string, unknown> | null;
    runs?: Record<string, unknown>[] | null;
    expected?: Record<string, unknown> | null;
    script?: string | null;
  };
  defaultFixtureId?: string;
  fixtureOptions: FixtureOption[];
  onSuccess?: () => void;
}

export function CaseForm({ mode = "create", initial, defaultFixtureId, fixtureOptions, onSuccess }: CaseFormProps) {
  const router = useRouter();
  const [caseId, setCaseId] = useState(initial?.caseId ?? "");
  const [fixtureId, setFixtureId] = useState(
    initial?.fixtureId ?? defaultFixtureId ?? fixtureOptions[0]?.fixtureId ?? "",
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [scriptType, setScriptType] = useState<ScriptType>(initial?.scriptType ?? "single");
  const [input, setInput] = useState(
    JSON.stringify(initial?.input ?? { email: "test@example.com", password: "Password123!" }, null, 2),
  );
  const [runs, setRuns] = useState(
    JSON.stringify(
      initial?.runs ?? (initial?.scriptType === "scripted" ? [] : [{ email: "user1@example.com", password: "wrong" }]),
      null,
      2,
    ),
  );
  const [expected, setExpected] = useState(
    JSON.stringify(initial?.expected ?? { errorMessage: "Invalid credentials" }, null, 2),
  );
  const [script, setScript] = useState(initial?.script ?? SCRIPT_PLACEHOLDER);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    let parsedInput: Record<string, unknown> | undefined;
    let parsedRuns: Record<string, unknown>[] | undefined;
    let parsedExpected: Record<string, unknown> = {};
    try {
      if (scriptType === "single") {
        parsedExpected = expected.trim() ? JSON.parse(expected) : {};
        parsedInput = JSON.parse(input);
      } else if (scriptType === "multi") {
        parsedExpected = expected.trim() ? JSON.parse(expected) : {};
        parsedRuns = JSON.parse(runs);
      } else if (scriptType === "scripted") {
        const parsed = runs.trim() ? JSON.parse(runs) : [];
        parsedRuns = Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined;
      }
    } catch {
      setError("Input, runs and expected must be valid JSON.");
      setSubmitting(false);
      return;
    }

    if (scriptType === "scripted" && !script.trim()) {
      setError("Script body is required for scripted cases.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(mode === "edit" ? `/api/cases/${initial?.caseId}` : "/api/cases", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(mode === "create" ? { caseId } : {}),
          fixtureId,
          title,
          scriptType,
          input: parsedInput,
          runs: parsedRuns,
          expected: parsedExpected,
          script: scriptType === "scripted" ? script : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to save case");
        return;
      }
      if (mode === "create") {
        setCaseId("");
        setTitle("");
      }
      onSuccess?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save case");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="case-id">Id</Label>
          <Input
            id="case-id"
            placeholder="invalid-password"
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            required
            disabled={mode === "edit"}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="case-title">Title</Label>
          <Input
            id="case-title"
            placeholder="Login fails with invalid password"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="case-fixture">Test fixture</Label>
        <select
          id="case-fixture"
          className="h-9 rounded-md border border-border bg-muted px-3 text-sm"
          value={fixtureId}
          onChange={(e) => setFixtureId(e.target.value)}
        >
          {fixtureOptions.map((fixture) => (
            <option key={fixture.fixtureId} value={fixture.fixtureId}>
              {fixture.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="case-script-type">Script type</Label>
        <select
          id="case-script-type"
          className="h-9 rounded-md border border-border bg-muted px-3 text-sm"
          value={scriptType}
          onChange={(e) => setScriptType(e.target.value as ScriptType)}
        >
          <option value="single">single</option>
          <option value="multi">multi</option>
          <option value="scripted">scripted (raw TestCafe code)</option>
        </select>
      </div>

      {scriptType === "single" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="case-input">Input (JSON)</Label>
          <textarea
            id="case-input"
            className="min-h-[100px] rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
      )}

      {scriptType === "multi" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="case-runs">Runs (JSON array)</Label>
          <textarea
            id="case-runs"
            className="min-h-[100px] rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono"
            value={runs}
            onChange={(e) => setRuns(e.target.value)}
          />
        </div>
      )}

      {scriptType === "scripted" && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="case-runs-scripted">
              Runs (JSON array, optional — exposes a <code>run</code> variable per iteration)
            </Label>
            <textarea
              id="case-runs-scripted"
              className="min-h-[80px] rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono"
              value={runs}
              onChange={(e) => setRuns(e.target.value)}
              placeholder='[{ "url": "https://example.com/listing-a" }, { "url": "https://example.com/listing-b" }]'
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="case-script">Script body (raw TestCafe code, runs inside async t =&gt; {"{ ... }"})</Label>
            <textarea
              id="case-script"
              className="min-h-[200px] rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono"
              value={script}
              onChange={(e) => setScript(e.target.value)}
            />
          </div>
        </>
      )}

      {scriptType !== "scripted" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="case-expected">Expected (JSON)</Label>
          <textarea
            id="case-expected"
            className="min-h-[80px] rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting} className="self-start">
        {mode === "edit" ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {submitting ? "Saving..." : mode === "edit" ? "Save changes" : "Create case"}
      </Button>
    </form>
  );
}
