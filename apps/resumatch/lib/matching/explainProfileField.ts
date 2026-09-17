import type { CandidateProfileContent } from "../profile/contract";

/**
 * Resolves a `MatchEvidence.profileField` reference into a human-readable
 * fact, for JM-048's evidence-linked explanation UI.
 *
 * `profileField` is never a raw excerpt (see contract.ts's doc comment on
 * `matchEvidenceSchema`) — it is a path into the confirmed
 * `CandidateProfileContent`, e.g. `"skills[2].name"`,
 * `"experience[0].title"`, or `"skills[2]"` (the whole entry, not one of
 * its sub-fields). The evaluation fixture (evalFixture.ts, JM-043) does not
 * yet produce paths this specific — it currently cites
 * `"embeddingInput.text[token:N]"`, a reference into the flattened
 * embedding text rather than a structured profile path — so this resolver
 * must degrade gracefully on anything it does not recognise rather than
 * assume every provider will always emit a clean structured path.
 *
 * **Never throws.** A malformed or unrecognised `profileField` is a
 * candidate-facing UI concern, not a crash: `explainProfileField` falls
 * back to returning the raw reference string, visibly, rather than let one
 * bad evidence row take down the whole match panel.
 */
export function explainProfileField(profileField: string, profile: CandidateProfileContent): string {
  try {
    const resolved = resolve(profileField.trim(), profile);
    return resolved ?? profileField;
  } catch {
    // Any unexpected shape (index out of range treated elsewhere, but a
    // defensive catch-all in case a future path type throws for some other
    // reason) still degrades to the raw string rather than propagating.
    return profileField;
  }
}

const ARRAY_INDEX = /^([a-zA-Z]+)\[(\d+)\](?:\.([a-zA-Z0-9_]+))?$/;

function resolve(path: string, profile: CandidateProfileContent): string | null {
  // Top-level scalar fields.
  switch (path) {
    case "headline":
      return profile.headline ? `Headline: ${profile.headline}` : null;
    case "summary":
      return profile.summary ? `Summary: ${truncate(profile.summary, 160)}` : null;
    case "baseLocation":
      return profile.baseLocation ? `Location: ${profile.baseLocation}` : null;
    case "workAuthorization":
      return profile.workAuthorization ? `Work authorization: ${formatEnum(profile.workAuthorization)}` : null;
    case "preferences.remote":
      return profile.preferences.remote ? `Working arrangement preference: ${formatEnum(profile.preferences.remote)}` : null;
    case "preferences.locations":
      return profile.preferences.locations.length
        ? `Preferred locations: ${profile.preferences.locations.join(", ")}`
        : null;
    case "preferences.salaryFloor":
      return profile.preferences.salaryFloor !== null
        ? `Salary floor: ${profile.preferences.salaryFloor}${profile.preferences.salaryCurrency ? ` ${profile.preferences.salaryCurrency}` : ""}`
        : null;
    default:
      break;
  }

  const match = ARRAY_INDEX.exec(path);
  if (!match) return null;

  const [, collection, indexRaw, subField] = match;
  const index = Number.parseInt(indexRaw, 10);

  switch (collection) {
    case "skills": {
      const skill = profile.skills[index];
      if (!skill) return null;
      if (subField === "name" || !subField) {
        const years = skill.yearsExperience !== null ? ` (${skill.yearsExperience} years)` : "";
        return `Skills: ${skill.name}${years}`;
      }
      if (subField === "yearsExperience") {
        return skill.yearsExperience !== null ? `Skills: ${skill.name} — ${skill.yearsExperience} years` : null;
      }
      return `Skills: ${skill.name}`;
    }
    case "experience": {
      const entry = profile.experience[index];
      if (!entry) return null;
      if (subField === "title" || !subField) {
        const employer = entry.employer ? ` at ${entry.employer}` : "";
        return `Experience: ${entry.title}${employer}`;
      }
      if (subField === "employer") {
        return entry.employer ? `Experience: ${entry.title} at ${entry.employer}` : null;
      }
      if (subField === "summary") {
        return entry.summary ? `Experience (${entry.title}): ${truncate(entry.summary, 160)}` : null;
      }
      return `Experience: ${entry.title}`;
    }
    case "education": {
      const entry = profile.education[index];
      if (!entry) return null;
      const institution = entry.institution ? ` — ${entry.institution}` : "";
      return `Education: ${entry.qualification}${institution}`;
    }
    case "certifications": {
      const entry = profile.certifications[index];
      if (!entry) return null;
      const issuer = entry.issuer ? ` (${entry.issuer})` : "";
      return `Certification: ${entry.name}${issuer}`;
    }
    case "languages": {
      const entry = profile.languages[index];
      if (!entry) return null;
      const proficiency = entry.proficiency ? ` — ${formatEnum(entry.proficiency)}` : "";
      return `Language: ${entry.label}${proficiency}`;
    }
    default:
      return null;
  }
}

function formatEnum(value: string): string {
  return value.replace(/_/g, " ");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
