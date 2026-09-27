"use client";

import { useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { Badge, Button } from "@asafarim/ui";
import { ToolExport } from "../../../components/tools/ToolExport";
import { ToolHandoff } from "../../../components/tools/ToolHandoff";
import { actionPlanHandoff } from "../handoff";
import { useResultTracking } from "../use-edit-tracker";
import { EXPORT_NOTICE, ORIGIN_LABEL, exportSelection, toExportJson, toMarkdown } from "./export";
import {
  addDependencyError,
  applyTaskEdit,
  draftFrom,
  initialReview,
  reviewReducer,
  type EditableTask,
  type ItemOrigin,
  type TaskDraft,
} from "./plan-state";
import { BASIS_LABELS, EFFORT_UNITS, type ActionPlan, type Basis, type SourceUnit } from "./schema";
import { FIELD_LABELS } from "./sources";
import styles from "./actionPlan.module.css";

/**
 * Review, edit, reorder, select, and export a generated action plan. All
 * state is local to the browser; nothing here is saved, scheduled, assigned,
 * or sent anywhere. Destructive edits can be undone for the session.
 */
export function ActionPlanEditor({ plan, origin }: { plan: ActionPlan; origin: ItemOrigin }) {
  const [review, dispatch] = useReducer(reviewReducer, undefined, () => initialReview(plan, origin));
  const [editing, setEditing] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");
  const [edgeError, setEdgeError] = useState<string | null>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const baseId = useId();
  const track = useResultTracking("notes-to-action-plan");

  // A new run replaces the plan: start review over (undo never crosses runs).
  useEffect(() => {
    dispatch({ type: "reset", state: initialReview(plan, origin) });
    setEditing(null);
    setEdgeError(null);
  }, [plan, origin]);

  const sources = useMemo(() => new Map(plan.sources.map((s) => [s.id, s])), [plan.sources]);
  const selected = new Set(review.selected);
  const taskTitle = new Map(review.tasks.map((t) => [t.id, t.title]));
  const removedTasks = plan.tasks.filter((t) => !taskTitle.has(t.id));
  const { omitted } = exportSelection(plan, review);
  const srcAnchor = (id: string) => `${baseId}-src-${id}`;
  const headingId = (id: string) => `${baseId}-${id}`;

  const remove = (task: EditableTask) => {
    const index = review.tasks.findIndex((t) => t.id === task.id);
    const edges = review.dependencies.filter((d) => d.from === task.id || d.to === task.id).length;
    dispatch({ type: "remove-task", id: task.id });
    track.edited("remove");
    setAnnouncement(`${task.id} removed${edges ? `, with its ${edges} dependency link${edges === 1 ? "" : "s"}` : ""}. Use Undo to bring it back.`);
    const next = review.tasks[index + 1] ?? review.tasks[index - 1];
    requestAnimationFrame(() => (next ? document.getElementById(headingId(next.id)) : listHeadingRef.current)?.focus());
  };

  const move = (task: EditableTask, by: -1 | 1) => {
    const index = review.tasks.findIndex((t) => t.id === task.id);
    if (index + by < 0 || index + by >= review.tasks.length) return;
    dispatch({ type: "move", id: task.id, by });
    track.edited("reorder");
    setAnnouncement(`${task.id} moved to position ${index + by + 1} of ${review.tasks.length}.`);
    // Keep focus on the same button after the list re-renders.
    requestAnimationFrame(() => document.getElementById(`${baseId}-move-${by}-${task.id}`)?.focus());
  };

  const undo = () => {
    dispatch({ type: "undo" });
    track.edited("undo");
    setEditing(null);
    setAnnouncement("Last change undone.");
  };

  const addEdge = (e: { preventDefault(): void }) => {
    e.preventDefault();
    const error = !edgeFrom || !edgeTo ? "Pick both tasks." : addDependencyError(review, edgeFrom, edgeTo);
    setEdgeError(error);
    if (error) return;
    dispatch({ type: "add-dependency", from: edgeFrom, to: edgeTo });
    track.edited("dependency");
    setAnnouncement(`${edgeTo} now waits for ${edgeFrom}.`);
    setEdgeFrom("");
    setEdgeTo("");
  };

  return (
    <div className={styles.editor}>
        <p className={styles.notice}>
          <strong>A draft for you to review.</strong> Nobody has been assigned, no deadlines were added, and nothing has been scheduled or sent. Check
          each item&apos;s label: only &ldquo;From your text&rdquo; items quote what you wrote.
        </p>

        <section aria-labelledby={`${baseId}-summary`}>
          <h3 id={`${baseId}-summary`}>{plan.title}</h3>
          <dl className={styles.meta}>
            <dt>Objective</dt>
            <dd>{plan.objective}</dd>
            <dt>Scope</dt>
            <dd>{plan.scope}</dd>
          </dl>
        </section>

        {plan.decisions.length ? (
          <section aria-labelledby={`${baseId}-decisions`} className={styles.block}>
            <h3 id={`${baseId}-decisions`}>Decisions already made ({plan.decisions.length})</h3>
            <ul className={styles.plain}>
              {plan.decisions.map((d) => (
                <li key={d.id}>
                  <span className={styles.qid}>{d.id}</span> {d.decision} <Evidence item={d} sources={sources} anchor={srcAnchor} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby={`${baseId}-tasks`} className={styles.block}>
          <div className={styles.listHeader}>
            <h3 id={`${baseId}-tasks`} ref={listHeadingRef} tabIndex={-1}>
              Tasks ({review.selected.length} of {review.tasks.length} selected)
            </h3>
            <div className={styles.actions}>
              <Button type="button" size="sm" variant="secondary" onClick={undo} disabled={!review.history.length}>
                Undo{review.history.length ? ` (${review.history.length})` : ""}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => dispatch({ type: "select-all" })}>
                Select all
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => dispatch({ type: "select-none" })}>
                Select none
              </Button>
            </div>
          </div>
          <p className={styles.hint}>In suggested order. Move, edit, or remove tasks; removing a task also removes the links to it. Undo works until you leave the page.</p>

          <ol className={styles.tasks}>
            {review.tasks.map((t, i) => (
              <li key={t.id} className={styles.task} data-selected={selected.has(t.id)}>
                {editing === t.id ? (
                  <TaskForm
                    task={t}
                    onSave={(task) => {
                      dispatch({ type: "save-task", task });
                      track.edited("edit");
                      setEditing(null);
                      setAnnouncement(`${task.id} saved.`);
                    }}
                    onCancel={() => setEditing(null)}
                    returnFocusTo={`${baseId}-edit-${t.id}`}
                  />
                ) : (
                  <article aria-labelledby={headingId(t.id)}>
                    <div className={styles.taskHead}>
                      <input
                        id={`${headingId(t.id)}-include`}
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => {
                          dispatch({ type: "toggle", id: t.id });
                          track.edited("select");
                        }}
                        aria-describedby={headingId(t.id)}
                      />
                      <label htmlFor={`${headingId(t.id)}-include`} className={styles.srOnly}>
                        Include {t.id} in export
                      </label>
                      <h4 id={headingId(t.id)} tabIndex={-1}>
                        <span className={styles.qid}>{t.id}</span> {t.title}
                      </h4>
                    </div>
                    <p className={styles.badges}>
                      <BasisBadge basis={t.basis} />
                      {t.effort ? <Badge tone="neutral">{`Estimate: ${t.effort.low}–${t.effort.high} ${t.effort.unit}`}</Badge> : null}
                      <span className={styles.origin}>{ORIGIN_LABEL[t.origin]}</span>
                    </p>
                    {t.description ? <p>{t.description}</p> : null}
                    <Evidence item={t} sources={sources} anchor={srcAnchor} block />
                    <Waits
                      task={t}
                      review={review}
                      titles={taskTitle}
                      onRemove={(id) => {
                        dispatch({ type: "remove-dependency", id });
                        track.edited("dependency");
                        setAnnouncement(`Link ${id} removed. Use Undo to bring it back.`);
                      }}
                    />
                    <div className={styles.actions}>
                      <Button type="button" size="sm" variant="ghost" id={`${baseId}-move--1-${t.id}`} onClick={() => move(t, -1)} disabled={i === 0}>
                        Move up<span className={styles.srOnly}> {t.id}</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        id={`${baseId}-move-1-${t.id}`}
                        onClick={() => move(t, 1)}
                        disabled={i === review.tasks.length - 1}
                      >
                        Move down<span className={styles.srOnly}> {t.id}</span>
                      </Button>
                      <Button type="button" size="sm" variant="secondary" id={`${baseId}-edit-${t.id}`} onClick={() => setEditing(t.id)}>
                        Edit<span className={styles.srOnly}> {t.id}</span>
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => remove(t)}>
                        Remove<span className={styles.srOnly}> {t.id}</span>
                      </Button>
                    </div>
                  </article>
                )}
              </li>
            ))}
          </ol>

          {removedTasks.length ? (
            <p className={styles.hint}>
              Removed this session: {removedTasks.map((t) => t.id).join(", ")}. Use Undo to restore them in order.
            </p>
          ) : null}

          <form className={styles.edgeForm} onSubmit={addEdge} aria-labelledby={`${baseId}-add-edge`}>
            <h4 id={`${baseId}-add-edge`}>Add a dependency</h4>
            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor={`${baseId}-edge-to`}>This task…</label>
                <select id={`${baseId}-edge-to`} value={edgeTo} onChange={(e) => setEdgeTo(e.target.value)}>
                  <option value="">Choose a task</option>
                  {review.tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id} — {t.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor={`${baseId}-edge-from`}>…waits for</label>
                <select id={`${baseId}-edge-from`} value={edgeFrom} onChange={(e) => setEdgeFrom(e.target.value)}>
                  <option value="">Choose a task</option>
                  {review.tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id} — {t.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {edgeError ? (
              <p className={styles.error} role="alert">
                {edgeError}
              </p>
            ) : null}
            <div className={styles.actions}>
              <Button type="submit" size="sm" variant="secondary">
                Add dependency
              </Button>
            </div>
          </form>
        </section>

        {plan.milestones.length ? (
          <section aria-labelledby={`${baseId}-milestones`} className={styles.block}>
            <h3 id={`${baseId}-milestones`}>Possible milestones</h3>
            <p className={styles.hint}>Checkpoints made of tasks, not dates.</p>
            <ul className={styles.plain}>
              {plan.milestones.map((m) => (
                <li key={m.id}>
                  <span className={styles.qid}>{m.id}</span> <strong>{m.title}</strong>:{" "}
                  {m.taskIds.map((id, i) => (
                    <span key={id}>
                      {i ? ", " : ""}
                      {taskTitle.has(id) ? id : <s title="Removed">{id} (removed)</s>}
                    </span>
                  ))}{" "}
                  <BasisBadge basis={m.basis} /> <Evidence item={m} sources={sources} anchor={srcAnchor} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {plan.risks.length ? (
          <section aria-labelledby={`${baseId}-risks`} className={styles.block}>
            <h3 id={`${baseId}-risks`}>Risks ({plan.risks.length})</h3>
            <ul className={styles.plain}>
              {plan.risks.map((r) => (
                <li key={r.id}>
                  <span className={styles.qid}>{r.id}</span> {r.risk} <BasisBadge basis={r.basis} />
                  {r.mitigation ? (
                    <>
                      <br />
                      <span className={styles.hint}>Mitigation: {r.mitigation}</span>
                    </>
                  ) : null}{" "}
                  <Evidence item={r} sources={sources} anchor={srcAnchor} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {plan.questions.length ? (
          <section aria-labelledby={`${baseId}-questions`} className={styles.block}>
            <h3 id={`${baseId}-questions`}>Open questions ({plan.questions.length})</h3>
            <p className={styles.hint}>What your notes leave unanswered. Settle these before relying on the plan.</p>
            <ul className={styles.plain}>
              {plan.questions.map((q) => (
                <li key={q.id}>
                  <span className={styles.qid}>{q.id}</span> {q.question} <SourceRefs ids={q.sourceIds} anchor={srcAnchor} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby={`${baseId}-export`} className={styles.block}>
          <h3 id={`${baseId}-export`}>Export</h3>
          {review.selected.length ? (
            <>
              <p className={styles.hint}>
                Exports the {review.selected.length} selected task{review.selected.length === 1 ? "" : "s"} in your order, the links between them, and every
                label and quote. Files are created in your browser; nothing is uploaded.
              </p>
              {omitted.length ? (
                <ul className={styles.flags} aria-label="Left out of the export">
                  {omitted.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              ) : null}
              <ToolExport filenameBase={slugify(plan.title)} json={toExportJson(plan, review)} markdown={toMarkdown(plan, review)} onExport={track.exported} />
              <ToolHandoff
                destination="tasksai"
                what={`the ${review.selected.length} selected task${review.selected.length === 1 ? "" : "s"} and the links between them, with no assignees or due dates`}
                build={() => actionPlanHandoff(plan, review)}
              />
              <p className={styles.hint}>{EXPORT_NOTICE}</p>
            </>
          ) : (
            <p className={styles.hint}>Select at least one task to export.</p>
          )}
        </section>

        <section aria-labelledby={`${baseId}-sources`} className={styles.block}>
          <h3 id={`${baseId}-sources`}>Your text, as numbered sources</h3>
          <ol className={styles.sources}>
            {plan.sources.map((src) => (
              <li key={src.id} id={srcAnchor(src.id)} tabIndex={-1}>
                <span className={styles.qid}>{src.id}</span> {src.text}
                {src.field !== "notes" ? <span className={styles.hint}> ({FIELD_LABELS[src.field]})</span> : null}
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

/** Visible four-way provenance label. Text, not colour alone. */
export function BasisBadge({ basis }: { basis: Basis }) {
  const { label, description } = BASIS_LABELS[basis];
  return (
    <span className={`${styles.basis} ${styles[`basis-${basis}`]}`} title={description}>
      {label}
    </span>
  );
}

/** Quotes the cited source units, or states the assumption/reason. */
function Evidence({
  item,
  sources,
  anchor,
  block = false,
}: {
  item: { basis: Basis; sourceIds: string[]; rationale?: string };
  sources: Map<string, SourceUnit>;
  anchor: (id: string) => string;
  block?: boolean;
}) {
  if (item.basis === "inference" || item.basis === "recommendation") {
    return (
      <span className={block ? styles.rationale : styles.refs}>
        <strong>{item.basis === "inference" ? "Assumption:" : "Why:"}</strong> {item.rationale}
        {item.sourceIds.length ? (
          <>
            {" "}
            Related: <SourceRefs ids={item.sourceIds} anchor={anchor} />
          </>
        ) : null}
      </span>
    );
  }
  if (!block) return <SourceRefs ids={item.sourceIds} anchor={anchor} />;
  return (
    <div className={styles.traces}>
      {item.sourceIds.map((id) => (
        <blockquote key={id}>
          <a href={`#${anchor(id)}`}>{id}</a> {sources.get(id)?.text}
        </blockquote>
      ))}
    </div>
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

/** The dependencies a task waits for, each removable. */
function Waits({
  task,
  review,
  titles,
  onRemove,
}: {
  task: EditableTask;
  review: { dependencies: { id: string; from: string; to: string; reason: string; basis: Basis; origin: ItemOrigin }[] };
  titles: Map<string, string>;
  onRemove: (id: string) => void;
}) {
  const waits = review.dependencies.filter((d) => d.to === task.id);
  if (!waits.length) return null;
  return (
    <div>
      <p className={styles.label}>Waits for</p>
      <ul className={styles.waits}>
        {waits.map((d) => (
          <li key={d.id}>
            <span className={styles.qid}>{d.from}</span> {titles.get(d.from)} <span className={styles.hint}>— {d.reason}</span> <BasisBadge basis={d.basis} />{" "}
            <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(d.id)}>
              Remove link<span className={styles.srOnly}> {`${d.id}: ${task.id} waits for ${d.from}`}</span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskForm({
  task,
  onSave,
  onCancel,
  returnFocusTo,
}: {
  task: EditableTask;
  onSave: (t: EditableTask) => void;
  onCancel: () => void;
  returnFocusTo: string;
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => draftFrom(task));
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
    const result = applyTaskEdit(task, draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    close(() => onSave(result.task));
  };

  const field = (key: keyof TaskDraft) => ({
    id: `${id}-${key}`,
    value: draft[key],
    onChange: (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: e.target.value })),
  });
  const needsRationale = task.basis === "inference" || task.basis === "recommendation";

  return (
    <form className={styles.form} onSubmit={submit} aria-label={`Edit ${task.id}`}>
      <p className={styles.qid}>Editing {task.id}</p>
      {errors.length ? (
        <ul className={styles.errors} role="alert">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}
      <label htmlFor={`${id}-title`}>Title</label>
      <input ref={firstRef} {...field("title")} maxLength={300} />
      <label htmlFor={`${id}-description`}>Description</label>
      <textarea {...field("description")} rows={3} maxLength={1000} />
      {needsRationale ? (
        <>
          <label htmlFor={`${id}-rationale`}>{task.basis === "inference" ? "Assumption" : "Reason"}</label>
          <textarea {...field("rationale")} rows={2} maxLength={300} />
        </>
      ) : null}
      <fieldset className={styles.effort}>
        <legend>Effort estimate (optional)</legend>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor={`${id}-effortLow`}>From</label>
            <input {...field("effortLow")} inputMode="decimal" />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-effortHigh`}>To</label>
            <input {...field("effortHigh")} inputMode="decimal" />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-effortUnit`}>Unit</label>
            <select {...field("effortUnit")}>
              {EFFORT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>
      <p className={styles.hint}>The label ({BASIS_LABELS[task.basis].label}) and quoted evidence stay with the task when you edit it.</p>
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

function slugify(text: string): string {
  return (
    "action-plan-" +
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50)
  );
}
