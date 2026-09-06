"use client";

import { useMemo, useState } from "react";
import { Button } from "@asafarim/ui";
import type { AiOperation, ProposalRow } from "../../lib/client/api";
import { track } from "../../lib/client/telemetry";

/**
 * The proposal review surface (docs: M07). Operations grouped by
 * create / update / link. Per-item accept toggle (partial accept), inline
 * title edit, grounded/assumption badge + confidence. Nothing applies until
 * the user clicks Apply.
 */
export function ProposalDiff({
  proposal,
  onApply,
  onReject,
  onRegenerate,
  busy,
}: {
  proposal: ProposalRow;
  onApply: (accept: number[], edited: AiOperation[]) => void;
  onReject: (reason?: string) => void;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const [ops, setOps] = useState<AiOperation[]>(proposal.operations);
  const [accepted, setAccepted] = useState<Set<number>>(
    () => new Set(proposal.operations.map((_, i) => i)),
  );

  const groups = useMemo(() => groupOps(ops), [ops]);
  const dupes = useMemo(() => dupHints(ops), [ops]);
  const highBlast = accepted.size > 15;

  function toggle(i: number) {
    setAccepted((s) => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }
  function editTitle(i: number, title: string) {
    setOps((cur) =>
      cur.map((op, idx) =>
        idx === i && op.op === "create_task" ? { ...op, fields: { ...op.fields, title } } : op,
      ),
    );
  }

  return (
    <div className="ta-diff">
      {proposal.summary && <p className="ta-diff__summary">{proposal.summary}</p>}

      {dupes.length > 0 && (
        <p className="ta-diff__dupe" role="note">
          Possible duplicates: {dupes.map((d) => `"${d.title}"`).join(", ")}. Untick one.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.kind} className="ta-diff__group">
          <h4>
            {g.kind === "create" ? "Create tasks" : g.kind === "update" ? "Update tasks" : "Link tasks"}{" "}
            <span>{g.items.length}</span>
          </h4>
          <ul>
            {g.items.map(({ index, op, grounded }) => (
              <li key={index} data-off={!accepted.has(index)}>
                <input
                  type="checkbox"
                  checked={accepted.has(index)}
                  onChange={() => toggle(index)}
                  aria-label={`Include operation ${index + 1}`}
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
                  <span className={grounded ? "ta-badge ta-badge--ok" : "ta-badge ta-badge--warn"}>
                    {grounded ? "cited" : "assumption"} · {(op.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="ta-diff__actions">
        <Button
          onClick={() => {
            track({ name: "command_palette.action", action: "proposal.apply" });
            onApply([...accepted].sort((a, b) => a - b), ops);
          }}
          disabled={busy || accepted.size === 0}
        >
          {highBlast ? `Apply ${accepted.size} (elevated confirm)` : `Apply ${accepted.size}`}
        </Button>
        <Button variant="secondary" onClick={onRegenerate} disabled={busy}>
          Regenerate
        </Button>
        <Button variant="danger" onClick={() => onReject()} disabled={busy}>
          Reject
        </Button>
      </div>
    </div>
  );
}

// Local mirrors of lib/ai/diff.ts (client-safe, no server-only imports).
function groupOps(ops: AiOperation[]) {
  const g: Record<string, { index: number; op: AiOperation; grounded: boolean }[]> = {
    create: [],
    update: [],
    link: [],
  };
  ops.forEach((op, index) => {
    const grounded = op.citations.some((c) => c.span !== null && !c.assumption);
    const k = op.op === "create_task" ? "create" : op.op === "update_task" ? "update" : "link";
    g[k].push({ index, op, grounded });
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
