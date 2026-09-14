"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FieldError, FormRow, Input, Label } from "@asafarim/ui";
import { api, ClientApiError } from "../../lib/client/api";
import { track } from "../../lib/client/telemetry";
import { formatDate } from "../../lib/i18n/format";
import { COPILOT_INTENTS, copilotHref } from "../../lib/ai/workflow";
import {
  activationChecklist,
  activationProgress,
  activationStage,
  headlineFor,
  homeMode,
  type ActivationStage,
  type ActivationStep,
  type WorkspaceHomeData,
} from "../../lib/home/state";

/**
 * The workspace home (issue #365). One screen that answers "what is this,
 * what can I do, what should I do first, what next" — and that stops being
 * a tutorial as soon as the workspace has real work in it.
 */
export function WorkspaceHome({
  slug,
  workspaceName,
  canCreateProject,
  data,
}: {
  slug: string;
  workspaceName: string;
  canCreateProject: boolean;
  data: WorkspaceHomeData;
}) {
  const { counts, projects, myNext, defaultProjectId, latestProposal } = data;
  const stage = activationStage(counts);
  const mode = homeMode(stage);
  const headline = headlineFor(stage, workspaceName);
  const steps = activationChecklist(counts);
  const progress = activationProgress(counts);

  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    track({ name: "workspace.home.viewed", stage, mode });
  }, [stage, mode]);

  return (
    <section className="ta-whome" aria-labelledby="ta-whome-title">
      <header className="ta-whome__head">
        <p className="ta-kicker">{workspaceName}</p>
        <h1 id="ta-whome-title">{headline.title}</h1>
        <p className="ta-whome__lead">{headline.lead}</p>
      </header>

      {mode === "first_run" ? (
        <FirstRun
          slug={slug}
          stage={stage}
          steps={steps}
          progress={progress}
          canCreateProject={canCreateProject}
          defaultProjectId={defaultProjectId}
          defaultProjectName={projects.find((p) => p.id === defaultProjectId)?.name ?? null}
          aiEnabled={counts.aiEnabled}
          hint={headline.hint}
        />
      ) : (
        <Oriented
          slug={slug}
          stage={stage}
          steps={steps}
          progress={progress}
          counts={counts}
          projects={projects}
          myNext={myNext}
          latestProposal={latestProposal}
          hint={headline.hint}
        />
      )}

      {/*
        The intent-to-plan workflow, discoverable without already knowing the
        word "Copilot" (issue #368). Each entry is the outcome, in the words
        somebody would use before they have read any documentation.
      */}
      {counts.aiEnabled && (
        <section className="ta-whome__intents" aria-labelledby="ta-whome-intents">
          <h2 className="ta-whome__h2" id="ta-whome-intents">
            Start from something you already wrote
          </h2>
          <p className="ta-muted">
            Paste notes, a brief or a thread. TasksAI drafts a proposal you review line by line —
            nothing reaches your workspace until you approve it.
          </p>
          <ul className="ta-whome__ways">
            {COPILOT_INTENTS.map((intent) => (
              <li key={intent.id}>
                <a href={copilotHref(slug, { intent: intent.id, from: "workspace_home" })}>
                  {intent.entryLabel}
                </a>
                <span>{intent.outcome}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="ta-whome__foot">
        <h2 className="ta-whome__h2">Other ways to start</h2>
        <ul className="ta-whome__ways">
          <li>
            <a href={`/w/${slug}/projects`}>Projects</a>
            <span>Create a project, or open one to see everything in it.</span>
          </li>
          <li>
            <a href={`/w/${slug}/imports`}>Import tasks</a>
            <span>Bring in a CSV or JSON list you already keep somewhere else.</span>
          </li>
          <li>
            <a href={copilotHref(slug, { from: "workspace_home_footer" })}>
              Turn notes into a plan
            </a>
            <span>
              {counts.aiEnabled
                ? "Paste meeting notes or a brief and review the tasks it drafts. Nothing is saved until you approve it."
                : "AI is switched off for this workspace. Everything else keeps working exactly the same."}
            </span>
          </li>
          <li>
            <a href={`/w/${slug}/inbox`}>Inbox</a>
            <span>Everything captured that nobody has sorted out yet.</span>
          </li>
        </ul>
        <p className="ta-muted ta-whome__note">
          Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd> anywhere to jump to a screen or capture a
          task.
        </p>
      </footer>
    </section>
  );
}

/* ── first run ──────────────────────────────────────────────────────── */

function FirstRun({
  slug,
  stage,
  steps,
  progress,
  canCreateProject,
  defaultProjectId,
  defaultProjectName,
  aiEnabled,
  hint,
}: {
  slug: string;
  stage: ActivationStage;
  steps: ActivationStep[];
  progress: { done: number; total: number };
  canCreateProject: boolean;
  defaultProjectId: string | null;
  defaultProjectName: string | null;
  aiEnabled: boolean;
  hint: string;
}) {
  return (
    <>
      <Workflow steps={steps} progress={progress} />

      <div className="ta-whome__cta">
        {stage === "no_projects" ? (
          canCreateProject ? (
            <CreateFirstProject slug={slug} hint={hint} />
          ) : (
            <div className="ta-callout" role="note">
              <p>
                This workspace has no projects yet, and your role cannot create one. Ask a workspace
                admin to create the first project — then your work will have somewhere to live.
              </p>
            </div>
          )
        ) : (
          <CaptureFirstTask
            slug={slug}
            projectId={defaultProjectId}
            projectName={defaultProjectName}
            aiEnabled={aiEnabled}
            hint={hint}
          />
        )}
      </div>
    </>
  );
}

/** Same shape the API enforces; mirrored here so bad keys never leave the page. */
const PROJECT_KEY_RE = /^[A-Z][A-Z0-9]+$/;

function CreateFirstProject({ slug, hint }: { slug: string; hint: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedKey = key.trim().toUpperCase();
    if (!PROJECT_KEY_RE.test(trimmedKey)) {
      setError("A short code is two or more letters or digits, starting with a letter — like WEB.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.createProject(slug, {
        name: name.trim(),
        key: trimmedKey,
      });
      track({ name: "project.created" });
      track({ name: "workspace.activation.project_created", from: "workspace_home" });
      router.push(`/w/${slug}/projects/${created.key}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ClientApiError && err.code === "conflict_unique"
          ? "That short code is already used in this workspace. Try another."
          : err instanceof Error
            ? err.message
            : "Could not create the project.",
      );
      setBusy(false);
    }
  }

  return (
    <form className="ta-whome__form" onSubmit={submit} noValidate aria-labelledby="ta-whome-cta">
      <h2 className="ta-whome__h2" id="ta-whome-cta">
        Create your first project
      </h2>
      <p className="ta-muted">{hint}</p>
      <FormRow>
        <Label htmlFor="wh-name">Project name</Label>
        <Input
          id="wh-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Website relaunch"
          required
        />
      </FormRow>
      <FormRow>
        <Label htmlFor="wh-key">Short code</Label>
        <Input
          id="wh-key"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          placeholder="WEB"
          pattern="[A-Z][A-Z0-9]+"
          required
          aria-describedby="wh-key-hint"
        />
        <span className="ta-hint" id="wh-key-hint">
          Two letters or more. It prefixes every task in the project, like WEB-14.
        </span>
      </FormRow>
      {error && <FieldError>{error}</FieldError>}
      <Button type="submit" disabled={busy || !name.trim() || key.trim().length < 2}>
        {busy ? "Creating…" : "Create project"}
      </Button>
    </form>
  );
}

function CaptureFirstTask({
  slug,
  projectId,
  projectName,
  aiEnabled,
  hint,
}: {
  slug: string;
  projectId: string | null;
  projectName: string | null;
  aiEnabled: boolean;
  hint: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createTask(slug, { projectId, title: title.trim(), source: "quick_capture" });
      track({ name: "task.created", source: "workspace_home" });
      track({ name: "workspace.activation.first_task_created", source: "workspace_home" });
      setTitle("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ta-whome__form" aria-labelledby="ta-whome-cta">
      <h2 className="ta-whome__h2" id="ta-whome-cta">
        Add the first task
      </h2>
      <p className="ta-muted">{hint}</p>
      <form className="ta-quickadd" onSubmit={submit}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to happen?"
          aria-label="Task title"
        />
        <Button type="submit" disabled={busy || !title.trim() || !projectId}>
          {busy ? "Adding…" : "Add task"}
        </Button>
      </form>
      {/* Say where it lands (issue #366) — a capture form that quietly
          decides the destination teaches people not to trust it. */}
      <p className="ta-hint">
        {projectName
          ? `This goes into ${projectName}. Use Capture in the sidebar to choose somewhere else, or to park it in your Inbox.`
          : "Pick a project first, or use Capture in the sidebar to park this in your Inbox."}
      </p>
      {error && <FieldError>{error}</FieldError>}
      <p className="ta-whome__or">
        Or start from something you already wrote:{" "}
        {aiEnabled ? (
          <a href={copilotHref(slug, { intent: "extract_plan", from: "workspace_home_first_run" })}>
            paste meeting notes and review the tasks it drafts
          </a>
        ) : (
          <span className="ta-muted">Copilot is switched off for this workspace</span>
        )}{" "}
        · <a href={`/w/${slug}/imports`}>import a task list</a>
      </p>
    </div>
  );
}

/* ── returning users ────────────────────────────────────────────────── */

function Oriented({
  slug,
  stage,
  steps,
  progress,
  counts,
  projects,
  myNext,
  latestProposal,
  hint,
}: {
  slug: string;
  stage: ActivationStage;
  steps: ActivationStep[];
  progress: { done: number; total: number };
  counts: WorkspaceHomeData["counts"];
  projects: WorkspaceHomeData["projects"];
  myNext: WorkspaceHomeData["myNext"];
  latestProposal: WorkspaceHomeData["latestProposal"];
  hint: string;
}) {
  const incomplete = progress.done < progress.total;

  return (
    <>
      {stage === "no_assigned_work" && (
        <div className="ta-callout" role="note">
          <p>
            <strong>You have no assigned work yet.</strong> {hint}
          </p>
          <p className="ta-whome__ctarow">
            <a className="ta-link" href={`/w/${slug}/projects`}>
              Browse projects
            </a>{" "}
            ·{" "}
            <a className="ta-link" href={`/w/${slug}/inbox`}>
              Take something from the Inbox
            </a>{" "}
            ·{" "}
            {counts.aiEnabled ? (
              <a
                className="ta-link"
                href={copilotHref(slug, { intent: "extract_plan", from: "workspace_home_oriented" })}
              >
                Draft work from notes
              </a>
            ) : (
              <a className="ta-link" href={`/w/${slug}/imports`}>
                Import a task list
              </a>
            )}
          </p>
        </div>
      )}

      <h2 className="ta-whome__h2">Where things stand</h2>
      <div className="ta-metrics">
        <Stat label="My open work" value={counts.assignedOpenCount} href={`/w/${slug}/my-work`} hint="assigned to you" />
        <Stat label="Overdue" value={counts.overdueCount} href={`/w/${slug}/my-work`} hint="past their date" />
        <Stat label="Due today" value={counts.dueTodayCount} href={`/w/${slug}/my-work`} hint="yours, today" />
        <Stat label="Needs an owner" value={counts.unassignedCount} href={`/w/${slug}/inbox`} hint="waiting in Inbox" />
        <Stat label="Active projects" value={counts.projectCount} href={`/w/${slug}/projects`} hint="you can see" />
        {counts.aiEnabled && (
          <Stat
            label="AI drafts to review"
            value={counts.pendingProposalCount}
            href={`/w/${slug}/copilot`}
            hint="nothing applied yet"
          />
        )}
      </div>

      <div className="ta-whome__cols">
        <div>
          <h3 className="ta-whome__h3">Your next few</h3>
          {myNext.length === 0 ? (
            <p className="ta-muted">Nothing assigned to you is open right now.</p>
          ) : (
            <ul className="ta-list">
              {myNext.map((t) => (
                <li key={t.id}>
                  <span className="ta-list__title">
                    <span className="ta-key">{t.projectKey}</span> {t.title}
                  </span>
                  <span className="ta-list__due">
                    {t.dueDate ? formatDate(t.dueDate, "en") : "no date"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="ta-whome__ctarow">
            <a className="ta-link" href={`/w/${slug}/my-work`}>
              Open My Work
            </a>{" "}
            ·{" "}
            <a className="ta-link" href={`/w/${slug}/focus`}>
              Decide what is next in Focus
            </a>
          </p>
        </div>

        <div>
          <h3 className="ta-whome__h3">Projects</h3>
          {projects.length === 0 ? (
            <p className="ta-muted">No projects you can see yet.</p>
          ) : (
            <ul className="ta-list">
              {projects.map((p) => (
                <li key={p.id}>
                  <a className="ta-list__title" href={`/w/${slug}/projects/${p.key}`}>
                    <span className="ta-key">{p.key}</span> {p.name}
                  </a>
                  <span className="ta-list__due">{p.openCount} open</span>
                </li>
              ))}
            </ul>
          )}
          {counts.aiEnabled && latestProposal && (
            <p className="ta-muted ta-whome__note">
              Last AI draft: {proposalWords(latestProposal.state)} ·{" "}
              {formatDate(latestProposal.at, "en")}
            </p>
          )}
        </div>
      </div>

      {incomplete && (
        <details className="ta-whome__details">
          <summary>
            Finish setting up — {progress.done} of {progress.total} steps done
          </summary>
          <Workflow steps={steps} progress={progress} />
        </details>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: number;
  href: string;
  hint: string;
}) {
  return (
    <a className="ta-metric ta-metric--link" href={href}>
      <span className="ta-metric__label">{label}</span>
      <span className="ta-metric__value">{value}</span>
      <span className="ta-metric__hint">{hint}</span>
    </a>
  );
}

function proposalWords(state: string): string {
  switch (state) {
    case "applied":
      return "you accepted it";
    case "partially_applied":
      return "you accepted part of it";
    case "rejected":
      return "you turned it down";
    case "undone":
      return "you undid it";
    default:
      return "waiting for your review";
  }
}

/* ── shared ─────────────────────────────────────────────────────────── */

function Workflow({
  steps,
  progress,
}: {
  steps: ActivationStep[];
  progress: { done: number; total: number };
}) {
  return (
    <section className="ta-whome__flow" aria-labelledby="ta-whome-flow">
      <h2 className="ta-whome__h2" id="ta-whome-flow">
        How the work flows
      </h2>
      <p className="ta-muted">
        {progress.done} of {progress.total} done
      </p>
      <ol className="ta-whome__steps">
        {steps.map((s, i) => (
          <li key={s.id} data-state={s.state}>
            <span className="ta-whome__stepno" aria-hidden="true">
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span className="ta-whome__steptext">
              <strong>
                {s.title}
                <span className="ta-whome__stepstate"> — {stateWords(s.state)}</span>
              </strong>
              <span>{s.description}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function stateWords(state: ActivationStep["state"]): string {
  if (state === "done") return "done";
  if (state === "current") return "do this next";
  return "later";
}
