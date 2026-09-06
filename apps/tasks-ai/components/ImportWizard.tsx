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
}: {
  slug: string;
  projects: { id: string; key: string; name: string }[];
}) {
  const [kind, setKind] = useState<"csv" | "json">("csv");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [titleCol, setTitleCol] = useState("Title");
  const [descCol, setDescCol] = useState("");
  const [dueCol, setDueCol] = useState("");
  const [idCol, setIdCol] = useState("");
  const [dry, setDry] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function preview() {
    setBusy(true);
    setError(null);
    try {
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
      });
      setDry(res);
    } catch (err) {
      setError(
        err instanceof ClientApiError && err.code === "validation_failed"
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
          <Select id="im-kind" value={kind} onChange={(e) => setKind(e.target.value as "csv" | "json")} options={[{ value: "csv", label: "CSV" }, { value: "json", label: "JSON" }]} />
        </FormRow>
        <FormRow>
          <Label htmlFor="im-proj">Into project</Label>
          <Select id="im-proj" value={projectId} onChange={(e) => setProjectId(e.target.value)} options={projects.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` }))} />
        </FormRow>
        <FormRow>
          <Label htmlFor="im-content">File contents</Label>
          <Textarea id="im-content" rows={8} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Id,Title,Notes,Due&#10;1,Draft brief,,2026-09-10" />
        </FormRow>
        <div className="ta-import__map">
          <label>Title col<Input value={titleCol} onChange={(e) => setTitleCol(e.target.value)} /></label>
          <label>Description col<Input value={descCol} onChange={(e) => setDescCol(e.target.value)} placeholder="(optional)" /></label>
          <label>Due col<Input value={dueCol} onChange={(e) => setDueCol(e.target.value)} placeholder="(optional)" /></label>
          <label>External id col<Input value={idCol} onChange={(e) => setIdCol(e.target.value)} placeholder="(dedup key)" /></label>
        </div>
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
          {dry.state === "dry_run_ready" && (
            <Button size="sm" onClick={apply} disabled={busy || dry.okRows === 0}>
              Apply {dry.okRows} row(s)
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
