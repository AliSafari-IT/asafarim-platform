"use client";

import { useEffect, useState } from "react";
import { Button, FieldError, FormRow, Input, Label, Select } from "@asafarim/ui";
import {
  api,
  ClientApiError,
  type AiSettings,
  type AiUsage,
  type AuditRow,
  type BillingUsage,
  type FeedbackItem,
  type Invitation,
  type LabelRow,
  type StatusRow,
} from "../../lib/client/api";

type Tab = "members" | "statuses" | "labels" | "ai" | "billing" | "audit" | "feedback";
const TABS: Tab[] = ["members", "statuses", "labels", "ai", "billing", "audit", "feedback"];

export function SettingsTabs({ slug, isAdmin, initialTab }: { slug: string; isAdmin: boolean; initialTab?: string }) {
  // `?tab=billing` deep links (e.g. from the AI cost page) open that tab.
  const [tab, setTab] = useState<Tab>(TABS.includes(initialTab as Tab) ? (initialTab as Tab) : "members");
  return (
    <section className="ta-tw">
      <header className="ta-tw__head">
        <h1>Settings</h1>
        <div className="ta-tw__tabs" role="tablist" aria-label="Settings section">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === "ai" ? "AI" : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </header>
      {!isAdmin && ["members", "statuses", "ai", "billing", "audit"].includes(tab) && (
        <div className="ta-callout" role="note">
          {tab === "audit"
            ? "The audit log is admin-only."
            : "You can view these settings. Changes need an admin or owner."}
        </div>
      )}
      {tab === "members" && <MembersTab slug={slug} isAdmin={isAdmin} />}
      {tab === "statuses" && <StatusesTab slug={slug} isAdmin={isAdmin} />}
      {tab === "labels" && <LabelsTab slug={slug} isAdmin={isAdmin} />}
      {tab === "ai" && <AiTab slug={slug} isAdmin={isAdmin} />}
      {tab === "billing" && <BillingTab slug={slug} />}
      {tab === "audit" && isAdmin && <AuditTab slug={slug} />}
      {tab === "feedback" && <FeedbackTab slug={slug} isAdmin={isAdmin} />}
    </section>
  );
}

function AuditTab({ slug }: { slug: string }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    const params: Record<string, string> = { limit: "100" };
    if (filter) params.name = filter;
    void api
      .searchAudit(slug, params)
      .then((r) => setRows(r.items))
      .catch(() => setRows([]));
  }, [slug, filter]);

  return (
    <div>
      <h3>Audit log</h3>
      <FormRow>
        <Label htmlFor="au-f">Filter by event name</Label>
        <Input id="au-f" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="e.g. proposal.applied" />
      </FormRow>
      <a className="ta-link" href={`/api/v1/workspaces/${slug}/admin/audit/export?${new URLSearchParams(filter ? { name: filter } : {})}`}>
        Export CSV
      </a>
      {rows === null ? (
        <p className="ta-muted">Loading…</p>
      ) : (
        <table className="ta-table">
          <thead>
            <tr><th>When</th><th>Event</th><th>Actor</th><th>Target</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.occurredAt).toLocaleString()}</td>
                <td><code>{r.name}</code></td>
                <td>{r.actorType}{r.actorId ? `:${r.actorId.slice(-6)}` : ""}</td>
                <td>{r.targetType ?? ""}{r.targetId ? `:${r.targetId.slice(-6)}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const SEV_ORDER = ["blocker", "major", "minor", "idea"];
const STATES = ["triage", "accepted", "in_progress", "resolved", "wont_do"];

function FeedbackTab({ slug, isAdmin }: { slug: string; isAdmin: boolean }) {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [severity, setSeverity] = useState("minor");

  async function load() {
    setItems(await api.listFeedback(slug).catch(() => []));
  }
  useEffect(() => {
    void load();
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api.createFeedback(slug, { source: "in_app", severity, title: title.trim(), detail: detail.trim() });
    setTitle("");
    setDetail("");
    await load();
  }

  const byState = (s: string) => (items ?? []).filter((i) => i.state === s);

  return (
    <div>
      <h3>Report feedback</h3>
      <form className="ta-panelform" onSubmit={submit}>
        <FormRow>
          <Label htmlFor="fb-title">Title</Label>
          <Input id="fb-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </FormRow>
        <FormRow>
          <Label htmlFor="fb-sev">Severity</Label>
          <Select id="fb-sev" value={severity} onChange={(e) => setSeverity(e.target.value)} options={SEV_ORDER.map((v) => ({ value: v, label: v }))} />
        </FormRow>
        <FormRow>
          <Label htmlFor="fb-detail">Detail</Label>
          <textarea id="fb-detail" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </FormRow>
        <Button size="sm" type="submit" disabled={!title.trim() || !detail.trim()}>
          Submit
        </Button>
      </form>

      <h3>Triage board</h3>
      {items === null ? (
        <p className="ta-muted">Loading…</p>
      ) : (
        <div className="ta-board">
          {STATES.map((st) => (
            <div key={st} className="ta-board__col">
              <h3>{st.replace("_", " ")} <span>{byState(st).length}</span></h3>
              <ul>
                {byState(st).map((i) => (
                  <li key={i.id}>
                    <span>
                      <span className="ta-badge">{i.severity}</span> {i.title}
                    </span>
                    {isAdmin && (
                      <Select
                        aria-label={`Move ${i.title}`}
                        value={i.state}
                        onChange={async (e) => {
                          await api.triageFeedback(slug, i.id, { state: e.target.value });
                          await load();
                        }}
                        options={STATES.map((s) => ({ value: s, label: s }))}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MembersTab({ slug, isAdmin }: { slug: string; isAdmin: boolean }) {
  const [invites, setInvites] = useState<Invitation[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setInvites(await api.listInvitations(slug));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load invitations.");
    }
  }
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, slug]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createInvitation(slug, { email: email.trim(), role });
      setEmail("");
      await load();
    } catch (err) {
      setError(
        err instanceof ClientApiError && err.code === "conflict_unique"
          ? "There's already a pending invitation for that address."
          : err instanceof Error
            ? err.message
            : "Could not send the invitation.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) return <p className="ta-muted">Member management is admin-only.</p>;

  return (
    <div>
      <h3>Invite a member</h3>
      <form className="ta-panelform" onSubmit={invite} noValidate>
        <FormRow>
          <Label htmlFor="inv-email">Email</Label>
          <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </FormRow>
        <FormRow>
          <Label htmlFor="inv-role">Role</Label>
          <Select
            id="inv-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={[
              { value: "member", label: "Member" },
              { value: "admin", label: "Admin" },
              { value: "guest", label: "Guest" },
            ]}
          />
        </FormRow>
        {error && <FieldError>{error}</FieldError>}
        <Button type="submit" size="sm" disabled={busy || !email.trim()}>
          {busy ? "Sending…" : "Send invitation"}
        </Button>
      </form>

      <h3>Pending invitations</h3>
      {invites === null ? (
        <p className="ta-muted">Loading…</p>
      ) : invites.length === 0 ? (
        <p className="ta-muted">None.</p>
      ) : (
        <ul className="ta-list">
          {invites.map((i) => (
            <li key={i.id}>
              <span className="ta-list__title">
                {i.email} · {i.role}
              </span>
              <span className="ta-list__due">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await api.revokeInvitation(slug, i.id);
                  void load();
                }}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Workspace-level statuses only (issue #387) — per-project overrides are
 * created from the project's own settings surface, not built here yet. */
function StatusesTab({ slug, isAdmin }: { slug: string; isAdmin: boolean }) {
  const [rows, setRows] = useState<StatusRow[] | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("todo");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows((await api.listStatuses(slug)).filter((s) => !s.projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load statuses.");
    }
  }
  useEffect(() => {
    void load();
  }, [slug]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createStatus(slug, { name: name.trim(), category });
      setName("");
      await load();
    } catch (err) {
      setError(
        err instanceof ClientApiError && err.code === "conflict_unique"
          ? "A status with that name already exists."
          : err instanceof Error
            ? err.message
            : "Could not create that status.",
      );
    }
  }

  async function move(id: string, dir: -1 | 1) {
    if (!rows) return;
    const idx = rows.findIndex((r) => r.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= rows.length) return;
    const next = [...rows];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setRows(next);
    try {
      await api.reorderStatuses(slug, next.map((r) => r.id));
    } catch {
      await load();
    }
  }

  return (
    <div>
      <h3>Statuses</h3>
      <p className="ta-hint">
        Workspace-wide statuses shown in the task detail picker and board/list badges. Todo, In
        Progress and Done are seeded automatically when a workspace is created.
      </p>
      {isAdmin && (
        <form className="ta-panelform" onSubmit={create} noValidate>
          <FormRow>
            <Label htmlFor="st-name">Name</Label>
            <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormRow>
          <FormRow>
            <Label htmlFor="st-cat">Category</Label>
            <Select
              id="st-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={[
                { value: "todo", label: "Todo" },
                { value: "in_progress", label: "In progress" },
                { value: "done", label: "Done" },
                { value: "canceled", label: "Canceled" },
              ]}
            />
          </FormRow>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" size="sm" disabled={!name.trim()}>
            Add status
          </Button>
        </form>
      )}

      {rows === null ? (
        <p className="ta-muted">Loading…</p>
      ) : (
        <ul className="ta-list">
          {rows.map((r, i) => (
            <li key={r.id}>
              <span className="ta-list__title">
                <span className="ta-badge" data-h={r.category}>{r.name}</span>
                {r.isDefault && <span className="ta-hint"> default</span>}
              </span>
              {isAdmin && (
                <span className="ta-drawer__inlineform">
                  <Button size="sm" variant="secondary" disabled={i === 0} onClick={() => void move(r.id, -1)}>
                    Up
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={i === rows.length - 1}
                    onClick={() => void move(r.id, 1)}
                  >
                    Down
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await api.archiveStatus(slug, r.id);
                      await load();
                    }}
                  >
                    Archive
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Label CRUD (issue #387). `label.manage` is actually a `member`-level
 * action (lib/authz.ts), but this settings surface only exposes the
 * create/archive form to admins for now — a lighter, member-facing entry
 * point can follow once there's a natural place for it outside Settings. */
function LabelsTab({ slug, isAdmin }: { slug: string; isAdmin: boolean }) {
  const [rows, setRows] = useState<LabelRow[] | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#8b8b8b");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await api.listLabels(slug));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load labels.");
    }
  }
  useEffect(() => {
    void load();
  }, [slug]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createLabel(slug, { name: name.trim(), color });
      setName("");
      await load();
    } catch (err) {
      setError(
        err instanceof ClientApiError && err.code === "conflict_unique"
          ? "A label with that name already exists."
          : err instanceof Error
            ? err.message
            : "Could not create that label.",
      );
    }
  }

  return (
    <div>
      <h3>Labels</h3>
      <p className="ta-hint">Assignable from any task's detail panel, and searchable by name.</p>
      {isAdmin && (
        <form className="ta-panelform" onSubmit={create} noValidate>
          <FormRow>
            <Label htmlFor="lb-name">Name</Label>
            <Input id="lb-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormRow>
          <FormRow>
            <Label htmlFor="lb-color">Color</Label>
            <Input id="lb-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </FormRow>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" size="sm" disabled={!name.trim()}>
            Add label
          </Button>
        </form>
      )}

      {rows === null ? (
        <p className="ta-muted">Loading…</p>
      ) : rows.filter((r) => !r.archivedAt).length === 0 ? (
        <p className="ta-muted">None yet.</p>
      ) : (
        <ul className="ta-list">
          {rows
            .filter((r) => !r.archivedAt)
            .map((r) => (
              <li key={r.id}>
                <span className="ta-badge" style={{ backgroundColor: r.color }}>
                  {r.name}
                </span>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await api.archiveLabel(slug, r.id);
                      await load();
                    }}
                  >
                    Archive
                  </Button>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function AiTab({ slug, isAdmin }: { slug: string; isAdmin: boolean }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api.aiSettings(slug).then(setSettings).catch(() => {});
    void api.aiUsage(slug).then(setUsage).catch(() => {});
  }, [slug]);

  async function patch(body: Record<string, unknown>) {
    const next = await api.updateAiSettings(slug, body);
    setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!settings) return <p className="ta-muted">Loading…</p>;
  return (
    <div>
      <h3>AI controls</h3>
      <label className="ta-toggle">
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={!isAdmin}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        AI features enabled {settings.enabled ? "" : "(kill switch is on)"}
      </label>

      <FormRow>
        <Label htmlFor="ai-budget">Monthly budget (USD, blank = plan default)</Label>
        <Input
          id="ai-budget"
          type="number"
          min={0}
          defaultValue={settings.monthlyBudgetUsd ?? ""}
          disabled={!isAdmin}
          onBlur={(e) => patch({ monthlyBudgetUsd: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </FormRow>
      <FormRow>
        <Label htmlFor="ai-blast">Max operations per proposal</Label>
        <Input
          id="ai-blast"
          type="number"
          min={1}
          max={500}
          defaultValue={settings.maxBlastRadius}
          disabled={!isAdmin}
          onBlur={(e) => patch({ maxBlastRadius: Number(e.target.value) })}
        />
      </FormRow>
      <p className="ta-muted">Provider: {settings.provider} · model: {settings.model}</p>
      {saved && <p className="ta-copilot__status">Saved</p>}

      {usage && (
        <>
          <h3>This month</h3>
          <p>
            ${usage.monthUsd.toFixed(2)} spent · {usage.monthJobs} job(s)
            {usage.budgetUsd != null && ` · budget $${usage.budgetUsd.toFixed(2)}`}
          </p>
        </>
      )}
    </div>
  );
}

function BillingTab({ slug }: { slug: string }) {
  const [u, setU] = useState<BillingUsage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void api
      .billingUsage(slug)
      .then(setU)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load billing."));
  }, [slug]);

  if (err) return <p className="ta-error">{err}</p>;
  if (!u) return <p className="ta-muted">Loading…</p>;
  return (
    <div>
      <h3>Plan</h3>
      <p>
        <strong>{u.tier}</strong> · {u.status}
        {u.estimatedMonthlyCents != null && ` · est. €${(u.estimatedMonthlyCents / 100).toFixed(2)}/mo`}
      </p>
      {!u.billingOpen && (
        <div className="ta-callout" role="note">
          Billing is not open yet — TasksAI runs unrestricted on the free tier. Paid plans arrive
          once the commercial licence is in place.
        </div>
      )}
      <p className="ta-muted">
        These meters are plan allowances (how much your plan includes). What AI providers charged
        for Copilot runs is a separate figure —{" "}
        <a className="ta-link" href={`/w/${slug}/analytics/ai-costs`}>
          see AI cost
        </a>
        .
      </p>
      <h3>Usage this period</h3>
      <ul className="ta-list">
        {u.meters.map((m) => (
          <li key={m.meter}>
            <span className="ta-list__title">{m.meter.replace("_", " ")}</span>
            <span className="ta-list__due">
              {m.used}
              {Number.isFinite(m.limit) ? ` / ${m.limit}` : " / ∞"}
              {m.overage ? " · over limit" : ""}
              {m.meter === u.costDriver ? " · cost driver" : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="ta-muted">{u.note}</p>
    </div>
  );
}
