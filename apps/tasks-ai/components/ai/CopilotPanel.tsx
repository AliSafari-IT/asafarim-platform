"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FieldError, Input, Select, Textarea } from "@asafarim/ui";
import { api, ClientApiError, type AiOperation, type ProposalRow } from "../../lib/client/api";
import { track } from "../../lib/client/telemetry";
import {
  COPILOT_INTENTS,
  DEFAULT_INTENT_ID,
  FIRST_USE_CALLOUT,
  FIRST_USE_STORAGE_KEY,
  GENERATE_EXPECTATION,
  MIN_SOURCE_LENGTH,
  TARGET_REF,
  copilotSteps,
  destinationState,
  generateBlock,
  impactCounts,
  inboxLandingCount,
  intentFor,
  kindForIntent,
  postApplyOutcome,
  providerNotice,
  type CopilotIntentId,
  type CopilotStep,
  type PostApplyAction,
  type PostApplyActionId,
} from "../../lib/ai/workflow";
import { ProposalDiff } from "./ProposalDiff";

export interface CopilotProject {
  id: string;
  key: string;
  name: string;
}

/**
 * The guided intent-to-plan workflow (issue #368).
 *
 * Paste what you already have → say what you want out of it → choose where
 * it would land → read a proposal that distinguishes your words from the
 * model's guesses → approve all, part, or none → land in the work that was
 * created. Every decision about *what to show* lives in lib/ai/workflow.ts;
 * this component is the layout, the network calls and the instrumentation.
 *
 * The safety model is unchanged and non-negotiable: generating writes
 * nothing to the workspace, and applying happens only after an explicit
 * confirmation of a plain-language impact sentence.
 */
export function CopilotPanel({
  slug,
  projects,
  canCreateProject,
  initialIntent,
  initialSource = "",
  taskContext = null,
  openedFrom = "nav",
  /** True when this workspace has never produced an AI draft (issue #365). */
  firstProposal = false,
  /** True when this workspace has never applied one. */
  firstApply = false,
}: {
  slug: string;
  projects: CopilotProject[];
  canCreateProject: boolean;
  initialIntent?: string | null;
  initialSource?: string;
  taskContext?: { id: string; title: string } | null;
  openedFrom?: string;
  firstProposal?: boolean;
  firstApply?: boolean;
}) {
  const router = useRouter();
  const activation = useRef({ generated: firstProposal, applied: firstApply });

  const [intentId, setIntentId] = useState<CopilotIntentId>(intentFor(initialIntent).id);
  const [projectList, setProjectList] = useState<CopilotProject[]>(projects);
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");
  const [source, setSource] = useState(initialSource);
  const [proposal, setProposal] = useState<ProposalRow | null>(null);
  // The retrieved-context entities the draft could cite via citation.source
  // (issue #232), so ProposalDiff can render a title next to an evidence id
  // instead of a bare "task:cimr...".
  const [retrieved, setRetrieved] = useState<{ id: string; title: string }[]>([]);
  // Bumped on every generate. An identical prompt is served from the job
  // cache, which hands back the same proposal id — so the id alone cannot key
  // the review surface: React would keep the previous instance and with it
  // the ticks and inline edits the user made before pressing "Try again"
  // (PR #377 review).
  const [generation, setGeneration] = useState(0);
  // The task this draft is scoped to, captured when it was generated: the
  // intent radio can change afterwards, and the proposal on screen must keep
  // describing what it was actually drafted against.
  const [reviewedTarget, setReviewedTarget] = useState<string | null>(null);
  // The exact text the on-screen proposal was generated from. Editing the
  // textarea afterwards must not silently re-point the citations at text the
  // model never saw.
  const [reviewedSource, setReviewedSource] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{
    actions: PostApplyAction[];
    summary: string;
    projectKey: string;
    /** Kept so the feedback prompt can still name the proposal it rates. */
    proposalId: string;
  } | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [trustSeen, setTrustSeen] = useState(true);

  const intent = intentFor(intentId);
  const project = projectList.find((p) => p.id === projectId) ?? null;
  const destinationLabel = project ? `${project.key} · ${project.name}` : "the chosen project";

  const flow = useMemo(
    () => ({
      sourceLength: source.trim().length,
      projectId: projectId || null,
      projectCount: projectList.length,
      hasProposal: proposal !== null,
    }),
    [source, projectId, projectList.length, proposal],
  );
  const steps = copilotSteps(flow);
  const block = generateBlock(flow);
  const destination = destinationState({
    projectCount: projectList.length,
    projectId: projectId || null,
    canCreateProject,
  });

  // First-use education (issue #368). Read after mount so server and client
  // render the same markup; per browser, dismissible, never a tutorial.
  useEffect(() => {
    try {
      setTrustSeen(window.localStorage.getItem(FIRST_USE_STORAGE_KEY) === "1");
    } catch {
      setTrustSeen(false);
    }
  }, []);

  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    track({ name: "copilot.opened", from: openedFrom, intent: intentId });
  }, [openedFrom, intentId]);

  // Fires once, when the source first becomes usable — the step of the
  // funnel that separates "looked at Copilot" from "brought something to it".
  const sourceTracked = useRef(false);
  useEffect(() => {
    const chars = source.trim().length;
    if (sourceTracked.current || chars < MIN_SOURCE_LENGTH) return;
    sourceTracked.current = true;
    track({ name: "copilot.source_added", intent: intentId, chars });
  }, [source, intentId]);

  function dismissTrust() {
    setTrustSeen(true);
    try {
      window.localStorage.setItem(FIRST_USE_STORAGE_KEY, "1");
    } catch {
      /* a browser that refuses storage just shows the callout again */
    }
  }

  const generate = useCallback(async () => {
    const text = source.trim();
    // Task-scoped intents are about one existing task. Sending its id is what
    // lets the draft parent real subtasks under it and actually edit it —
    // without it the pipeline could only ever propose unrelated new work
    // (PR #377 review).
    const target = intentFor(intentId).aboutATask ? taskContext : null;
    setBusy(true);
    setStatus(null);
    setNotice(null);
    setProposal(null);
    setOutcome(null);
    try {
      const res = await api.runAiJob(slug, {
        kind: kindForIntent(intentId),
        input: text,
        projectId,
        ...(target ? { taskId: target.id } : {}),
      });
      setProposal(res.proposal);
      setRetrieved(res.retrieved ?? []);
      setGeneration((n) => n + 1);
      setReviewedTarget(target?.title ?? null);
      setReviewedSource(text);
      setNotice(providerNotice({ degraded: res.degraded }));
      track({
        name: "copilot.proposal_generated",
        intent: intentId,
        operations: res.proposal.operations.length,
        degraded: Boolean(res.degraded),
      });
      if (activation.current.generated) {
        activation.current.generated = false;
        track({ name: "workspace.activation.first_proposal_generated", kind: intentId });
      }
    } catch (err) {
      setStatus(
        err instanceof ClientApiError && err.code === "forbidden"
          ? "AI is switched off for this workspace, so nothing was generated. Everything else keeps working."
          : err instanceof ClientApiError && err.code === "rate_limited"
            ? "This workspace has used its monthly AI budget. Nothing was generated and nothing was charged."
            : err instanceof Error
              ? err.message
              : "Could not draft a proposal. Nothing was changed.",
      );
    } finally {
      setBusy(false);
    }
  }, [intentId, projectId, slug, source, taskContext]);

  async function apply(accept: number[], edited: AiOperation[]) {
    if (!proposal) return;
    setBusy(true);
    setStatus(null);
    try {
      const generated = proposal.operations;
      const editedChanged = JSON.stringify(generated) !== JSON.stringify(edited);
      await api.applyProposal(
        slug,
        proposal.id,
        { projectId, accept, ...(editedChanged ? { editedOperations: edited } : {}) },
        accept.length > 15 || editedChanged,
      );
      const total = edited.length;
      // What the server actually did, resolved the same way applyProposal
      // resolves it: a selected link whose endpoint was not selected creates
      // nothing, so it must not be reported as applied (PR #377 review).
      const externalRefs = reviewedTarget ? [TARGET_REF] : [];
      const counts = impactCounts(edited, accept, { externalRefs });
      const partial = accept.length < total;
      track(
        partial
          ? {
              name: "copilot.proposal_partially_applied",
              accepted: accept.length,
              total,
              edited: editedChanged,
            }
          : {
              name: "copilot.proposal_applied",
              accepted: accept.length,
              total,
              edited: editedChanged,
            },
      );
      if (activation.current.applied) {
        activation.current.applied = false;
        track({ name: "workspace.activation.first_proposal_applied", operations: accept.length });
      }
      const result = postApplyOutcome({
        accepted: counts.total,
        total,
        destinationLabel,
        inboxCount: inboxLandingCount(edited, accept, { externalRefs }),
      });
      setOutcome({
        summary: result.summary,
        actions: result.actions,
        projectKey: project?.key ?? "",
        proposalId: proposal.id,
      });
      setProposal(null);
      setShowFeedback(true);
      router.refresh();
    } catch (err) {
      setStatus(
        err instanceof Error
          ? `${err.message} Nothing was applied.`
          : "Apply failed. Nothing was applied.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reject(reason?: string) {
    if (!proposal) return;
    const operations = proposal.operations.length;
    await api.rejectProposal(slug, proposal.id, reason);
    await api.proposalFeedback(slug, proposal.id, { outcome: "rejected", correctionReason: reason });
    track({ name: "copilot.proposal_rejected", intent: intentId, operations });
    setProposal(null);
    setStatus("Turned down. Nothing was created and nothing in your workspace changed.");
  }

  function go(action: PostApplyActionId) {
    track({ name: "copilot.result_opened", target: action });
    if (action === "another") {
      setOutcome(null);
      setSource("");
      setStatus(null);
      setNotice(null);
      sourceTracked.current = false;
      return;
    }
    const href =
      action === "open_inbox"
        ? `/w/${slug}/inbox`
        : action === "my_work"
          ? `/w/${slug}/my-work`
          : `/w/${slug}/projects/${outcome?.projectKey ?? ""}`;
    router.push(href);
  }

  return (
    <section className="ta-tw ta-copilot">
      <header className="ta-tw__head">
        <h1>Turn what you already wrote into work</h1>
      </header>
      <p className="ta-muted">
        Paste notes, a brief, or a thread. TasksAI drafts a proposal you can read, edit and approve
        line by line. You stay the author — nothing reaches your workspace until you say so.
      </p>

      {!trustSeen && (
        <div className="ta-callout ta-copilot__trust" role="note">
          <p>
            <strong>{FIRST_USE_CALLOUT.title}</strong>
          </p>
          <p>{FIRST_USE_CALLOUT.body}</p>
          <Button size="sm" variant="secondary" onClick={dismissTrust}>
            Got it
          </Button>
        </div>
      )}

      <Steps steps={steps} />

      {outcome ? (
        <Result outcome={outcome} onGo={go} />
      ) : (
        <div className="ta-copilot__layout" data-review={proposal !== null}>
          <div className="ta-copilot__compose">
            {/* 1 — source */}
            <section aria-labelledby="ta-cp-source">
              <h2 className="ta-copilot__h2" id="ta-cp-source">
                1. Paste what you already have
              </h2>
              <p className="ta-hint">{intent.sourceHint}</p>
              {taskContext && (
                <p className="ta-hint">
                  Started from <strong>{taskContext.title}</strong>. Edit the text below to add
                  anything the task does not say.
                </p>
              )}
              <Textarea
                rows={proposal ? 10 : 8}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Kickoff call notes, a client brief, a transcript…"
                aria-label="Source text"
                aria-describedby="ta-cp-source-count"
              />
              <p className="ta-hint" id="ta-cp-source-count">
                {source.trim().length} characters.
              </p>
              {source.trim().length === 0 && (
                <div className="ta-copilot__examples">
                  <p className="ta-hint">Nothing to hand? Start from one of these:</p>
                  <ul>
                    {intent.examples.map((ex, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => setSource(ex)}>
                          {ex}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* 2 — intended outcome */}
            <section aria-labelledby="ta-cp-outcome">
              <h2 className="ta-copilot__h2" id="ta-cp-outcome">
                2. What do you want out of it?
              </h2>
              <fieldset className="ta-copilot__intents">
                <legend className="ta-sr-only">Intended outcome</legend>
                {COPILOT_INTENTS.map((option) => (
                  <label key={option.id} data-on={option.id === intentId}>
                    <input
                      type="radio"
                      name="ta-copilot-intent"
                      value={option.id}
                      checked={option.id === intentId}
                      onChange={() => setIntentId(option.id)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <span className="ta-hint">{option.outcome}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {intent.aboutATask && !taskContext && (
                <p className="ta-hint">
                  This one is about a specific task. You can also start it from the task itself —
                  open a task and use “Ask Copilot”.
                </p>
              )}
            </section>

            {/* 3 — destination */}
            <section aria-labelledby="ta-cp-dest">
              <h2 className="ta-copilot__h2" id="ta-cp-dest">
                3. {destination.title}
              </h2>
              <p className="ta-hint">{destination.description}</p>
              {destination.kind === "no_projects_can_create" ? (
                <CreateDestination
                  slug={slug}
                  onCreated={(created) => {
                    setProjectList((cur) => [...cur, created]);
                    setProjectId(created.id);
                  }}
                />
              ) : destination.kind === "no_projects_read_only" ? (
                <p className="ta-hint">
                  <a className="ta-link" href={`/w/${slug}/projects`}>
                    See the projects you can reach
                  </a>
                </p>
              ) : (
                <label className="ta-copilot__field">
                  <span>Project</span>
                  <Select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    options={[
                      ...(projectId ? [] : [{ value: "", label: "Choose a project…" }]),
                      ...projectList.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` })),
                    ]}
                  />
                </label>
              )}
            </section>

            {/* 4 — generate */}
            <section aria-labelledby="ta-cp-generate">
              <h2 className="ta-copilot__h2" id="ta-cp-generate">
                4. Draft a proposal
              </h2>
              <p className="ta-hint">{GENERATE_EXPECTATION}</p>
              <Button onClick={generate} disabled={busy || block !== null}>
                {busy ? "Drafting…" : proposal ? "Draft again" : "Draft a proposal"}
              </Button>
              {block && (
                <p className="ta-hint ta-copilot__block" role="note">
                  {block.message}
                </p>
              )}
            </section>

            {notice && (
              <p className="ta-copilot__status ta-copilot__degraded" role="status">
                {notice}
              </p>
            )}
            {status && (
              <p className="ta-copilot__status" role="status">
                {status}
              </p>
            )}
          </div>

          {proposal && (
            <div className="ta-copilot__review">
              <ProposalDiff
                // Regenerating must hand back a review surface with no
                // memory of the last one. The proposal id is not enough:
                // an identical prompt is served from the job cache and
                // repeats the id, so the generation counter is what
                // guarantees a fresh component (PR #377 review).
                key={`${proposal.id}:${generation}`}
                proposal={proposal}
                source={reviewedSource}
                destinationLabel={destinationLabel}
                targetTaskTitle={reviewedTarget}
                retrieved={retrieved}
                busy={busy}
                onApply={apply}
                onReject={reject}
                onRegenerate={generate}
                onReviewed={() =>
                  track({
                    name: "copilot.proposal_reviewed",
                    intent: intentId,
                    operations: proposal.operations.length,
                    assumptions: proposal.operations.filter(
                      (op) => !op.citations.some((c) => c.span !== null && !c.assumption),
                    ).length,
                  })
                }
              />
            </div>
          )}
        </div>
      )}

      {showFeedback && outcome && (
        <FeedbackPrompt
          onSubmit={async (trust, timeSavedMin) => {
            await api.proposalFeedback(slug, outcome.proposalId, {
              outcome: "accepted",
              trust,
              timeSavedMin,
            });
            setShowFeedback(false);
          }}
        />
      )}
    </section>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────── */

function Steps({ steps }: { steps: CopilotStep[] }) {
  return (
    <ol className="ta-copilot__steps" aria-label="How this works">
      {steps.map((s, i) => (
        <li key={s.id} data-state={s.state}>
          <span className="ta-copilot__stepno" aria-hidden="true">
            {s.state === "done" ? "✓" : i + 1}
          </span>
          <span className="ta-copilot__steptext">
            <strong>{s.title}</strong>
            <span>{s.description}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Same shape the API enforces; mirrored so bad keys never leave the page. */
const PROJECT_KEY_RE = /^[A-Z][A-Z0-9]+$/;

function CreateDestination({
  slug,
  onCreated,
}: {
  slug: string;
  onCreated: (p: CopilotProject) => void;
}) {
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
      const created = await api.createProject(slug, { name: name.trim(), key: trimmedKey });
      track({ name: "project.created" });
      track({ name: "workspace.activation.project_created", from: "copilot" });
      onCreated({ id: created.id, key: created.key, name: created.name });
    } catch (err) {
      setError(
        err instanceof ClientApiError && err.code === "conflict_unique"
          ? "That short code is already used in this workspace. Try another."
          : err instanceof Error
            ? err.message
            : "Could not create the project.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ta-copilot__destform" onSubmit={submit} noValidate>
      <label className="ta-copilot__field">
        <span>Project name</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Website relaunch" />
      </label>
      <label className="ta-copilot__field">
        <span>Short code</span>
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          placeholder="WEB"
          pattern="[A-Z][A-Z0-9]+"
        />
      </label>
      {error && <FieldError>{error}</FieldError>}
      <Button type="submit" size="sm" disabled={busy || !name.trim() || key.trim().length < 2}>
        {busy ? "Creating…" : "Create project"}
      </Button>
      <p className="ta-hint">
        Creating a project is a normal action you are taking yourself — it is not part of any AI
        proposal, and your pasted text stays exactly where it is.
      </p>
    </form>
  );
}

function Result({
  outcome,
  onGo,
}: {
  outcome: { summary: string; actions: PostApplyAction[]; projectKey: string };
  onGo: (id: PostApplyActionId) => void;
}) {
  return (
    <section className="ta-copilot__result" aria-labelledby="ta-cp-result">
      <h2 className="ta-copilot__h2" id="ta-cp-result">
        Done — here is what happened
      </h2>
      <p role="status">{outcome.summary}</p>
      <ul className="ta-copilot__next">
        {outcome.actions.map((a) => (
          <li key={a.id}>
            <Button size="sm" variant={a.id === "open_inbox" ? "primary" : "secondary"} onClick={() => onGo(a.id)}>
              {a.label}
            </Button>
            <span className="ta-hint">{a.description}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FeedbackPrompt({ onSubmit }: { onSubmit: (trust: number, min: number) => void }) {
  const [trust, setTrust] = useState(4);
  const [min, setMin] = useState(10);
  return (
    <div className="ta-copilot__feedback">
      <p>Quick feedback — helps tune the copilot.</p>
      <label>
        Trust (1–5)
        <input type="range" min={1} max={5} value={trust} onChange={(e) => setTrust(+e.target.value)} />
        <output>{trust}</output>
      </label>
      <label>
        Minutes saved
        <input type="number" min={0} max={600} value={min} onChange={(e) => setMin(+e.target.value)} />
      </label>
      <Button size="sm" onClick={() => onSubmit(trust, min)}>
        Send
      </Button>
    </div>
  );
}
