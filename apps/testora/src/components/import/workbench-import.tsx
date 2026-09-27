"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { trackHandoffCompleted } from "@asafarim/tool-handoff";

type Preview = {
  ok: true;
  source: { tool: string; toolVersion: string };
  expiresAt: string;
  requirement: { id: string; title: string };
  suite: string;
  fixture: string;
  cases: { caseId: string; title: string; priority: string; basis: string; steps: number }[];
  questions: number;
};
type Failure = { ok: false; code: string; message: string };
type Done = { ok: true; status: "created" | "already_imported"; frId: string; cases: number };

/** Upload → preview → confirm (admins). Cancel at any point writes nothing. */
export function WorkbenchImport({ apps, defaultAppId, canConfirm }: { apps: { id: string; name: string }[]; defaultAppId: string; canConfirm: boolean }) {
  const [content, setContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [appId, setAppId] = useState(defaultAppId);
  const [error, setError] = useState<Failure | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const ids = { file: useId(), app: useId() };

  const post = async <T,>(path: string, body: unknown): Promise<T | Failure> => {
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return (await res.json()) as T | Failure;
    } catch {
      return { ok: false, code: "network", message: "Testora couldn't be reached. Check your connection and try again; nothing was imported." };
    }
  };
  const focusStatus = () => requestAnimationFrame(() => statusRef.current?.focus());
  const reset = () => {
    setContent(null);
    setPreview(null);
    setError(null);
    setDone(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    setBusy(true);
    const text = await file.text();
    const result = await post<Preview>("/api/imports/workbench/preview", { content: text });
    setBusy(false);
    if (result.ok) {
      setContent(text);
      setPreview(result);
    } else setError(result);
    focusStatus();
  };

  const confirm = async () => {
    if (!content) return;
    setBusy(true);
    const result = await post<Done>("/api/imports/workbench/confirm", { content, projectId: appId });
    setBusy(false);
    if (result.ok) {
      setDone(result);
      if (result.status === "created" && preview) trackHandoffCompleted(preview.source, "testora");
    }
    else setError(result);
    focusStatus();
  };

  return (
    <div className="flex flex-col gap-4">
      {!preview && !done ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.file}>Handoff file</Label>
          <input id={ids.file} ref={fileRef} type="file" accept=".json,application/json" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      ) : null}

      <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="outline-none">
        {busy ? <p>Checking…</p> : null}
        {error ? (
          <div className="rounded-md border border-red-500 p-4">
            <p className="font-semibold">Nothing was imported.</p>
            <p>{error.message}</p>
          </div>
        ) : null}
        {done ? (
          <div className="rounded-md border p-4">
            <p className="font-semibold">
              {done.status === "created" ? `Created ${done.cases} pending scenarios.` : "You've already imported this file; nothing new was created."}
            </p>
            <div className="mt-3 flex gap-3">
              <a className="font-semibold underline" href={`/requirements/${done.frId}`}>
                Open the requirement
              </a>
              <Button type="button" variant="ghost" onClick={reset}>
                Import another file
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {preview && !done ? (
        <section aria-labelledby="wb-preview" className="flex flex-col gap-3">
          <h2 id="wb-preview" className="text-lg font-semibold">
            This will create 1 requirement, 1 suite, 1 fixture, and {preview.cases.length} pending scenario{preview.cases.length === 1 ? "" : "s"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Requirement &ldquo;{preview.requirement.title}&rdquo; from {preview.source.tool} {preview.source.toolVersion}
            {preview.questions ? `, with ${preview.questions} open question${preview.questions === 1 ? "" : "s"} in its description` : ""}. The file works
            until {new Date(preview.expiresAt).toLocaleDateString()}.
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor={ids.app}>Into app</Label>
            <select id={ids.app} value={appId} onChange={(e) => setAppId(e.target.value)} className="rounded-md border px-2 py-1">
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Pending scenarios that will be created</caption>
            <thead>
              <tr>
                <th scope="col">Scenario</th>
                <th scope="col">Priority</th>
                <th scope="col">Basis</th>
                <th scope="col">Steps</th>
              </tr>
            </thead>
            <tbody>
              {preview.cases.map((c) => (
                <tr key={c.caseId} className="border-t align-top">
                  <td className="py-1 pr-2">{c.title}</td>
                  <td className="py-1 pr-2">{c.priority}</td>
                  <td className="py-1 pr-2">{c.basis === "extracted" ? "Traced to the requirement" : "Inferred risk"}</td>
                  <td className="py-1">{c.steps}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {canConfirm ? null : <p className="text-sm">Only Testora admins can create requirements. Ask an admin to import this file.</p>}
          <div className="flex gap-3">
            <Button type="button" onClick={confirm} disabled={busy || !canConfirm || !appId}>
              Create {preview.cases.length} pending scenarios
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
