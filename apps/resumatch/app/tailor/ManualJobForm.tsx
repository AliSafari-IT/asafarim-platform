"use client";

import { useState } from "react";
import { Button, Input } from "@asafarim/ui";

/**
 * The manual job-details entry form (issue #461, part of #458) — for a
 * lead with no digital artifact at all. Kept as its own component: the
 * field count would otherwise crowd out TailorFlow's other three intake
 * modes. Server-side validation (lib/tailoring/manualJob.ts) is the source
 * of truth; this only disables submit until title/employer and one content
 * field are non-empty, a cheap client-side mirror of that same rule.
 */
export interface ManualJobFormValues {
  title: string;
  employer: string;
  location: string;
  workMode: "" | "remote" | "hybrid" | "on-site";
  employmentType: "" | "full-time" | "part-time" | "contract" | "internship";
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  applicationDeadline: string;
  responsibilities: string;
  requirements: string;
  preferredQualifications: string;
  benefits: string;
  contactName: string;
  source: string;
}

const EMPTY_VALUES: ManualJobFormValues = {
  title: "",
  employer: "",
  location: "",
  workMode: "",
  employmentType: "",
  salaryMin: "",
  salaryMax: "",
  salaryCurrency: "",
  applicationDeadline: "",
  responsibilities: "",
  requirements: "",
  preferredQualifications: "",
  benefits: "",
  contactName: "",
  source: "",
};

export function ManualJobForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (values: ManualJobFormValues) => void;
}) {
  const [values, setValues] = useState<ManualJobFormValues>(EMPTY_VALUES);

  const set = <K extends keyof ManualJobFormValues>(key: K, value: ManualJobFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const hasContent =
    values.responsibilities.trim() || values.requirements.trim() || values.preferredQualifications.trim() || values.benefits.trim();
  const canSubmit = values.title.trim() && values.employer.trim() && hasContent;

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
        No posting, no email, no file — a phone call, a printed letter, a conversation at a career
        fair? Type in what you know. Only the title, employer, and at least one of responsibilities,
        requirements, preferred qualifications, or benefits are required — leave the rest blank if
        you don't know it yet.
      </p>

      <div className="jm-grid">
        <label className="jm-field">
          <span>Job title *</span>
          <Input value={values.title} onChange={(e) => set("title", e.target.value)} disabled={busy} />
        </label>
        <label className="jm-field">
          <span>Employer *</span>
          <Input value={values.employer} onChange={(e) => set("employer", e.target.value)} disabled={busy} />
        </label>
        <label className="jm-field">
          <span>Location</span>
          <Input value={values.location} onChange={(e) => set("location", e.target.value)} disabled={busy} />
        </label>
        <label className="jm-field">
          <span>Work mode</span>
          <select className="ui-input ui-select" value={values.workMode} onChange={(e) => set("workMode", e.target.value as ManualJobFormValues["workMode"])} disabled={busy}>
            <option value="">Not specified</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="on-site">On-site</option>
          </select>
        </label>
        <label className="jm-field">
          <span>Employment type</span>
          <select className="ui-input ui-select"
            value={values.employmentType}
            onChange={(e) => set("employmentType", e.target.value as ManualJobFormValues["employmentType"])}
            disabled={busy}
          >
            <option value="">Not specified</option>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
          </select>
        </label>
        <label className="jm-field">
          <span>Application deadline</span>
          <Input
            placeholder="e.g. 2026-10-15"
            value={values.applicationDeadline}
            onChange={(e) => set("applicationDeadline", e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="jm-field">
          <span>Salary range (optional)</span>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <Input placeholder="Min" value={values.salaryMin} onChange={(e) => set("salaryMin", e.target.value)} disabled={busy} />
            <Input placeholder="Max" value={values.salaryMax} onChange={(e) => set("salaryMax", e.target.value)} disabled={busy} />
            <Input placeholder="EUR" value={values.salaryCurrency} onChange={(e) => set("salaryCurrency", e.target.value)} disabled={busy} style={{ maxWidth: "5rem" }} />
          </div>
        </label>
        <label className="jm-field">
          <span>Contact person</span>
          <Input value={values.contactName} onChange={(e) => set("contactName", e.target.value)} disabled={busy} />
        </label>
        <label className="jm-field">
          <span>How you heard about it</span>
          <Input placeholder="Referral, career fair, phone call…" value={values.source} onChange={(e) => set("source", e.target.value)} disabled={busy} />
        </label>
      </div>

      <label className="jm-field">
        <span>Responsibilities</span>
        <textarea className="ui-input" rows={4} value={values.responsibilities} onChange={(e) => set("responsibilities", e.target.value)} disabled={busy} style={{ width: "100%" }} />
      </label>
      <label className="jm-field">
        <span>Requirements</span>
        <textarea className="ui-input" rows={4} value={values.requirements} onChange={(e) => set("requirements", e.target.value)} disabled={busy} style={{ width: "100%" }} />
      </label>
      <label className="jm-field">
        <span>Preferred qualifications</span>
        <textarea className="ui-input" rows={3} value={values.preferredQualifications} onChange={(e) => set("preferredQualifications", e.target.value)} disabled={busy} style={{ width: "100%" }} />
      </label>
      <label className="jm-field">
        <span>Benefits</span>
        <textarea className="ui-input" rows={3} value={values.benefits} onChange={(e) => set("benefits", e.target.value)} disabled={busy} style={{ width: "100%" }} />
      </label>

      <Button onClick={() => onSubmit(values)} disabled={!canSubmit || busy}>
        {busy ? "Saving…" : "Use these details"}
      </Button>
    </div>
  );
}
