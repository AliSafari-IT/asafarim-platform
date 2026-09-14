"use client";

import { useMemo, useRef, useState } from "react";
import { Button, ConfirmDialog } from "@asafarim/ui";
import type { AiOperation, ProposalRow } from "../../lib/client/api";
import {
  assumptionCount,
  defaultAcceptanceNotice,
  defaultAccepted,
  evidenceFor,
  evidenceText,
  impactCounts,
  impactSentence,
  inboxLandingCount,
  inboxLandingSentence,
} from "../../lib/ai/workflow";

/**
 * The proposal review surface (docs: M07, reworked for issue #368).
 *
 * Review is where the trust model is either honoured or quietly lost, so
 * this component answers four questions on screen: what would change, what
 * each change is based on, what the model could not work out, and what
 * applying would actually do. Every judgement it renders comes from the pure
 * model in lib/ai/workflow.ts — this file only lays it out.
 *
 * Nothing applies until the user confirms an impact sentence they have read.
 */
export function ProposalDiff({
  proposal,
  source,
  destinationLabel,
  onApply,
  onReject,
  onRegenerate,
  onReviewed,
  busy,
}: {
  proposal: ProposalRow;
  /** The text the proposal was drawn from, so claims can be checked. */
  source: string;
  /** Human label of the destination, e.g. "WEB · Website redesign". */
  destinationLabel: string;
  onApply: (accept: number[], edited: AiOperation[]) => void;
  onReject: (reason?: string) => void;
  onRegenerate: () => void;
  /** Fires once, the first time the human actually works the review. */
  onReviewed: () => void;
  busy: boolean;
}) {
  const [ops, setOps] = useState<AiOperation[]>(proposal.operations);
  // Low-confidence assumptions start unticked: a high-impact guess must not
  // be accepted by inattention (issue #368, step 5).
  const [accepted, setAccepted] = useState<Set<number>>(
    () => new Set(defaultAccepted(proposal.operations)),
  );
  const [confirming, setConfirming] = useState(false);

  const groups = useMemo(() => groupOps(ops), [ops]);
  const dupes = useMemo(() => dupHints(ops), [ops]);
  const acceptedList = useMemo(() => [...accepted].sort((a, b) => a - b), [accepted]);
  const counts = useMemo(() => impactCounts(ops, acceptedList), [ops, acceptedList]);
  const impact = impactSentence(counts, destinationLabel);
  const inboxNote = inboxLandingSentence(inboxLandingCount(ops, acceptedList));
  const heldBack = defaultAcceptanceNotice(proposal.operations);
  const assumptions = assumptionCount(ops);
  const openQuestions = proposal.openQuestions ?? [];
  const highBlast = accepted.size > 15;

  // "Reviewed" means a human worked the proposal, not merely that one was
  // generated — so it fires on the first real interaction, once.
  const reviewed = useRef(false);
  function markReviewed() {
    if (reviewed.current) return;
    reviewed.current = true;
    onReviewed();
  }

  function toggle(i: number) {
    markReviewed();
    setAccepted((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }
  function editTitle(i: number, title: string) {
    markReviewed();
    setOps((cur) =>
      cur.map((op, idx) =>
        idx === i && op.op === "create_task" ? { ...op, fields: { ...op.fields, title } } : op,
      ),
    );
  }

  return (
    <div className="ta-diff" aria-label="Proposed changes">
      <h2 className="ta-diff__h2">What TasksAI proposes</h2>
      {proposal.summary && <p className="ta-diff__summary">{proposal.summary}</p>}

      <p className="ta-diff__trust" role="note">
        Nothing below exists yet. {ops.length} proposed change(s), of which {assumptions} rest on
        assumptions rather than your text. Untick anything you disagree with, edit titles in place,
        or turn the whole thing down.
      </p>

      {heldBack && (
        <p className="ta-diff__held" role="note">
          {heldBack}
        </p>
      )}

      {openQuestions.length > 0 && (
        <section className="ta-diff__questions" aria-labelledby="ta-diff-q">
          <h3 id="ta-diff-q">What it could not work out</h3>
          <ul>
            {openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      )}

      {dupes.length > 0 && (
        <p className="ta-diff__dupe" role="note">
          Possible duplicates: {dupes.map((d) => `"${d.title}"`).join(", ")}. Untick one.
        </p>
      )}

      <div className="ta-diff__bulk">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            markReviewed();
            setAccepted(new Set(ops.map((_, i) => i)));
          }}
          disabled={busy || accepted.size === ops.length}
        >
          Accept all
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            markReviewed();
            setAccepted(new Set());
          }}
          disabled={busy || accepted.size === 0}
        >
          Untick all
        </Button>
        <span className="ta-muted">
          {accepted.size} of {ops.length} selected
        </span>
      </div>

      {groups.map((g) => (
        <section key={g.kind} className="ta-diff__group">
          <h4>
            {g.kind === "create" ? "Create tasks" : g.kind === "update" ? "Update tasks" : "Link tasks"}{" "}
            <span>{g.items.length}</span>
          </h4>
          <ul>
            {g.items.map(({ index, op }) => {
              const ev = evidenceFor(op);
              const cited = evidenceText(source, op);
              return (
                <li key={index} data-off={!accepted.has(index)}>
                  <input
                    type="checkbox"
                    checked={accepted.has(index)}
                    onChange={() => toggle(index)}
                    aria-label={`Include: ${describe(op)}`}
                  />
                  <div className="ta-diff__body">
                    {op.op === "create_task" ? (
                      <input
                        className="ta-diff__title"
                        value={op.fields.title}
                        onChange={(e) => editTitle(index, e.target.value)}
                        aria-label="Task title"
                      />
                    ) : op.op === "update_task" ? (
                      <span>
                        Update <code>{op.taskId}</code>: {Object.keys(op.fields).join(", ")}
                      </span>
                    ) : (
                      <span>
                        {op.fromRef} <strong>{op.kind}</strong> {op.toRef}
                      </span>
                    )}
                    <span
                      className={ev.grounded ? "ta-badge ta-badge--ok" : "ta-badge ta-badge--warn"}
                      title={
                        ev.grounded
                          ? "Backed by a passage in the text you pasted"
                          : "The model inferred this — it is not in your text"
                      }
                    >
                      {ev.label} · {(ev.confidence * 100).toFixed(0)}%
                    </span>
                    {cited && (
                      <blockquote className="ta-diff__quote">
                        <span className="ta-muted">Because you wrote:</span> “{cited}”
                      </blockquote>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="ta-diff__impact" aria-labelledby="ta-diff-impact">
        <h3 id="ta-diff-impact">If you approve this</h3>
        <p className="ta-diff__impactline">{impact}</p>
        {inboxNote && <p className="ta-diffcard__hint">{inboxNote}</p>}
      </section>

      <div className="ta-diff__actions">
        <Button onClick={() => setConfirming(true)} disabled={busy || accepted.size === 0}>
          {highBlast ? `Review and apply ${accepted.size}` : `Apply ${accepted.size}`}
        </Button>
        <Button variant="secondary" onClick={onRegenerate} disabled={busy}>
          Try again from the same text
        </Button>
        <Button variant="danger" onClick={() => onReject()} disabled={busy}>
          Reject — change nothing
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Apply these changes?"
        message={`${impact}${inboxNote ? ` ${inboxNote}` : ""}${
          highBlast ? " This is a large change — everything applied can be undone afterwards." : ""
        }`}
        confirmLabel={`Apply ${accepted.size}`}
        onConfirm={() => {
          setConfirming(false);
          onApply(acceptedList, ops);
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function describe(op: AiOperation): string {
  if (op.op === "create_task") return `create "${op.fields.title}"`;
  if (op.op === "update_task") return `update task ${op.taskId}`;
  return `link ${op.fromRef} ${op.kind} ${op.toRef}`;
}

// Local mirrors of lib/ai/diff.ts (client-safe, no server-only imports).
function groupOps(ops: AiOperation[]) {
  const g: Record<string, { index: number; op: AiOperation }[]> = {
    create: [],
    update: [],
    link: [],
  };
  ops.forEach((op, index) => {
    const k = op.op === "create_task" ? "create" : op.op === "update_task" ? "update" : "link";
    g[k].push({ index, op });
  });
  return (["create", "update", "link"] as const).filter((k) => g[k].length).map((k) => ({ kind: k, items: g[k] }));
}
function dupHints(ops: AiOperation[]) {
  const creates = ops
    .map((op, i) => ({ i, op }))
    .filter((x): x is { i: number; op: Extract<AiOperation, { op: "create_task" }> } => x.op.op === "create_task");
  const out: { title: string }[] = [];
  for (let i = 0; i < creates.length; i++)
    for (let j = i + 1; j < creates.length; j++) {
      const a = norm(creates[i].op.fields.title);
      const b = norm(creates[j].op.fields.title);
      if (a === b) out.push({ title: creates[i].op.fields.title });
    }
  return out;
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
