import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import {
  Alert,
  Button,
  Card,
  FieldError,
  FormRow,
  Label,
  PageHeader,
  Select,
  Textarea,
  Input,
  ValidationSummary,
} from "@asafarim/ui";
import { requireActor } from "@/lib/auth/session";
import { STARTER_FAMILIES, STARTER_FAMILY_LABELS, VISIBILITIES, VISIBILITY_LABELS } from "@/lib/validation/createApp";
import { createAppAction } from "./actions";

export const metadata: Metadata = { title: "New app" };

interface NewAppPageProps {
  searchParams: Promise<{
    error?: string;
    name?: string;
    prompt?: string;
    starterFamily?: string;
    visibility?: string;
    fieldErrors?: string;
  }>;
}

export default async function NewAppPage({ searchParams }: NewAppPageProps) {
  // Route contract: this form records the user's *intent* (name, prompt,
  // starter family, visibility) as an initial draft awaiting configuration.
  // No AI interpretation happens here — that's M07. No registered
  // templates render here — that's M06. Session enforcement here is
  // defense-in-depth alongside proxy.ts.
  await requireActor({ callbackUrl: "/apps/new" });

  const params = await searchParams;
  const fieldErrors: Record<string, string[]> = params.fieldErrors
    ? safeParseFieldErrors(params.fieldErrors)
    : {};
  const hasErrors = params.error === "1";

  const values = {
    name: params.name ?? "",
    prompt: params.prompt ?? "",
    starterFamily: isStarterFamily(params.starterFamily) ? params.starterFamily : "blank",
    visibility: isVisibility(params.visibility) ? params.visibility : "private",
  };

  // Generated once per render of this page and carried through as a hidden
  // field — a double-click, browser back+resubmit, or network retry of the
  // *same* rendered form reuses this exact key, so createApp's idempotency
  // check (lib/repositories/apps.ts) collapses duplicates into one app
  // instead of minting a fresh key per attempt.
  const idempotencyKey = randomUUID();

  const summaryErrors = Object.entries(fieldErrors).map(([field, messages]) => ({
    fieldId: `field-${field}`,
    label: fieldLabel(field),
    messages,
  }));

  return (
    <>
      <PageHeader
        kicker="Create"
        kickerIndex="02"
        title="Describe your app"
        description="Tell AppBuilder what the app should manage. It never generates source code — only structured entities, pages, and roles from an allowlisted set."
      />

      <Alert tone="info">
        Creating an app starts an AI generation job automatically: your
        starter family selects a registered template, and your description
        is analyzed into structured requirements and applied as validated
        specification changes. You&apos;ll see live progress on the app page
        next, including any clarifying questions.
      </Alert>

      <Card title="New application">
        {hasErrors ? <ValidationSummary errors={summaryErrors} /> : null}

        <form action={createAppAction} noValidate>
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

          <FormRow>
            <Label htmlFor="field-name">Application name</Label>
            <Input
              id="field-name"
              name="name"
              defaultValue={values.name}
              required
              maxLength={80}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={fieldErrors.name ? "field-name-error" : "field-name-hint"}
            />
            {fieldErrors.name ? (
              <FieldError id="field-name-error">{fieldErrors.name.join(" ")}</FieldError>
            ) : (
              <p id="field-name-hint" className="ui-hint">
                Shown across the catalog and in navigation. 2–80 characters.
              </p>
            )}
          </FormRow>

          <FormRow>
            <Label htmlFor="field-prompt">Business description / initial prompt</Label>
            <Textarea
              id="field-prompt"
              name="prompt"
              defaultValue={values.prompt}
              required
              rows={6}
              maxLength={4000}
              aria-invalid={fieldErrors.prompt ? true : undefined}
              aria-describedby={fieldErrors.prompt ? "field-prompt-error" : "field-prompt-hint"}
            />
            {fieldErrors.prompt ? (
              <FieldError id="field-prompt-error">{fieldErrors.prompt.join(" ")}</FieldError>
            ) : (
              <p id="field-prompt-hint" className="ui-hint">
                Describe what this app should manage, in plain language.
                An AI generation job analyzes this into structured
                requirements — entities, pages, and roles — never source
                code, and asks follow-up questions if anything essential is
                missing.
              </p>
            )}
          </FormRow>

          <FormRow>
            <Label htmlFor="field-starterFamily">Starter family</Label>
            <Select
              id="field-starterFamily"
              name="starterFamily"
              defaultValue={values.starterFamily}
              options={STARTER_FAMILIES.map((family) => ({
                value: family,
                label: STARTER_FAMILY_LABELS[family],
              }))}
              aria-describedby="field-starterFamily-hint"
            />
            <p id="field-starterFamily-hint" className="ui-hint">
              Selects the registered starter template generation begins
              from — the AI may recommend a better-fitting one if your
              description suggests it.
            </p>
          </FormRow>

          <FormRow>
            <Label htmlFor="field-visibility">Visibility</Label>
            <Select
              id="field-visibility"
              name="visibility"
              defaultValue={values.visibility}
              options={VISIBILITIES.map((visibility) => ({
                value: visibility,
                label: VISIBILITY_LABELS[visibility],
              }))}
              aria-describedby="field-visibility-hint"
            />
            <p id="field-visibility-hint" className="ui-hint">
              You can invite collaborators with specific roles after
              creation regardless of this choice.
            </p>
          </FormRow>

          <Button type="submit">Create draft application</Button>
        </form>
      </Card>
    </>
  );
}

function fieldLabel(field: string): string {
  switch (field) {
    case "name":
      return "Application name";
    case "prompt":
      return "Business description";
    case "starterFamily":
      return "Starter family";
    case "visibility":
      return "Visibility";
    default:
      return "Form";
  }
}

function isStarterFamily(value: string | undefined): value is (typeof STARTER_FAMILIES)[number] {
  return !!value && (STARTER_FAMILIES as readonly string[]).includes(value);
}

function isVisibility(value: string | undefined): value is (typeof VISIBILITIES)[number] {
  return !!value && (VISIBILITIES as readonly string[]).includes(value);
}

function safeParseFieldErrors(raw: string): Record<string, string[]> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, string[]>;
  } catch {
    // fall through
  }
  return {};
}
