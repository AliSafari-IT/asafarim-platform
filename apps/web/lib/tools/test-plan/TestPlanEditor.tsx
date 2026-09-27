"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Badge, Button } from "@asafarim/ui";
import { ProvenanceBadge } from "../../../components/tools/ProvenanceBadge";
import { ToolExport } from "../../../components/tools/ToolExport";
import { ToolHandoff } from "../../../components/tools/ToolHandoff";
import { testPlanHandoff } from "../handoff";
import { useResultTracking } from "../use-edit-tracker";
import { applyScenarioEdit, draftFrom, type ScenarioDraft } from "./edit";
import { EXPORT_NOTICE, plannedCounts, toExportJson, toMarkdown, type EditableScenario, type ScenarioOrigin } from "./export";
import { CATEGORY_LABELS, PRIORITIES, TEST_CATEGORIES, type TestPlan } from "./schema";
import styles from "./testPlan.module.css";

const ORIGIN_LABEL: Record<ScenarioOrigin, string> = {
  ai: "AI draft",
  example: "Example",
  fixture: "Sample (no AI)",
  edited: "Edited by you",
};

const QUESTION_LABEL = { ambiguity: "Ambiguous", contradiction: "Contradiction", missing: "Missing" } as const;

/**
 * Review, edit, select, and export a generated test plan. All state is local
 * to the browser; nothing here is saved or sent anywhere.
 */
export function TestPlanEditor({ plan, origin }: { plan: TestPlan; origin: ScenarioOrigin }) {
  const [scenarios, setScenarios] = useState<EditableScenario[]>(() => initial(plan, origin));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(plan.scenarios.map((s) => s.id)));
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const baseId = useId();
  const track = useResultTracking("requirements-to-test-plan");

  // A new run replaces the plan: start review over.
  useEffect(() => {
    setScenarios(initial(plan, origin));
    setSelected(new Set(plan.scenarios.map((s) => s.id)));
    setRemoved(new Set());
    setEditing(null);
  }, [plan, origin]);

  const sources = useMemo(() => new Map(plan.sources.map((s) => [s.id, s])), [plan.sources]);
  const active = scenarios.filter((s) => !removed.has(s.id));
  const chosen = active.filter((s) => selected.has(s.id));
  const counts = plannedCounts(chosen);
  const srcAnchor = (id: string) => `${baseId}-src-${id}`;

  const toggle = (id: string) => {
    track.edited("select");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const remove = (id: string) => {
    track.edited("remove");
    const index = active.findIndex((s) => s.id === id);
    setRemoved((prev) => new Set(prev).add(id));
    setAnnouncement(`${id} removed. You can restore it from the removed list.`);
    // Move focus to the next scenario's heading, or the list heading.
    const next = active[index + 1] ?? active[index - 1];
    requestAnimationFrame(() => {
      const target = next ? document.getElementById(`${baseId}-${next.id}`) : listHeadingRef.current;
      target?.focus();
    });
  };

  const restore = (id: string) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setAnnouncement(`${id} restored.`);
  };

  const save = (updated: EditableScenario) => {
    track.edited("edit");
    setScenarios((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditing(null);
    setAnnouncement(`${updated.id} saved.`);
  };

  const exportPlan = { ...plan };

  return (
    <div className={styles.editor}>
      <p className={styles.notice}>
        <strong>Planning help, not test results.</strong> {EXPORT_NOTICE.replace(/^Planning assistance only: /, "")} Review every
        scenario before you rely on it.
      </p>

      <section aria-labelledby={`${baseId}-summary`}>
        <h3 id={`${baseId}-summary`}>{plan.title}</h3>
        <p>{plan.summary}</p>
        {plan.actors.length || plan.goals.length ? (
          <dl className={styles.meta}>
            {plan.actors.length ? (
              <>
                <dt>Actors</dt>
                <dd>{plan.actors.join(", ")}</dd>
              </>
            ) : null}
            {plan.goals.length ? (
              <>
                <dt>Goals</dt>
                <dd>{plan.goals.join("; ")}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </section>

      {plan.questions.length ? (
        <section aria-labelledby={`${baseId}-questions`} className={styles.block}>
          <h3 id={`${baseId}-questions`}>Open questions ({plan.questions.length})</h3>
          <p className={styles.hint}>Things your requirement leaves vague, missing, or contradictory. Answer these before trusting the plan.</p>
          <ul className={styles.questions}>
            {plan.questions.map((q) => (
              <li key={q.id}>
                <span className={styles.qid}>{q.id}</span> <Badge tone={q.kind === "contradiction" ? "danger" : "warning"}>{QUESTION_LABEL[q.kind]}</Badge>{" "}
                {q.question} <SourceRefs ids={q.sourceIds} anchor={srcAnchor} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby={`${baseId}-coverage`} className={styles.block}>
        <h3 id={`${baseId}-coverage`}>Planned scenarios by category</h3>
        <table className={styles.coverage}>
          <caption className={styles.hint}>Counts of selected scenarios. Planned only; nothing has been run.</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Planned</th>
            </tr>
          </thead>
          <tbody>
            {TEST_CATEGORIES.map((c) => (
              <tr key={c} className={counts[c] ? undefined : styles.zero}>
                <th scope="row">{CATEGORY_LABELS[c]}</th>
                <td>{counts[c] || "none"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby={`${baseId}-scenarios`} className={styles.block}>
        <div className={styles.listHeader}>
          <h3 id={`${baseId}-scenarios`} ref={listHeadingRef} tabIndex={-1}>
            Scenarios ({chosen.length} of {active.length} selected)
          </h3>
          <div className={styles.actions}>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set(active.map((s) => s.id)))}>
              Select all
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Select none
            </Button>
          </div>
        </div>

        <ol className={styles.scenarios}>
          {active.map((s) => (
            <li key={s.id} className={styles.scenario} data-selected={selected.has(s.id)}>
              {editing === s.id ? (
                <ScenarioForm scenario={s} onSave={save} onCancel={() => setEditing(null)} returnFocusTo={`${baseId}-edit-${s.id}`} />
              ) : (
                <ScenarioView
                  scenario={s}
                  headingId={`${baseId}-${s.id}`}
                  editButtonId={`${baseId}-edit-${s.id}`}
                  selected={selected.has(s.id)}
                  onToggle={() => toggle(s.id)}
                  onEdit={() => setEditing(s.id)}
                  onRemove={() => remove(s.id)}
                  sources={sources}
                  anchor={srcAnchor}
                />
              )}
            </li>
          ))}
        </ol>

        {removed.size ? (
          <div className={styles.removed}>
            <h4>Removed ({removed.size})</h4>
            <ul>
              {scenarios
                .filter((s) => removed.has(s.id))
                .map((s) => (
                  <li key={s.id}>
                    {s.id} — {s.title}{" "}
                    <Button type="button" size="sm" variant="ghost" onClick={() => restore(s.id)}>
                      Restore<span className={styles.srOnly}> {s.id}</span>
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section aria-labelledby={`${baseId}-export`} className={styles.block}>
        <h3 id={`${baseId}-export`}>Export</h3>
        {chosen.length ? (
          <>
            <p className={styles.hint}>
              Exports the {chosen.length} selected scenario{chosen.length === 1 ? "" : "s"}, the open questions, and your source text. Files are created in
              your browser; nothing is uploaded.
            </p>
            <ToolExport
              filenameBase={slugify(plan.title)}
              json={toExportJson(exportPlan, chosen)}
              markdown={toMarkdown(exportPlan, chosen)}
              onExport={track.exported}
            />
            <ToolHandoff
              destination="testora"
              what={`the ${chosen.length} selected scenario${chosen.length === 1 ? "" : "s"}, which arrive in Testora as pending scaffolds to automate`}
              build={() => testPlanHandoff(exportPlan, chosen)}
            />
          </>
        ) : (
          <p className={styles.hint}>Select at least one scenario to export.</p>
        )}
      </section>

      <section aria-labelledby={`${baseId}-sources`} className={styles.block}>
        <h3 id={`${baseId}-sources`}>Your requirement, as numbered sources</h3>
        <ol className={styles.sources}>
          {plan.sources.map((src) => (
            <li key={src.id} id={srcAnchor(src.id)} tabIndex={-1}>
              <span className={styles.qid}>{src.id}</span> {src.text}
              {src.field === "acceptanceCriteria" ? <span className={styles.hint}> (acceptance criterion)</span> : null}
            </li>
          ))}
        </ol>
      </section>

      <p className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

function ScenarioView({
  scenario: s,
  headingId,
  editButtonId,
  selected,
  onToggle,
  onEdit,
  onRemove,
  sources,
  anchor,
}: {
  scenario: EditableScenario;
  headingId: string;
  editButtonId: string;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
  sources: Map<string, { id: string; text: string }>;
  anchor: (id: string) => string;
}) {
  const checkboxId = `${headingId}-include`;
  return (
    <article aria-labelledby={headingId}>
      <div className={styles.scenarioHead}>
        <input id={checkboxId} type="checkbox" checked={selected} onChange={onToggle} aria-describedby={headingId} />
        <label htmlFor={checkboxId} className={styles.srOnly}>
          Include {s.id} in export
        </label>
        <h4 id={headingId} tabIndex={-1}>
          <span className={styles.qid}>{s.id}</span> {s.title}
        </h4>
      </div>
      <p className={styles.badges}>
        <Badge tone="info">{CATEGORY_LABELS[s.category]}</Badge>
        <Badge tone={s.priority === "high" ? "danger" : s.priority === "medium" ? "warning" : "neutral"}>{s.priority} priority</Badge>
        {s.basis === "requirement" ? <ProvenanceBadge provenance="extracted" /> : <ProvenanceBadge provenance="inferred" />}
        <span className={styles.origin}>{ORIGIN_LABEL[s.origin]}</span>
      </p>

      {s.basis === "requirement" ? (
        <div className={styles.traces}>
          {s.sourceIds.map((id) => (
            <blockquote key={id}>
              <a href={`#${anchor(id)}`}>{id}</a> {sources.get(id)?.text}
            </blockquote>
          ))}
        </div>
      ) : (
        <p className={styles.assumption}>
          <strong>Assumption:</strong> {s.assumption}
          {s.sourceIds.length ? (
            <>
              {" "}
              Related: <SourceRefs ids={s.sourceIds} anchor={anchor} />
            </>
          ) : null}
        </p>
      )}

      {s.preconditions.length ? (
        <>
          <p className={styles.label}>Preconditions</p>
          <ul>
            {s.preconditions.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </>
      ) : null}
      <p className={styles.label}>Steps</p>
      <ol>
        {s.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <p className={styles.label}>Expected result</p>
      <p>{s.expected}</p>

      <div className={styles.actions}>
        <Button type="button" size="sm" variant="secondary" id={editButtonId} onClick={onEdit}>
          Edit<span className={styles.srOnly}> {s.id}</span>
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          Remove<span className={styles.srOnly}> {s.id}</span>
        </Button>
      </div>
    </article>
  );
}

function ScenarioForm({
  scenario,
  onSave,
  onCancel,
  returnFocusTo,
}: {
  scenario: EditableScenario;
  onSave: (s: EditableScenario) => void;
  onCancel: () => void;
  returnFocusTo: string;
}) {
  const [draft, setDraft] = useState<ScenarioDraft>(() => draftFrom(scenario));
  const [errors, setErrors] = useState<string[]>([]);
  const firstRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => firstRef.current?.focus(), []);

  const close = (fn: () => void) => {
    fn();
    requestAnimationFrame(() => document.getElementById(returnFocusTo)?.focus());
  };

  const submit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    const result = applyScenarioEdit(scenario, draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    close(() => onSave(result.scenario));
  };

  const field = (key: keyof typeof draft) => ({
    id: `${id}-${key}`,
    value: draft[key],
    onChange: (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  return (
    <form className={styles.form} onSubmit={submit} aria-label={`Edit ${scenario.id}`}>
      <p className={styles.qid}>Editing {scenario.id}</p>
      {errors.length ? (
        <ul className={styles.errors} role="alert">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}
      <label htmlFor={`${id}-title`}>Title</label>
      <input ref={firstRef} {...field("title")} maxLength={300} />
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor={`${id}-category`}>Category</label>
          <select {...field("category")}>
            {TEST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-priority`}>Priority</label>
          <select {...field("priority")}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      {scenario.basis === "inferred" ? (
        <>
          <label htmlFor={`${id}-assumption`}>Assumption</label>
          <textarea {...field("assumption")} rows={2} maxLength={300} />
        </>
      ) : null}
      <label htmlFor={`${id}-preconditions`}>Preconditions (one per line)</label>
      <textarea {...field("preconditions")} rows={3} />
      <label htmlFor={`${id}-steps`}>Steps (one per line)</label>
      <textarea {...field("steps")} rows={5} />
      <label htmlFor={`${id}-expected`}>Expected result</label>
      <textarea {...field("expected")} rows={3} maxLength={1000} />
      <div className={styles.actions}>
        <Button type="submit" size="sm">
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => close(onCancel)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SourceRefs({ ids, anchor }: { ids: string[]; anchor: (id: string) => string }) {
  if (!ids.length) return null;
  return (
    <span className={styles.refs}>
      (
      {ids.map((id, i) => (
        <span key={id}>
          {i ? ", " : ""}
          <a href={`#${anchor(id)}`}>{id}</a>
        </span>
      ))}
      )
    </span>
  );
}

function initial(plan: TestPlan, origin: ScenarioOrigin): EditableScenario[] {
  return plan.scenarios.map((s) => ({ ...s, origin }));
}

function slugify(text: string): string {
  return (
    "test-plan-" +
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50)
  );
}
