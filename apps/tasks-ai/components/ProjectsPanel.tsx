"use client";

import { useState } from "react";
import { Button, FieldError, FormRow, Input, Label } from "@asafarim/ui";
import { api, ClientApiError, type Project } from "../lib/client/api";
import { track } from "../lib/client/telemetry";

export function ProjectsPanel({
  slug,
  canCreate,
  initialProjects,
}: {
  slug: string;
  canCreate: boolean;
  initialProjects: Project[];
}) {
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
        {canCreate && (
          <Button size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "New project"}
          </Button>
        )}
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
        <p className="ta-muted">No projects yet.</p>
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
