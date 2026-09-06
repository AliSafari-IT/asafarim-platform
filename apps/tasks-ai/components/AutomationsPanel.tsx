"use client";

import { useEffect, useState } from "react";
import { Button, FieldError, FormRow, Input, Label, Select } from "@asafarim/ui";
import { api, ClientApiError, type AutomationRule, type AutomationRun, type DryRunResult } from "../lib/client/api";

const EVENTS = ["task.created", "task.status_changed", "task.assigned", "task.updated", "task.completed"];
const ACTIONS = ["comment", "add_label", "set_due_in_days", "assign", "set_status"];

export function AutomationsPanel({ slug, canManage }: { slug: string; canManage: boolean }) {
  const [rules, setRules] = useState<AutomationRule[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [event, setEvent] = useState(EVENTS[0]);
  const [actionType, setActionType] = useState("comment");
  const [actionArg, setActionArg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, AutomationRun[]>>({});
  const [dry, setDry] = useState<Record<string, DryRunResult>>({});

  async function load() {
    setRules(await api.listRules(slug).catch(() => []));
  }
  useEffect(() => {
    void load();
  }, [slug]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const action =
      actionType === "comment"
        ? { type: "comment", body: actionArg || "Automated note" }
        : actionType === "add_label"
          ? { type: "add_label", labelId: actionArg }
          : actionType === "set_due_in_days"
            ? { type: "set_due_in_days", days: Number(actionArg) || 1 }
            : actionType === "assign"
              ? { type: "assign", membershipId: actionArg }
              : { type: "set_status", statusId: actionArg };
    try {
      await api.createRule(slug, {
        name: name.trim(),
        trigger: { event, filters: [] },
        conditions: [],
        actions: [action],
      });
      setName("");
      setActionArg("");
      setOpen(false);
      await load();
    } catch (err) {
      setError(
        err instanceof ClientApiError && err.code === "forbidden"
          ? "Automations need an admin or owner."
          : err instanceof Error
            ? err.message
            : "Could not create the rule.",
      );
    }
  }

  return (
    <section className="ta-tw">
      <header className="ta-tw__head">
        <h1>Automations</h1>
        {canManage && (
          <Button size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "New rule"}
          </Button>
        )}
      </header>
      <p className="ta-muted">
        Trigger → conditions → actions. New rules start as drafts — dry-run, then activate.
      </p>

      {open && (
        <form className="ta-panelform" onSubmit={create} noValidate>
          <FormRow>
            <Label htmlFor="r-name">Name</Label>
            <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </FormRow>
          <FormRow>
            <Label htmlFor="r-event">When</Label>
            <Select id="r-event" value={event} onChange={(e) => setEvent(e.target.value)} options={EVENTS.map((v) => ({ value: v, label: v }))} />
          </FormRow>
          <FormRow>
            <Label htmlFor="r-action">Do</Label>
            <Select id="r-action" value={actionType} onChange={(e) => setActionType(e.target.value)} options={ACTIONS.map((v) => ({ value: v, label: v }))} />
          </FormRow>
          <FormRow>
            <Label htmlFor="r-arg">
              {actionType === "comment" ? "Comment text" : actionType === "set_due_in_days" ? "Days" : "Id (label / member / status)"}
            </Label>
            <Input id="r-arg" value={actionArg} onChange={(e) => setActionArg(e.target.value)} />
          </FormRow>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" size="sm" disabled={!name.trim()}>
            Create draft
          </Button>
        </form>
      )}

      {rules === null ? (
        <p className="ta-muted">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="ta-muted">No rules yet.</p>
      ) : (
        <ul className="ta-rules">
          {rules.map((r) => (
            <li key={r.id}>
              <div className="ta-rules__head">
                <span className="ta-badge" data-h={r.state === "active" ? "on_track" : r.state === "paused" ? "watch" : ""}>
                  {r.state}
                </span>
                <strong>{r.name}</strong>
                <span className="ta-muted">
                  on {r.trigger.event} → {r.actions.map((a) => a.type).join(", ")}
                </span>
              </div>
              <div className="ta-rules__actions">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const res = await api.dryRunRule(slug, r.id, {
                      name: r.trigger.event,
                      data: { id: "sample", title: "Sample task", statusId: "done" },
                    });
                    setDry((d) => ({ ...d, [r.id]: res }));
                  }}
                >
                  Dry run
                </Button>
                {canManage && r.state !== "active" && (
                  <Button size="sm" onClick={async () => { await api.setRuleState(slug, r.id, "active"); await load(); }}>
                    Activate
                  </Button>
                )}
                {canManage && r.state === "active" && (
                  <Button size="sm" variant="secondary" onClick={async () => { await api.setRuleState(slug, r.id, "paused"); await load(); }}>
                    Pause
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const next = expanded === r.id ? null : r.id;
                    setExpanded(next);
                    if (next) {
                      const list = await api.listRuns(slug, r.id).catch(() => []);
                      setRuns((x) => ({ ...x, [r.id]: list }));
                    }
                  }}
                >
                  {expanded === r.id ? "Hide runs" : "Runs"}
                </Button>
              </div>
              {dry[r.id] && (
                <p className="ta-muted">
                  Dry run: {dry[r.id].wouldRun ? "would run" : "would not run"} ·{" "}
                  {dry[r.id].plannedActions.length} action(s)
                  {dry[r.id].loopRisk && " · ⚠ loop risk"}
                </p>
              )}
              {expanded === r.id && (
                <ul className="ta-runs">
                  {(runs[r.id] ?? []).length === 0 ? (
                    <li className="ta-muted">No runs yet.</li>
                  ) : (
                    (runs[r.id] ?? []).map((run) => (
                      <li key={run.id}>
                        <span className="ta-badge">{run.state}</span> {new Date(run.createdAt).toLocaleString()}
                        {run.error && <span className="ta-error"> · {run.error}</span>}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
