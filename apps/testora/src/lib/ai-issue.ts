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
  "You are a senior QA engineer triaging a failed automated end-to-end test.",
  "Write a clear, actionable GitHub issue an engineer can act on.",
  "Infer the most likely cause from the error and name concrete next steps.",
  "Keep it concise — no padding, no invented details beyond the data given.",
  'Respond ONLY as JSON: {"title": string, "body": string}.',
  "The title is one line, prefixed with [e2e]. The body is GitHub-flavoured markdown",
  "with short sections: Summary, Likely cause, Steps to reproduce, Suggested fix.",
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
