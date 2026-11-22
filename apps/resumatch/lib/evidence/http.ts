import { NextResponse } from "next/server";
import { EVIDENCE_INPUT_MESSAGES, EVIDENCE_SCOPES, MAX_EVIDENCE_ITEMS, parseEvidenceInput, type EvidenceInput, type EvidenceScope } from "./contract";
import type { EvidenceWriteError } from "./store";

/** Shared request parsing and error answers for the /api/evidence routes. */

export interface EvidenceWriteBody {
  input: EvidenceInput;
  scope: EvidenceScope;
  targetJobId: string | null;
  confirm: boolean;
}

export function parseEvidenceWriteBody(body: unknown): { ok: true; value: EvidenceWriteBody } | { ok: false; response: Response } {
  const raw = (body ?? {}) as Record<string, unknown>;
  const parsed = parseEvidenceInput(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: EVIDENCE_INPUT_MESSAGES[parsed.error], code: "EVIDENCE_INVALID", field: parsed.error }, { status: 400 }),
    };
  }
  // Default to this application (#929): background is an explicit choice.
  const scope = raw.scope === undefined ? "APPLICATION" : raw.scope;
  if (!EVIDENCE_SCOPES.includes(scope as EvidenceScope)) {
    return { ok: false, response: NextResponse.json({ error: "Invalid scope.", code: "EVIDENCE_INVALID", field: "scope" }, { status: 400 }) };
  }
  if (raw.targetJobId !== undefined && raw.targetJobId !== null && typeof raw.targetJobId !== "string") {
    return { ok: false, response: NextResponse.json({ error: "Invalid targetJobId.", code: "EVIDENCE_INVALID", field: "targetJobId" }, { status: 400 }) };
  }
  return {
    ok: true,
    value: {
      input: parsed.value,
      scope: scope as EvidenceScope,
      targetJobId: typeof raw.targetJobId === "string" ? raw.targetJobId : null,
      confirm: raw.confirm === true,
    },
  };
}

export function evidenceErrorResponse(error: EvidenceWriteError): Response {
  switch (error) {
    case "not_found":
      return NextResponse.json({ error: "That evidence no longer exists.", code: "EVIDENCE_NOT_FOUND" }, { status: 404 });
    case "job_not_found":
      return NextResponse.json({ error: "That job was not found.", code: "JOB_NOT_FOUND" }, { status: 404 });
    case "stale":
      return NextResponse.json(
        { error: "This evidence changed in another tab or window. Check the latest version and save again.", code: "EVIDENCE_STALE" },
        { status: 409 },
      );
    case "too_many":
      return NextResponse.json(
        { error: `You can keep up to ${MAX_EVIDENCE_ITEMS} evidence items. Delete one you no longer need first.`, code: "EVIDENCE_LIMIT" },
        { status: 409 },
      );
  }
}

export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid request body." }, { status: 400 }) };
  }
}
