"use client";

import { useState } from "react";
import { Button, FieldError, FormRow, Input, Label } from "@asafarim/ui";
import { api, ClientApiError, type Project } from "../lib/client/api";
import { track } from "../lib/client/telemetry";
import { copilotHref } from "../lib/ai/workflow";
import { useWorkspace } from "./WorkspaceShell";

export function ProjectsPanel({
  slug,
  canCreate,
  initialProjects,
}: {
  slug: string;
  canCreate: boolean;
  initialProjects: Project[];
}) {
  const { aiEnabled } = useWorkspace();
  const [projects, setProjects] = useState(initialProjects);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createProject(slug, { name: name.trim(), key: key.trim().toUpperCase() });
      track({ name: "project.created" });
      setProjects((p) => [...p, created]);
      setOpen(false);
      setName("");
      setKey("");
    } catch (err) {
      setError(
        err instanceof ClientApiError && err.code === "conflict_unique"
          ? "That project key is already used in this workspace."
          : err instanceof Error
            ? err.message
            : "Could not create the project.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ta-tw">
      <header className="ta-tw__head">
        <h1>Projects</h1>
        <span className="ta-tw__headactions">
          <a className="ta-link" href={`/w/${slug}/imports`}>
            Import tasks
          </a>
          {canCreate && (
            <Button size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? "Cancel" : "New project"}
            </Button>
          )}
        </span>
      </header>

      {open && (
        <form className="ta-panelform" onSubmit={create} noValidate>
          <FormRow>
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </FormRow>
          <FormRow>
            <Label htmlFor="p-key">Key</Label>
            <Input
              id="p-key"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              placeholder="WEB"
              pattern="[A-Z][A-Z0-9]+"
              required
            />
          </FormRow>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" size="sm" disabled={busy || !name.trim() || key.trim().length < 2}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </form>
      )}

      {projects.length === 0 ? (
        <div className="ta-callout" role="note">
          <p>
            No projects yet. A project is where tasks, plans and AI drafts land — create one above
            to get started.
          </p>
          {aiEnabled && (
            <p>
              Already have notes or a brief?{" "}
              <a
                className="ta-link"
                href={copilotHref(slug, { intent: "extract_plan", from: "projects_empty" })}
              >
                Turn a brief into a plan
              </a>{" "}
              — Copilot will help you create the project as part of the same flow, and nothing is
              saved until you approve it.
            </p>
          )}
        </div>
      ) : (
        <ul className="ta-cards">
          {projects.map((p) => (
            <li key={p.id}>
              <h3>
                <a href={`/w/${slug}/projects/${p.key}`}>
                  <span className="ta-key">{p.key}</span> {p.name}
                </a>
              </h3>
              {p.description && <p>{p.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
