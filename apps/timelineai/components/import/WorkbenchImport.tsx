"use client";

import { useId, useRef, useState } from "react";
import { Button, ButtonLink } from "@asafarim/ui";

type Preview = {
  ok: true;
  handoffId: string;
  source: { tool: string; toolVersion: string };
  title: string;
  summary: string;
  expiresAt: string;
  events: { title: string; date: string; precision: string; confidence: string; citations: number; uncited: boolean }[];
};
type Failure = { ok: false; code: string; message: string; details?: string[] };
type Done = { ok: true; status: "created" | "already_imported"; timelineId: string; events: number };

const PRECISION: Record<string, string> = {
  day: "Exact day",
  month: "Month",
  year: "Year",
  quarter: "Quarter",
  season: "Season",
  decade: "Decade",
  century: "Century",
  range: "Range",
  unknown: "Date unclear",
};

/** Upload → preview → confirm. Cancel at any point writes nothing. */
export function WorkbenchImport() {
  const [content, setContent] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<Failure | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const ids = { file: useId(), title: useId() };

  const post = async <T,>(path: string, body: unknown): Promise<T | Failure> => {
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return (await res.json()) as T | Failure;
    } catch {
      return { ok: false, code: "network", message: "TimelineAI couldn't be reached. Check your connection and try again; nothing was imported." };
    }
  };
  const focusStatus = () => requestAnimationFrame(() => statusRef.current?.focus());

  const reset = () => {
    setContent(null);
    setPreview(null);
    setError(null);
    setDone(null);
    setTitle("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    setError(null);
    setPreview(null);
    setDone(null);
    if (!file) return;
    setBusy(true);
    const text = await file.text();
    const result = await post<Preview>("/api/imports/workbench/preview", { content: text });
    setBusy(false);
    if (result.ok) {
      setContent(text);
      setPreview(result);
      setTitle(result.title);
    } else setError(result);
    focusStatus();
  };

  const confirm = async () => {
    if (!content) return;
    setBusy(true);
    const result = await post<Done>("/api/imports/workbench/confirm", { content, title });
    setBusy(false);
    if (result.ok) setDone(result);
    else setError(result);
    focusStatus();
  };

  return (
    <div className="mt-6 grid gap-6">
      {!preview && !done ? (
        <div className="grid gap-2">
          <label htmlFor={ids.file} className="font-semibold">
            Handoff file
          </label>
          <input id={ids.file} ref={fileRef} type="file" accept=".json,application/json" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
          <p className="text-xs opacity-70">It&apos;s read in your browser and checked by TimelineAI. Nothing is imported yet.</p>
        </div>
      ) : null}

      <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="outline-none">
        {busy ? <p>Checking…</p> : null}
        {error ? (
          <div className="rounded border border-red-400 p-4">
            <p className="font-semibold">Nothing was imported.</p>
            <p className="mt-1">{error.message}</p>
            {error.code === "sign_in" ? (
              <p className="mt-2">
                <a href="/import/workbench">Sign in and try again</a>
              </p>
            ) : null}
          </div>
        ) : null}
        {done ? (
          <div className="rounded border p-4">
            <p className="font-semibold">{done.status === "created" ? `Timeline created with ${done.events} events.` : "You've already imported this file."}</p>
            <p className="mt-1 text-sm">
              {done.status === "created" ? "It's private until you publish it." : "Importing it again doesn't create a copy; here's the timeline it created."}
            </p>
            <div className="mt-3 flex gap-3">
              <ButtonLink href={`/timelines/${done.timelineId}/edit`} variant="primary" size="sm">
                Open the timeline
              </ButtonLink>
              <Button type="button" size="sm" variant="ghost" onClick={reset}>
                Import another file
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {preview && !done ? (
        <section aria-labelledby="preview-heading" className="grid gap-4">
          <h2 id="preview-heading" className="text-lg font-semibold">
            This will create one private timeline with {preview.events.length} event{preview.events.length === 1 ? "" : "s"}
          </h2>
          <p className="text-xs opacity-70">
            From {preview.source.tool} {preview.source.toolVersion}. The file works until {new Date(preview.expiresAt).toLocaleDateString()}.
          </p>
          <div className="grid gap-1">
            <label htmlFor={ids.title} className="font-semibold">
              Timeline title
            </label>
            <input id={ids.title} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="rounded border px-2 py-1" />
          </div>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Events that will be created</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Precision</th>
                <th scope="col">Event</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {preview.events.map((e, i) => (
                <tr key={i} className="border-t align-top">
                  <td className="py-1 pr-2">{e.date}</td>
                  <td className="py-1 pr-2">{PRECISION[e.precision] ?? e.precision}</td>
                  <td className="py-1 pr-2">{e.title}</td>
                  <td className="py-1">{e.uncited ? "Uncited inference" : `${e.citations} source${e.citations === 1 ? "" : "s"}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-3">
            <Button type="button" variant="primary" onClick={confirm} disabled={busy}>
              Create timeline with {preview.events.length} events
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
