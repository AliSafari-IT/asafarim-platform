import { z } from "zod";
import { RESERVED_NAMES as SPEC_RESERVED_NAMES } from "@asafarim/appbuilder-schema";

/**
 * Server-side validation for the M05 prompt-first creation form. Shared by
 * the Server Action (app/apps/new) and the JSON API route (api/apps) so the
 * two entry points can never drift — this is the single place "what's a
 * legal app name / prompt / starter family / visibility" is decided.
 */

export const STARTER_FAMILIES = [
  "blank",
  "task_management",
  "crm",
  "inventory",
  "booking",
] as const;
export type StarterFamily = (typeof STARTER_FAMILIES)[number];

export const STARTER_FAMILY_LABELS: Record<StarterFamily, string> = {
  blank: "Blank internal business app",
  task_management: "Task / project management",
  crm: "CRM",
  inventory: "Inventory",
  booking: "Booking / operations",
};

export const VISIBILITIES = ["private", "team"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: "Private — only you, until you add collaborators",
  team: "Team — intended to be shared with collaborators you invite",
};

const MAX_NAME_LENGTH = 80;
const MIN_NAME_LENGTH = 2;
const MAX_PROMPT_LENGTH = 4_000;
const MIN_PROMPT_LENGTH = 10;

// Route segments and platform-meaning words a slug must never collide with —
// distinct from (and in addition to) the specification engine's own
// RESERVED_NAMES, because these are AppBuilder-route-specific ("new" would
// make an app resolve at the same path as /apps/new).
const ROUTE_RESERVED_SLUGS = new Set(["new", "apps", "api", "preview", "app", "index"]);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Deterministic slug derivation: lowercase, ascii-alnum + hyphen, collapsed. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base.slice(0, 64) : "app";
}

export function isReservedSlug(slug: string): boolean {
  return ROUTE_RESERVED_SLUGS.has(slug) || SPEC_RESERVED_NAMES.has(slug);
}

const NameSchema = z
  .string()
  .transform(normalizeWhitespace)
  .pipe(
    z
      .string()
      .min(MIN_NAME_LENGTH, `Name must be at least ${MIN_NAME_LENGTH} characters`)
      .max(MAX_NAME_LENGTH, `Name must be at most ${MAX_NAME_LENGTH} characters`)
      // No angle brackets — belt-and-suspenders against markup smuggling;
      // this is a display string, not HTML, anywhere it's rendered.
      .refine((v) => !/[<>]/.test(v), "Name cannot contain '<' or '>'"),
  );

const PromptSchema = z
  .string()
  .transform(normalizeWhitespace)
  .pipe(
    z
      .string()
      .min(MIN_PROMPT_LENGTH, `Description must be at least ${MIN_PROMPT_LENGTH} characters`)
      .max(MAX_PROMPT_LENGTH, `Description must be at most ${MAX_PROMPT_LENGTH} characters`)
      .refine((v) => !/[<>]/.test(v), "Description cannot contain '<' or '>'"),
  );

export const CreateAppInputSchema = z
  .object({
    name: NameSchema,
    prompt: PromptSchema,
    starterFamily: z.enum(STARTER_FAMILIES, {
      message: "Choose a valid starter family",
    }),
    visibility: z.enum(VISIBILITIES, { message: "Choose a valid visibility" }),
  })
  .superRefine((value, ctx) => {
    const slug = slugify(value.name);
    if (isReservedSlug(slug)) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: `"${value.name}" is a reserved name — please choose another`,
      });
    }
  });

export type CreateAppInput = z.infer<typeof CreateAppInputSchema>;

export interface FieldErrors {
  [field: string]: string[];
}

export interface ValidationFailure {
  ok: false;
  fieldErrors: FieldErrors;
  /** Non-sensitive input echoed back so the form can re-render what the user typed. */
  values: { name: string; prompt: string; starterFamily: string; visibility: string };
}

export interface ValidationSuccess {
  ok: true;
  data: CreateAppInput;
}

/** Validates raw (untyped) form/JSON input, never trusting field presence or type. */
export function validateCreateAppInput(raw: unknown): ValidationSuccess | ValidationFailure {
  const input =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const echo = {
    name: typeof input.name === "string" ? input.name.slice(0, MAX_NAME_LENGTH) : "",
    prompt: typeof input.prompt === "string" ? input.prompt.slice(0, MAX_PROMPT_LENGTH) : "",
    starterFamily: typeof input.starterFamily === "string" ? input.starterFamily : "",
    visibility: typeof input.visibility === "string" ? input.visibility : "",
  };

  const result = CreateAppInputSchema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }

  return { ok: false, fieldErrors, values: echo };
}
