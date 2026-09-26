import type { BadgeTone } from "@asafarim/ui";

/**
 * Presentation rules for ResuMatch's audit events on the admin console's
 * /audit-logs/resumatch page: a badge tone and a one-line summary per
 * event, so an operator reads "Saved → Offer" instead of unfolding a JSON
 * blob on every row. Pure, so it's unit tested on its own.
 *
 * Metadata is whatever ResuMatch's redactor let through (ids, statuses,
 * field names, flags — never free text), so every field is treated as
 * optional here: older rows predate some keys (e.g. `application.created`
 * used to carry only `jobId`).
 */

type Meta = Record<string, unknown>;

function str(meta: Meta, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** "INTERVIEWING" → "Interviewing". */
export function statusWord(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function asMeta(metadata: unknown): Meta {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Meta) : {};
}

export function resumatchActionTone(action: string, metadata: unknown): BadgeTone {
  if (action === "application.status_changed") {
    const to = str(asMeta(metadata), "toStatus");
    if (to === "OFFER") return "success";
    if (to === "REJECTED") return "danger";
    return "info";
  }
  if (action.includes("quarantined") || action.includes("failed") || action.includes("rejected")) return "danger";
  if (action.includes("deleted") || action.includes("delete")) return "warning";
  return "info";
}

const FIELD_LABELS: Record<string, string> = {
  notes: "notes",
  followUpDate: "follow-up date",
  tailoredResumeId: "linked CV",
};

/** A one-line, human summary of the event, or null when there's nothing more to say than the action name. */
export function describeResumatchEvent(action: string, metadata: unknown): string | null {
  const meta = asMeta(metadata);
  switch (action) {
    case "application.created": {
      const status = str(meta, "status");
      return status ? `Saved an application (${statusWord(status)})` : "Saved an application";
    }
    case "application.status_changed": {
      const from = str(meta, "fromStatus");
      const to = str(meta, "toStatus");
      if (!to) return "Changed an application's status";
      return from ? `${statusWord(from)} → ${statusWord(to)}` : `Moved to ${statusWord(to)}`;
    }
    case "application.updated": {
      const fields = str(meta, "changedFields");
      if (!fields) return "Edited an application";
      return `Edited ${fields
        .split(",")
        .map((field) => FIELD_LABELS[field] ?? field)
        .join(", ")}`;
    }
    case "tailoring.created":
    case "cover_letter.created": {
      const what = action === "tailoring.created" ? "Tailored a CV" : "Saved a cover letter";
      const language = str(meta, "outputLanguage");
      const parts = [language ? `in ${language.toUpperCase()}` : null, meta.degraded === true ? "degraded" : null];
      const extra = parts.filter(Boolean).join(", ");
      return extra ? `${what} (${extra})` : what;
    }
    default:
      return null;
  }
}
