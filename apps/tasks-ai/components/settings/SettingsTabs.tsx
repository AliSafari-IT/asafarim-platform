"use client";

import { useEffect, useState } from "react";
import { Button, FieldError, FormRow, Input, Label, Select } from "@asafarim/ui";
import {
  api,
  ClientApiError,
  type AiSettings,
  type AiUsage,
  type BillingUsage,
  type Invitation,
} from "../../lib/client/api";

type Tab = "members" | "ai" | "billing";

export function SettingsTabs({ slug, isAdmin }: { slug: string; isAdmin: boolean }) {
  const [tab, setTab] = useState<Tab>("members");
  return (
    <section className="ta-tw">
      <header className="ta-tw__head">
        <h1>Settings</h1>
        <div className="ta-tw__tabs" role="tablist" aria-label="Settings section">
          {(["members", "ai", "billing"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === "ai" ? "AI" : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </header>
      {!isAdmin && (
        <div className="ta-callout" role="note">
          You can view these settings. Changes need an admin or owner.
        </div>
      )}
      {tab === "members" && <MembersTab slug={slug} isAdmin={isAdmin} />}
      {tab === "ai" && <AiTab slug={slug} isAdmin={isAdmin} />}
      {tab === "billing" && <BillingTab slug={slug} />}
    </section>
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
