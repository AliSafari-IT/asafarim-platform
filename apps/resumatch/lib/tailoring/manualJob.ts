import { z } from "zod";

/**
 * Manual job-details entry (issue #461, part of #458) — for a lead with no
 * digital artifact at all: a phone call, a printed letter, a career-fair
 * conversation, a verbal referral. All fields are candidate-typed with no
 * source to cross-check against, so almost everything here is optional —
 * this should never force a field a candidate genuinely doesn't know yet
 * (salary is very often undisclosed at the phone-call stage).
 *
 * `buildManualJobText` turns this into the same kind of `rawText` block
 * `fetch-job`/`paste-job`/`paste-email` already produce, in a consistent
 * order, so `computeCoverage` (#428) and the tailoring prompt see one
 * coherent block regardless of which intake path a `TargetJob` came from.
 * The structured fields themselves are also persisted on
 * `TargetJob.structuredFields` for anything downstream that wants them
 * directly (e.g. a future application tracker, #432).
 */

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length > 0 ? v : null))
    .nullable()
    .default(null);

export const WORK_MODES = ["remote", "hybrid", "on-site"] as const;
export const EMPLOYMENT_TYPES = ["full-time", "part-time", "contract", "internship"] as const;

export const manualJobInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    employer: z.string().trim().min(1).max(200),
    location: optionalTrimmed(200),
    workMode: z.enum(WORK_MODES).nullable().default(null),
    employmentType: z.enum(EMPLOYMENT_TYPES).nullable().default(null),
    salaryMin: z.number().int().nonnegative().nullable().default(null),
    salaryMax: z.number().int().nonnegative().nullable().default(null),
    salaryCurrency: optionalTrimmed(8),
    applicationDeadline: optionalTrimmed(40),
    responsibilities: optionalTrimmed(6000),
    requirements: optionalTrimmed(6000),
    preferredQualifications: optionalTrimmed(4000),
    benefits: optionalTrimmed(4000),
    contactName: optionalTrimmed(160),
    source: optionalTrimmed(200),
  })
  .refine(
    (v) => [v.responsibilities, v.requirements, v.preferredQualifications, v.benefits].some(Boolean),
    { message: "At least one of responsibilities, requirements, preferred qualifications, or benefits is required." },
  );

export type ManualJobInput = z.infer<typeof manualJobInputSchema>;

function labelWorkMode(mode: (typeof WORK_MODES)[number]): string {
  return { remote: "Remote", hybrid: "Hybrid", "on-site": "On-site" }[mode];
}

function labelEmploymentType(type: (typeof EMPLOYMENT_TYPES)[number]): string {
  return { "full-time": "Full-time", "part-time": "Part-time", contract: "Contract", internship: "Internship" }[type];
}

/** Builds the same kind of coherent text block a fetched/pasted posting
 *  already produces, so the rest of the pipeline (coverage, tailoring
 *  prompt) needs no per-intake-path special-casing. */
export function buildManualJobText(input: ManualJobInput): string {
  const lines: string[] = [`${input.title} — ${input.employer}`];

  const facts: string[] = [];
  if (input.location) facts.push(input.location);
  if (input.workMode) facts.push(labelWorkMode(input.workMode));
  if (input.employmentType) facts.push(labelEmploymentType(input.employmentType));
  if (facts.length > 0) lines.push(facts.join(" · "));

  if (input.salaryMin != null || input.salaryMax != null) {
    const currency = input.salaryCurrency ?? "";
    const range =
      input.salaryMin != null && input.salaryMax != null
        ? `${input.salaryMin}–${input.salaryMax}`
        : String(input.salaryMin ?? input.salaryMax);
    lines.push(`Salary: ${currency} ${range}`.trim());
  }
  if (input.applicationDeadline) lines.push(`Application deadline: ${input.applicationDeadline}`);

  if (input.responsibilities) lines.push(`\nResponsibilities:\n${input.responsibilities}`);
  if (input.requirements) lines.push(`\nRequirements:\n${input.requirements}`);
  if (input.preferredQualifications) lines.push(`\nPreferred qualifications:\n${input.preferredQualifications}`);
  if (input.benefits) lines.push(`\nBenefits:\n${input.benefits}`);

  return lines.join("\n");
}
