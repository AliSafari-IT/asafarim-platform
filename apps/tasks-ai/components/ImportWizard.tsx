"use client";

import { useState } from "react";
import { Button, FieldError, FormRow, Input, Label, Select, Textarea } from "@asafarim/ui";
import { api, ClientApiError, type ImportSummary } from "../lib/client/api";

/**
 * CSV/JSON import wizard (M05). Paste the file contents, map the columns,
 * dry-run to preview, then apply. Apply is idempotent server-side.
 */
export function ImportWizard({
  slug,
  projects,
  initialKind = "csv",
}: {
  slug: string;
  projects: { id: string; key: string; name: string }[];
  /** "handoff" when arriving from the AI Workbench's "Continue in TasksAI". */
  initialKind?: "csv" | "json" | "handoff";
}) {
  const [kind, setKind] = useState<"csv" | "json" | "handoff">(initialKind);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [toInbox, setToInbox] = useState(false);
  const [titleCol, setTitleCol] = useState("Title");
  const [descCol, setDescCol] = useState("");
  const [dueCol, setDueCol] = useState("");
  const [idCol, setIdCol] = useState("");
  const [dry, setDry] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Every field below is baked into the dry run, so changing any of them
   * makes the existing preview describe a different import than the one
   * Apply would run. Drop the preview rather than let Apply commit staged
   * rows the form no longer shows.
   */
  function edit<T>(set: (value: T) => void, value: T) {
    set(value);
    setDry(null);
  }

  async function preview() {
    setBusy(true);
    setError(null);
    try {
      if (kind === "handoff") {
        setDry(await api.createHandoffImport(slug, { projectId, content, captureToInbox: toInbox }));
        return;
      }
      const mapping: Record<string, string> = { title: titleCol };
      if (descCol) mapping.description = descCol;
      if (dueCol) mapping.dueDate = dueCol;
      if (idCol) mapping.externalId = idCol;
      const res = await api.createImport(slug, {
        kind,
        filename: `paste.${kind}`,
        projectId,
        mapping,
        content,
        captureToInbox: toInbox,
      });
      setDry(res);
    } catch (err) {
      setError(
        err instanceof ClientApiError && err.code === "validation_failed" && typeof (err.details as { handoff?: unknown } | undefined)?.handoff === "string"
          ? `Nothing was imported. ${(err.details as { handoff: string }).handoff}`
          : err instanceof ClientApiError && err.code === "validation_failed"
          ? `File could not be parsed: ${JSON.stringify(err.details)}`
          : err instanceof Error
            ? err.message
            : "Import failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!dry) return;
    setBusy(true);
    try {
      const done = await api.applyImport(slug, dry.id);
      setDry(done);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ta-tw">
      <header className="ta-tw__head"><h1>Import tasks</h1></header>
      <p className="ta-muted">Paste a CSV or JSON export. Nothing is created until you apply the dry run.</p>

      <div className="ta-panelform">
        <FormRow>
          <Label htmlFor="im-kind">Format</Label>
          <Select
            id="im-kind"
            value={kind}
            onChange={(e) => edit(setKind, e.target.value as "csv" | "json" | "handoff")}
            options={[
              { value: "csv", label: "CSV" },
              { value: "json", label: "JSON" },
              { value: "handoff", label: "AI Workbench handoff file" },
            ]}
          />
        </FormRow>
        <FormRow>
          <Label htmlFor="im-proj">Into project</Label>
          <Select id="im-proj" value={projectId} onChange={(e) => edit(setProjectId, e.target.value)} options={projects.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` }))} />
        </FormRow>
        <FormRow>
          {/* Imports can be treated as capture rather than as planned work
              (issue #366) — one rule, every channel. */}
          <label className="ta-toggle">
            <input
              type="checkbox"
              checked={toInbox}
              onChange={(e) => edit(setToInbox, e.target.checked)}
            />
            Review the imported rows in the Inbox before they count as planned work
          </label>
        </FormRow>
        {kind === "handoff" ? (
          <FormRow>
            <Label htmlFor="im-file">Handoff file</Label>
            <input
              id="im-file"
              type="file"
              accept=".json,application/json"
              onChange={async (e) => edit(setContent, (await e.target.files?.[0]?.text()) ?? "")}
            />
            <p className="ta-muted">
              From the AI Workbench&apos;s Notes → Action Plan tool. The dry run lists every task before anything is created; tasks arrive without
              assignees or due dates.
            </p>
          </FormRow>
        ) : (
          <FormRow>
            <Label htmlFor="im-content">File contents</Label>
            <Textarea id="im-content" rows={8} value={content} onChange={(e) => edit(setContent, e.target.value)} placeholder="Id,Title,Notes,Due&#10;1,Draft brief,,2026-09-10" />
          </FormRow>
        )}
        {kind !== "handoff" && (
        <div className="ta-import__map">
          <label>Title col<Input value={titleCol} onChange={(e) => edit(setTitleCol, e.target.value)} /></label>
          <label>Description col<Input value={descCol} onChange={(e) => edit(setDescCol, e.target.value)} placeholder="(optional)" /></label>
          <label>Due col<Input value={dueCol} onChange={(e) => edit(setDueCol, e.target.value)} placeholder="(optional)" /></label>
          <label>External id col<Input value={idCol} onChange={(e) => edit(setIdCol, e.target.value)} placeholder="(dedup key)" /></label>
        </div>
        )}
        {error && <FieldError>{error}</FieldError>}
        <Button size="sm" onClick={preview} disabled={busy || content.trim().length < 5 || !projectId || !titleCol}>
          {busy ? "Working…" : "Dry run"}
        </Button>
      </div>

      {dry && (
        <div className="ta-callout">
          <strong>{dry.state}</strong> — {dry.totalRows} row(s): {dry.okRows} ok · {dry.duplicateRows} duplicate ·{" "}
          {dry.failedRows} error · {dry.appliedRows} applied.
          {dry.errors.length > 0 && (
            <ul>
              {dry.errors.slice(0, 10).map((e, i) => (
                <li key={i}>
                  <code>{e.rowKey}</code>: {e.errors.join("; ")}
                </li>
              ))}
            </ul>
          )}
          {dry.alreadyImported && <p>This handoff file was already imported into this workspace, so nothing new will be created.</p>}
          {kind === "handoff" && dry.preview && dry.preview.length > 0 && (
            <>
              <p>{dry.state === "completed" ? "Created:" : "Apply will create exactly these tasks:"}</p>
              <ol>
                {dry.preview.map((row) => (
                  <li key={row.rowKey}>{row.title}</li>
                ))}
              </ol>
            </>
          )}
          {dry.state === "dry_run_ready" && (
            <Button size="sm" onClick={apply} disabled={busy || dry.okRows === 0}>
              Apply {dry.okRows} row(s)
            </Button>
          )}
          {dry.state === "dry_run_ready" && (
            <Button size="sm" variant="ghost" onClick={() => setDry(null)} disabled={busy}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
