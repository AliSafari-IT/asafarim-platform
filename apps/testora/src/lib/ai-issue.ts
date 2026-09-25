import "server-only";
import { buildIssueDraft, type IssueDraft, type IssueFacts } from "@/lib/issue-template";

// AI-assisted issue authoring via the OpenAI Chat Completions API. Kept
// dependency-free (plain fetch) and server-only so OPENAI_API_KEY never reaches
// the browser. Everything degrades gracefully to the deterministic template
// (buildIssueDraft) when the key is missing or the call fails.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
// Bound the error text we send so a giant stack trace can't blow the token budget.
const MAX_ERROR_CHARS = 4000;

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const SYSTEM_PROMPT = [
  "You are a senior QA engineer writing up a failed automated end-to-end test as a GitHub",
  "issue for a JUNIOR developer who is new to this codebase to pick up and fix.",
  "Write in plain language: don't assume familiarity with the app, spell out acronyms/jargon",
  "the first time you use them, and explain WHY the test matters, not just what broke.",
  "Infer the most likely cause from the error when you reasonably can, and say what to check",
  "first — but never invent file names, function names or a root cause you can't support from",
  "the data given; if you're not sure, say so and suggest where to start looking instead.",
  "Keep it tight and scannable — short paragraphs and bullet points, no filler.",
  'Respond ONLY as JSON: {"title": string, "body": string}.',
  "The title is one line, prefixed with [e2e]. The body is GitHub-flavoured markdown, and MUST",
  "use exactly these section headings, in this order, matching the project's own bug-report",
  "template: '## Bug description', '## App/Package affected', '## Steps to reproduce',",
  "'## Expected behavior', '## Actual behavior', '## Environment', '## Logs/Error messages',",
  "'## Additional context'. Steps to reproduce should explain how to re-run this exact test in",
  "Testora (Run Tests page), not manual browser steps, since this failure came from an",
  "automated run. Logs/Error messages must include the raw error in a fenced code block,",
  "verbatim, not summarized.",
].join(" ");

/** A markdown footer appended to AI output so provenance/screenshot info isn't lost. */
function footer(facts: IssueFacts): string {
  const parts = ["", "---"];
  if (facts.screenshot) {
    parts.push("_A failure screenshot was captured at run time; attach it from the issue page if needed._");
  }
  parts.push("_Drafted with AI from a testora result._");
  return parts.join("\n");
}

export interface GeneratedIssue extends IssueDraft {
  /** true when the text came from the model, false when it's the template fallback. */
  ai: boolean;
}

/**
 * Produce an issue draft for a failed result. Uses OpenAI when configured,
 * otherwise (or on any error) returns the deterministic template so the caller
 * always gets usable content.
 */
export async function generateIssueDraft(facts: IssueFacts): Promise<GeneratedIssue> {
  const key = process.env.OPENAI_API_KEY;
  const fallback = buildIssueDraft(facts);
  if (!key) return { ...fallback, ai: false };

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const userPayload = {
    app: facts.projectName ?? null,
    testCase: facts.caseTitle,
    fixture: facts.fixtureTitle,
    suite: facts.suiteTitle,
    requirement: facts.frTitle,
    status: facts.status,
    target: facts.targetBaseUrl ?? null,
    durationMs: facts.durationMs ?? null,
    when: facts.createdAt,
    error: (facts.errorMessage ?? "No error message captured.").slice(0, MAX_ERROR_CHARS),
    hadScreenshot: Boolean(facts.screenshot),
  };

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
      // Don't let a slow model hang the request indefinitely.
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return { ...fallback, ai: false };
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { ...fallback, ai: false };

    const parsed = JSON.parse(content) as { title?: unknown; body?: unknown };
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    if (!title || !body) return { ...fallback, ai: false };

    return { title, body: `${body}\n${footer(facts)}`, ai: true };
  } catch {
    return { ...fallback, ai: false };
  }
}
