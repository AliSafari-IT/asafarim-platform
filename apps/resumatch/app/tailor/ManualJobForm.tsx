"use client";

import { useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
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
  const { t } = useTranslation();
  const [values, setValues] = useState<ManualJobFormValues>(EMPTY_VALUES);

  const set = <K extends keyof ManualJobFormValues>(key: K, value: ManualJobFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const hasContent =
    values.responsibilities.trim() || values.requirements.trim() || values.preferredQualifications.trim() || values.benefits.trim();
  const canSubmit = values.title.trim() && values.employer.trim() && hasContent;

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
        {t("resumatch.manual.intro")}
      </p>

      <div className="jm-grid">
        <label className="jm-field">
          <span>{t("resumatch.manual.title")}</span>
          <Input value={values.title} onChange={(e) => set("title", e.target.value)} disabled={busy} />
        </label>
        <label className="jm-field">
          <span>{t("resumatch.manual.employer")}</span>
          <Input value={values.employer} onChange={(e) => set("employer", e.target.value)} disabled={busy} />
        </label>
        <label className="jm-field">
          <span>{t("resumatch.manual.location")}</span>
          <Input value={values.location} onChange={(e) => set("location", e.target.value)} disabled={busy} />
        </label>
        <label className="jm-field">
          <span>{t("resumatch.manual.workMode")}</span>
          <select className="ui-input ui-select" value={values.workMode} onChange={(e) => set("workMode", e.target.value as ManualJobFormValues["workMode"])} disabled={busy}>
            <option value="">{t("resumatch.manual.notSpecified")}</option>
            <option value="remote">{t("resumatch.manual.remote")}</option>
            <option value="hybrid">{t("resumatch.manual.hybrid")}</option>
            <option value="on-site">{t("resumatch.manual.onSite")}</option>
          </select>
        </label>
        <label className="jm-field">
          <span>{t("resumatch.manual.employmentType")}</span>
          <select className="ui-input ui-select"
            value={values.employmentType}
            onChange={(e) => set("employmentType", e.target.value as ManualJobFormValues["employmentType"])}
            disabled={busy}
          >
            <option value="">{t("resumatch.manual.notSpecified")}</option>
            <option value="full-time">{t("resumatch.manual.fullTime")}</option>
            <option value="part-time">{t("resumatch.manual.partTime")}</option>
            <option value="contract">{t("resumatch.manual.contract")}</option>
            <option value="internship">{t("resumatch.manual.internship")}</option>
          </select>
        </label>
        <label className="jm-field">
          <span>{t("resumatch.manual.deadline")}</span>
          <Input
            placeholder={t("resumatch.manual.deadlinePlaceholder")}
            value={values.applicationDeadline}
            onChange={(e) => set("applicationDeadline", e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="jm-field">
          <span>{t("resumatch.manual.salary")}</span>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <Input placeholder={t("resumatch.manual.min")} value={values.salaryMin} onChange={(e) => set("salaryMin", e.target.value)} disabled={busy} />
            <Input placeholder={t("resumatch.manual.max")} value={values.salaryMax} onChange={(e) => set("salaryMax", e.target.value)} disabled={busy} />
            <Input placeholder="EUR" value={values.salaryCurrency} onChange={(e) => set("salaryCurrency", e.target.value)} disabled={busy} style={{ maxWidth: "5rem" }} />
          </div>
        </label>
        <label className="jm-field">
          <span>{t("resumatch.manual.contact")}</span>
          <Input value={values.contactName} onChange={(e) => set("contactName", e.target.value)} disabled={busy} />
        </label>
        <label className="jm-field">
          <span>{t("resumatch.manual.source")}</span>
          <Input placeholder={t("resumatch.manual.sourcePlaceholder")} value={values.source} onChange={(e) => set("source", e.target.value)} disabled={busy} />
        </label>
      </div>

      <label className="jm-field">
        <span>{t("resumatch.manual.responsibilities")}</span>
        <textarea className="ui-input" rows={4} value={values.responsibilities} onChange={(e) => set("responsibilities", e.target.value)} disabled={busy} style={{ width: "100%" }} />
      </label>
      <label className="jm-field">
        <span>{t("resumatch.manual.requirements")}</span>
        <textarea className="ui-input" rows={4} value={values.requirements} onChange={(e) => set("requirements", e.target.value)} disabled={busy} style={{ width: "100%" }} />
      </label>
      <label className="jm-field">
        <span>{t("resumatch.manual.preferred")}</span>
        <textarea className="ui-input" rows={3} value={values.preferredQualifications} onChange={(e) => set("preferredQualifications", e.target.value)} disabled={busy} style={{ width: "100%" }} />
      </label>
      <label className="jm-field">
        <span>{t("resumatch.manual.benefits")}</span>
        <textarea className="ui-input" rows={3} value={values.benefits} onChange={(e) => set("benefits", e.target.value)} disabled={busy} style={{ width: "100%" }} />
      </label>

      <Button onClick={() => onSubmit(values)} disabled={!canSubmit || busy}>
        {busy ? t("resumatch.saving") : t("resumatch.manual.submit")}
      </Button>
    </div>
  );
}
