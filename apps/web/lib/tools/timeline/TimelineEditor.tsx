"use client";

import { useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { Badge, Button } from "@asafarim/ui";
import { ToolExport } from "../../../components/tools/ToolExport";
import { ToolHandoff } from "../../../components/tools/ToolHandoff";
import { timelineHandoff } from "../handoff";
import { useResultTracking } from "../use-edit-tracker";
import {
  acceptedEvents,
  applyEventEdit,
  CONFLICT_STATUS_LABEL,
  describeWhen,
  eventDraft,
  EXPORT_NOTICE,
  initialTimelineReview,
  timelineReducer,
  toExportJson,
  toMarkdown,
  type ConflictStatus,
  type EventDraft,
  type EventOrigin,
  type ReviewEvent,
} from "./review";
import { CONFLICT_LABELS, PRECISION_LABELS, type CitedTimeline } from "./schema";
import styles from "./timeline.module.css";

const ORIGIN_LABEL: Record<EventOrigin, string> = { ai: "AI draft", example: "Example", fixture: "Sample (no AI)", edited: "Edited by you" };
const STATUS_LABEL = { accepted: "Accepted", rejected: "Rejected", pending: "Needs a decision" } as const;
const CONFLICT_CHOICES: { value: Exclude<ConflictStatus, "open">; label: string }[] = [
  { value: "unresolved", label: "Keep both claims: leave it unresolved on purpose" },
  { value: "corrected", label: "I've corrected it (edited or rejected events)" },
  { value: "dismissed", label: "Not a real conflict" },
];

/**
 * Review, correct, and preview a cited timeline, then export the accepted
 * events. All state is local to the browser: nothing is published or sent
 * to TimelineAI.
 */
export function TimelineEditor({ timeline, origin }: { timeline: CitedTimeline; origin: EventOrigin }) {
  const [review, dispatch] = useReducer(timelineReducer, undefined, () => initialTimelineReview(timeline, origin));
  const [editing, setEditing] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const baseId = useId();
  const track = useResultTracking("text-to-cited-timeline");

  useEffect(() => {
    dispatch({ type: "reset", state: initialTimelineReview(timeline, origin) });
    setEditing(null);
  }, [timeline, origin]);

  const sources = useMemo(() => new Map(timeline.sources.map((s) => [s.id, s.text])), [timeline.sources]);
  const byId = new Map(review.events.map((e) => [e.id, e]));
  const accepted = acceptedEvents(review);
  const pending = review.events.filter((e) => e.status === "pending").length;
  const openConflicts = review.conflicts.filter((c) => c.status === "open").length;
  const srcAnchor = (id: string) => `${baseId}-src-${id}`;
  const eventAnchor = (id: string) => `${baseId}-${id}`;

  const setStatus = (e: ReviewEvent, status: ReviewEvent["status"]) => {
    dispatch({ type: "set-status", id: e.id, status });
    track.edited("status");
    setAnnouncement(`${e.id} ${status === "accepted" ? "accepted" : status === "rejected" ? "rejected" : "marked as needing a decision"}.`);
  };
  const move = (e: ReviewEvent, by: -1 | 1) => {
    const index = review.events.findIndex((x) => x.id === e.id);
    if (index + by < 0 || index + by >= review.events.length) return;
    dispatch({ type: "move", id: e.id, by });
    track.edited("reorder");
    setAnnouncement(`${e.id} moved to position ${index + by + 1} of ${review.events.length}.`);
    requestAnimationFrame(() => document.getElementById(`${baseId}-move-${by}-${e.id}`)?.focus());
  };

  return (
    <div className={styles.editor}>
      <p className={styles.notice}>
        <strong>A draft for you to check.</strong> Each date keeps the precision your text gives it. Only accepted events are exported, and nothing is
        published or sent to TimelineAI unless you take the file there yourself.
      </p>

      <section aria-labelledby={`${baseId}-summary`}>
        <h3 id={`${baseId}-summary`}>{timeline.title}</h3>
        <p>{timeline.summary}</p>
        <p className={styles.hint}>
          {accepted.length} accepted · {pending} need a decision · {openConflicts} conflict{openConflicts === 1 ? "" : "s"} not reviewed
        </p>
      </section>

      {review.conflicts.length ? (
        <section aria-labelledby={`${baseId}-conflicts`} className={styles.block}>
          <h3 id={`${baseId}-conflicts`}>Conflicts to review ({review.conflicts.length})</h3>
          <p className={styles.hint}>Nothing here is resolved for you. Correct the events, dismiss the conflict, or keep both claims on purpose.</p>
          <ul className={styles.plain}>
            {review.conflicts.map((c) => (
              <li key={c.id} className={styles.conflict} data-status={c.status}>
                <p>
                  <span className={styles.qid}>{c.id}</span> <Badge tone={c.kind === "ambiguous_date" ? "warning" : "danger"}>{CONFLICT_LABELS[c.kind]}</Badge>{" "}
                  {c.description}
                </p>
                <p className={styles.hint}>
                  Events:{" "}
                  {c.eventIds.map((id, i) => (
                    <span key={id}>
                      {i ? ", " : ""}
                      <a href={`#${eventAnchor(id)}`}>{id}</a> ({byId.get(id) ? STATUS_LABEL[byId.get(id)!.status].toLowerCase() : "missing"})
                    </span>
                  ))}
                  {c.sourceIds.length ? <> · Sources: <Refs ids={c.sourceIds} anchor={srcAnchor} /></> : null}
                </p>
                <fieldset className={styles.choices}>
                  <legend>
                    Decision for {c.id}: <strong>{CONFLICT_STATUS_LABEL[c.status]}</strong>
                  </legend>
                  {CONFLICT_CHOICES.map((choice) => (
                    <label key={choice.value}>
                      <input
                        type="radio"
                        name={`${baseId}-conflict-${c.id}`}
                        value={choice.value}
                        checked={c.status === choice.value}
                        onChange={() => {
                          dispatch({ type: "set-conflict", id: c.id, status: choice.value });
                          track.edited("conflict");
                          setAnnouncement(`${c.id}: ${CONFLICT_STATUS_LABEL[choice.value]}.`);
                        }}
                      />{" "}
                      {choice.label}
                    </label>
                  ))}
                </fieldset>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby={`${baseId}-events`} className={styles.block}>
        <div className={styles.listHeader}>
          <h3 id={`${baseId}-events`}>
            Events ({accepted.length} of {review.events.length} accepted)
          </h3>
          <div className={styles.actions}>
            <Button type="button" size="sm" variant="ghost" onClick={() => dispatch({ type: "accept-all-cited" })} disabled={!review.events.some((e) => e.basis === "cited" && e.status === "pending")}>
              Accept all cited
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                dispatch({ type: "sort-by-date" });
                setAnnouncement("Events sorted by date. Undated events are last.");
              }}
            >
              Sort by date
            </Button>
          </div>
        </div>
        <p className={styles.hint}>Inferred events and events in a conflict start as &ldquo;needs a decision&rdquo;. Accept or reject each one.</p>

        <ol className={styles.events}>
          {review.events.map((e, i) => (
            <li key={e.id} className={styles.event} data-status={e.status}>
              {editing === e.id ? (
                <EventForm
                  event={e}
                  onSave={(event) => {
                    dispatch({ type: "save-event", event });
                    track.edited("edit");
                    setEditing(null);
                    setAnnouncement(`${event.id} saved.`);
                  }}
                  onCancel={() => setEditing(null)}
                  returnFocusTo={`${baseId}-edit-${e.id}`}
                />
              ) : (
                <article aria-labelledby={eventAnchor(e.id)}>
                  <p className={styles.date}>
                    {describeWhen(e)} <span className={styles.precision}>{PRECISION_LABELS[e.when.precision]}</span>
                    {e.dateEdited ? <span className={styles.hint}> · date edited by you</span> : null}
                  </p>
                  <h4 id={eventAnchor(e.id)} tabIndex={-1}>
                    <span className={styles.qid}>{e.id}</span> {e.title}
                  </h4>
                  <p className={styles.badges}>
                    <span className={`${styles.basis} ${e.basis === "cited" ? styles.cited : styles.inferred}`}>
                      {e.basis === "cited" ? "From your text" : "Uncited inference"}
                    </span>
                    <Badge tone={e.confidence === "high" ? "success" : e.confidence === "medium" ? "info" : "warning"}>{`${e.confidence} confidence`}</Badge>
                    <span className={styles.status} data-status={e.status}>
                      {STATUS_LABEL[e.status]}
                    </span>
                    <span className={styles.origin}>{ORIGIN_LABEL[e.origin]}</span>
                  </p>
                  {e.description ? <p>{e.description}</p> : null}
                  {e.sourceIds.map((id) => (
                    <blockquote key={id} className={styles.quote}>
                      <a href={`#${srcAnchor(id)}`}>{id}</a> {sources.get(id)}
                    </blockquote>
                  ))}
                  {e.uncertainty ? (
                    <p className={styles.uncertainty}>
                      <strong>Uncertainty:</strong> {e.uncertainty}
                    </p>
                  ) : null}
                  <div className={styles.actions} role="group" aria-label={`Decision for ${e.id}`}>
                    <Button type="button" size="sm" variant={e.status === "accepted" ? "primary" : "secondary"} aria-pressed={e.status === "accepted"} onClick={() => setStatus(e, "accepted")}>
                      Accept<span className={styles.srOnly}> {e.id}</span>
                    </Button>
                    <Button type="button" size="sm" variant={e.status === "rejected" ? "primary" : "secondary"} aria-pressed={e.status === "rejected"} onClick={() => setStatus(e, "rejected")}>
                      Reject<span className={styles.srOnly}> {e.id}</span>
                    </Button>
                    <Button type="button" size="sm" variant="ghost" id={`${baseId}-edit-${e.id}`} onClick={() => setEditing(e.id)}>
                      Edit<span className={styles.srOnly}> {e.id}</span>
                    </Button>
                    <Button type="button" size="sm" variant="ghost" id={`${baseId}-move--1-${e.id}`} onClick={() => move(e, -1)} disabled={i === 0}>
                      Move up<span className={styles.srOnly}> {e.id}</span>
                    </Button>
                    <Button type="button" size="sm" variant="ghost" id={`${baseId}-move-1-${e.id}`} onClick={() => move(e, 1)} disabled={i === review.events.length - 1}>
                      Move down<span className={styles.srOnly}> {e.id}</span>
                    </Button>
                  </div>
                </article>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby={`${baseId}-preview`} className={styles.block}>
        <h3 id={`${baseId}-preview`}>Preview</h3>
        <p className={styles.hint}>Accepted events, and those still needing a decision (dashed), in your order. Not published anywhere.</p>
        <ol className={styles.preview}>
          {review.events
            .filter((e) => e.status !== "rejected")
            .map((e) => (
              <li key={e.id} data-status={e.status}>
                <span className={styles.previewDate}>
                  {describeWhen(e)}
                  <span className={styles.srOnly}> ({PRECISION_LABELS[e.when.precision]})</span>
                </span>
                <span className={styles.previewTitle}>{e.title}</span>
                <span className={styles.hint}>
                  {e.basis === "cited" ? `Source: ${e.sourceIds.join(", ")}` : "Uncited inference"}
                  {e.dateEdited ? " · date edited by you" : ""}
                  {e.status === "pending" ? " · needs a decision" : ""}
                  {e.uncertainty ? " · uncertain" : ""}
                </span>
              </li>
            ))}
        </ol>
      </section>

      <section aria-labelledby={`${baseId}-export`} className={styles.block}>
        <h3 id={`${baseId}-export`}>Export</h3>
        {accepted.length ? (
          <>
            <p className={styles.hint}>
              Exports the {accepted.length} accepted event{accepted.length === 1 ? "" : "s"} with their sources, precision, uncertainty, and the conflicts that
              involve them. Files are created in your browser; nothing is uploaded.
            </p>
            <ToolExport filenameBase={slugify(timeline.title)} json={toExportJson(timeline, review)} markdown={toMarkdown(timeline, review)} onExport={track.exported} />
            <ToolHandoff
              destination="timelineai"
              what={`the ${accepted.length} accepted event${accepted.length === 1 ? "" : "s"}, each keeping its date precision and citation`}
              build={() => timelineHandoff(timeline, review)}
            />
            <p className={styles.hint}>{EXPORT_NOTICE}</p>
          </>
        ) : (
          <p className={styles.hint}>Accept at least one event to export.</p>
        )}
      </section>

      <section aria-labelledby={`${baseId}-sources`} className={styles.block}>
        <h3 id={`${baseId}-sources`}>Your text, as numbered sentences</h3>
        <ol className={styles.sources}>
          {timeline.sources.map((s) => (
            <li key={s.id} id={srcAnchor(s.id)} tabIndex={-1}>
              <span className={styles.qid}>{s.id}</span> {s.text}
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

function Refs({ ids, anchor }: { ids: string[]; anchor: (id: string) => string }) {
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i ? ", " : ""}
          <a href={`#${anchor(id)}`}>{id}</a>
        </span>
      ))}
    </>
  );
}

function EventForm({ event, onSave, onCancel, returnFocusTo }: { event: ReviewEvent; onSave: (e: ReviewEvent) => void; onCancel: () => void; returnFocusTo: string }) {
  const [draft, setDraft] = useState<EventDraft>(() => eventDraft(event));
  const [errors, setErrors] = useState<string[]>([]);
  const firstRef = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => firstRef.current?.focus(), []);

  const close = (fn: () => void) => {
    fn();
    requestAnimationFrame(() => document.getElementById(returnFocusTo)?.focus());
  };
  const field = (key: keyof EventDraft) => ({
    id: `${id}-${key}`,
    value: draft[key],
    onChange: (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  return (
    <form
      className={styles.form}
      aria-label={`Edit ${event.id}`}
      onSubmit={(e) => {
        e.preventDefault();
        const result = applyEventEdit(event, draft);
        if (!result.ok) return setErrors(result.errors);
        close(() => onSave(result.event));
      }}
    >
      <p className={styles.qid}>Editing {event.id}</p>
      {errors.length ? (
        <ul className={styles.errors} role="alert">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}
      <label htmlFor={`${id}-title`}>Title</label>
      <input ref={firstRef} {...field("title")} maxLength={200} />
      <label htmlFor={`${id}-dateText`}>Date, in words</label>
      <input {...field("dateText")} maxLength={120} aria-describedby={`${id}-date-hint`} />
      <span id={`${id}-date-hint`} className={styles.hint}>
        Write it as precisely as you know it: &ldquo;1924&rdquo;, &ldquo;June 1971&rdquo;, &ldquo;the 1920s&rdquo;, &ldquo;from 1998 to 2003&rdquo;. Leave empty if
        unknown. The precision is read from your words.
      </span>
      <label htmlFor={`${id}-description`}>Description</label>
      <textarea {...field("description")} rows={3} maxLength={1000} />
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
    "timeline-" +
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50)
  );
}
