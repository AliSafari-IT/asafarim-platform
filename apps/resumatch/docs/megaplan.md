# ResuMatch megaplan — audit, issues, and future potential

> A full review of the app as it stands post-pivot (September 2026): what
> actually shipped, where the code doesn't keep the promises its docs make,
> what the deferred decisions are, and a prioritized backlog for growing
> ResuMatch from a polished showcase MVP into a genuinely useful product —
> while staying inside the two hard constraints the pivot established:
> **no fabricated facts, no job-board licensing** (see
> [`docs/threat-model.md`](threat-model.md) and
> [`docs/jm-001-licensing-decision.md`](jm-001-licensing-decision.md)).
>
> Effort figures are rough ordering aids (½d / 1d / 2–3d / week-scale), not
> estimates to schedule against.

## Where the app stands

Shipped and working:

- Candidate document pipeline: byte-sniffed uploads, ClamAV hard-gate
  (fail-closed), deterministic PDF/Word/text extraction plus an optional AI
  pass with degrade fallback, immutable profile versions, GDPR
  access/erasure.
- Five job-intake paths (URL fetch with SSRF posture or AI browsing, pasted
  text, pasted job-invitation email, PDF/DOCX upload, manual form) landing
  on one `TargetJob` shape.
- AI tailoring under the no-fabrication merge, proposal-review flow
  (`generate-preview` → edit → `generate-confirm`), per-run freeform
  instructions, deterministic coverage report + quality checklist.
- AI cover letters with tone/length controls, same review-before-save
  posture, own quality checks.
- Print-stylesheet PDF plus real DOCX export for resume and letter,
  generated from the same content source.
- Tailored-resume history with side-by-side compare; per-application
  tracking with a status stepper.
- Real `openai`/`anthropic` provider adapters for tailoring and cover
  letter behind the JM-005 gate; `fixture` default everywhere; shared
  monthly budget across all provider-call kinds.
- AI-call audit events surfaced to the platform admin console; a BullMQ
  worker skeleton in-repo.

That is a coherent, honest MVP. The sections below are what stands between
it and a real product.

---

## Findings — broken promises and defects

### P0 — the app currently contradicts its own guarantees

**F1. The GDPR export is incomplete.**
`lib/profile/dataRights.ts`'s `exportWorkspaceData` states its premise in
its own doc comment — "if ResuMatch stores it, the export contains it" —
and then omits:

- `CoverLetter` rows (they carry the candidate's name and a letter they
  reviewed — personal data by any reading);
- `Application` rows (status, candidate-typed `notes`, `followUpDate`);
- `AiUsageLedger` rows;
- `TargetJob.structuredFields` — the manual-entry form's JSON, which can
  hold contact details the candidate typed;
- `TailoredResume.instructions` — the candidate's own freeform text.

`eraseWorkspaceData` *does* remove cover letters and applications — via the
`TargetJob` cascade — but `ErasureResult` never counts or reports them, and
`AiUsageLedger` rows (workspace id, provider, model, token counts) survive
erasure with no documented decision about whether that's a deliberate
billing-trail keep or an oversight. Either way it should be stated, not
silent.

*Effort: ~1d.* Add the missing collections to `DataExport`, count the
cascade-deleted rows in `ErasureResult`, record the ledger decision in
code comment + threat model.

**F2. `RESUMATCH_AI_PROVIDER=anthropic` is half-wired.**
The tailoring (`lib/tailoring/ai/providers/anthropic.ts`) and cover-letter
(`lib/tailoring/ai/coverLetter/providers/anthropic.ts`) adapters are real
implementations. But the extraction (`lib/extraction/ai/providers/
anthropic.ts`), summary-rewrite (`lib/profile/ai/providers/anthropic.ts`),
and job-fetch (`lib/tailoring/jobFetchAi/providers/anthropic.ts`) adapters
throw "not implemented yet". Selecting `anthropic` therefore makes
tailoring work while extraction, Summary rewrite, and job-URL browsing
silently degrade to fixture behavior — a configuration that *appears*
healthy and isn't.

*Effort: ½–1d per adapter, or ½d to refuse `anthropic` at boot until the
set is complete.* Prefer implementing — the OpenAI adapters establish the
pattern.

**F3. `README.md` overstates Anthropic coverage.**
The env table and tailoring bullet describe `openai`/`anthropic` as real
adapters for every AI call kind; per F2 that's true only for tailor +
cover letter.

*Effort: trivial.*

### P1 — dead code and stale references

**F4. `app/components/FeedbackForm.tsx` is dead pre-pivot code.**
It POSTs `jobPostingId` + eligibility reason codes to `/api/feedback` — a
route that no longer exists — and is rendered nowhere. A future reader
will assume the feedback feature works.

*Effort: trivial — delete.*

**F5. `proxy.ts` whitelists routes that don't exist.**
`/api/ingestion/sync` and `/api/ingestion/showcase` were removed with the
pivot. Harmless today; misleading forever.

*Effort: trivial.*

**F6. The in-app roadmap is stale.**
`app/roadmap/data.ts` still shows M6 claiming the review step is read-only
(it's editable since the proposal-review split, #429) and M7 "Real model
providers" as `planned` (shipped). Every post-pivot feature — cover
letters, applications, history/diff, exports — is absent from the page the
public can read at `/roadmap`.

*Effort: ½d.*

**F7. Schema comment drift.**
`AiUsageLedger.kind`'s comment says `"tailor" today`; the union is now
`tailor | extract | rewrite | fetch_job | cover_letter`
(`lib/tailoring/ai/quota.ts`).

*Effort: trivial — comment only, no migration.*

**F8. Issue #453 can be closed.**
Every tracked cover-letter sub-item shipped: generation (#430),
proposal-review (#454), tone/length (#474), quality checks (#475),
PDF/DOCX export (#457).

### P1 — security and privacy gaps

**F9. No rate limiting anywhere.**
The pivot removed the old search limiter with the search feature, and
nothing replaced it. The intake routes (`fetch-job` performs an outbound
fetch — SSRF-guarded, but still an authenticated bandwidth/CPU amplifier
against third parties; `upload-job` ingests files; `paste-*`/`manual-job`
write rows) and the AI routes have no per-workspace throttle. The only
brake on AI spend is the monthly USD budget — a burst can consume it in
minutes, and nothing stops a session from issuing `fetch-job` calls in a
loop. The pre-pivot in-memory limiter pattern (`lib/search/rateLimit.ts`,
deleted) is the shape to restore — per-workspace sliding window, stated
single-instance limitation, Redis-backed once the worker is deployed.

*Effort: 1–2d.*

**F10. No granular deletion.**
A candidate cannot delete a single `TargetJob`, `TailoredResume`,
`CoverLetter`, or `Application` — only erase the whole workspace. There is
no `DELETE` on `tailor/[id]` or `cover-letter/[id]` (only `docx`
subroutes), and `applications/[id]` is PATCH-only. GDPR's erasure right is
met at workspace granularity, but "delete this one embarrassing attempt"
is table stakes for a real product — and deleting a `TargetJob` is also
the only way to drop its stored posting text (F11).

*Effort: 1–2d.* DELETE routes + UI affordances + audit events; FK posture
is already friendly (`Application.tailoredResumeId` is `SetNull`).

**F11. `TargetJob.rawText` has no retention.**
Uploaded documents get a 90-day sweep (`lib/documents/retention.ts` +
`retainUntil`); fetched/pasted third-party posting text lives forever with
no sweep and no way to delete it (F10). It's public content, so the
privacy stakes are lower than CVs — but it's third-party content held
indefinitely, and it grows without bound.

*Effort: ½d.* Reuse the sweep pattern; keep linked `TailoredResume`s
honest about their source disappearing (they already carry merged content,
so nothing breaks — just note it).

### P2 — architecture and operational debt

**F12. Everything heavy runs synchronously on the request path — and the
worker isn't deployed.**
Malware scan + extraction run inside the upload request; two parallel
provider calls run inside `generate-preview` under `maxDuration = 60`.
`worker/index.ts` exists but consumes only `health-ping`/`noop`, and there
is **no `resumatch-worker` service in `docker-compose.prod.yml` and no
worker target in `apps/resumatch/Dockerfile`** — vionto, appbuilder, and
tasks-ai all have one. Fine at showcase scale; the moment a real provider
is on and a tailoring call plus a cover-letter call contend inside one
request, the 60s ceiling becomes a real failure mode.

*Effort: ~½d to deploy the worker (compose service + Dockerfile target);
3–5d to move scan/extract/tailor onto queues with job-status polling.*

**F13. ClamAV signature database isn't persisted.**
Every container restart re-downloads the full signature set via
`freshclam`, and uploads quarantine for the minutes that takes
(documented in the threat model). A named volume at `/var/lib/clamav`
closes it.

*Effort: ½d.*

**F14. Two ~840-line client components.**
`app/tailor/TailorFlow.tsx` (841) and `app/profile/ProfileWorkbench.tsx`
(845) each carry intake, review, and confirm concerns in one file. The
code works and is commented; the cost shows up the next time the flow
gains a step.

*Effort: 2–3d of careful extraction, best done alongside the next feature
that touches them rather than as a standalone refactor.*

**F15. No end-to-end coverage.**
`resumatch-ci.yml` runs typecheck, unit tests, and migration
apply/drift — all solid — but nothing exercises the tailor flow in a
browser. The platform's own answer exists (Testora); alternatively a thin
Playwright spec against the fixture provider covers upload → confirm →
preview → export deterministically for $0.

*Effort: 2–3d.*

**F16. English-only product aimed at a trilingual market.**
The Belgian audience is NL/FR/EN. `lib/tailoring/coverage.ts`'s stopword
lists are already trilingual and the deterministic extractor handles all
three, but UI copy, the quality-checklist heuristics (English action-verb
lists), and the generated output language are English-only.
`packages/shared-i18n` exists and Vionto already consumes it.

*Effort: 3–5d for UI i18n; output-language control is a prompt + review
change on top.*

**F17. `pgvector` base image kept for `resumatch-postgres`.**
Nothing uses vector columns since the pivot; the compose comment already
explains why swapping now would be churn on a live database. No action —
revisit only if the database is ever rebuilt.

### Deferred by design — kept visible, not re-litigated

These are deliberate gaps the threat model already owns; they appear here
so the megaplan is complete, not because they're new findings:

- **OCR** (`lib/extraction/ocr.ts` is a seam): image-only PDFs get an
  honest `NO_TEXT_LAYER`. Requires an isolated worker before any decoder
  runs on untrusted bytes (JM-019). Depends on F12.
- **Consent withdrawal as a distinct action** (JM-008): erasure exists;
  "withdraw but keep the account" waits on the consent model.
- **JM-005 classification sign-off** (open issue #419): real providers
  stay gated in deployed environments until this lands.
- **DPIA, incident runbook, dependency scanning** (M9 / JM-016 remainder):
  required before pilot-scale operation, not before a showcase.

---

## Future potential

Ranked roughly by leverage for a real user, all inside the two hard
constraints.

### Tracking & outcomes — make the loop close

- **Follow-up reminders.** `Application.followUpDate` exists and nothing
  consumes it. A daily digest ("3 applications past their follow-up
  date") via the platform's email/Reach plumbing turns a field into a
  feature. *(1–2d once a notification channel is chosen.)*
- **Outcome feedback loop.** Interview/offer already exist as statuses;
  surfacing "X% of tailored applications reached interview" back to the
  candidate is the honest version of the "success rate" every competitor
  fakes. *(1–2d; mostly UI over existing data.)*
- **ICS calendar export** for follow-up dates and interviews. *(½d.)*
- **Applications CSV export** — revive the old `My-Job` discipline
  (formula-escaped, versioned header, deterministic) for the tracking
  list. *(1d.)*

### Tailoring depth

- **Posting-change detection.** Re-fetch a `TargetJob`'s URL, hash the
  text, and flag "the posting changed since you tailored" — the analogue
  of the profile-side prompt below. *(1–2d.)*
- **Stale-profile prompt.** Tailored resumes pin `profileVersionId`; when
  the confirmed version moves on, offer a re-tailor instead of silently
  showing output derived from a profile that no longer exists. *(1d; the
  lineage is already in the schema.)*
- **Duplicate-posting detection.** Same job pasted twice (or fetched under
  two URLs) wastes budget and clutters history — hash `rawText`, warn,
  reuse. *(1d.)*
- **Interview-prep sheet** — a third artifact under the same fenced,
  no-fabrication contract: likely questions derived from the posting
  mapped onto the candidate's real experience. *(2–3d.)*
- **Skill-gap → learning suggestions.** The coverage report already
  computes which keywords the profile lacks; "honest gap → what to learn"
  is the natural readout. *(2–3d.)*

### Documents & presentation

- **More print templates + a picker.** `TailoredResume.templateKey` has
  waited for this since M5. *(2–3d.)*
- **True server-side PDF.** Today PDF is `window.print()`; DOCX is real.
  A rendering dependency (or a print-microservice) is the honest fix;
  weigh against "the browser does it fine" before committing. *(1–2d.)*
- **Application packet export** — resume + letter bundled per application
  (ZIP or merged PDF). *(1d.)*
- **Multiple named profile variants** per workspace ("frontend CV" vs
  "backend CV") — the version model already supports parallel confirmed
  lines in principle; this is mostly a `CandidateProfile` cardinality
  decision. *(2–3d, schema-affecting.)*

### Platform & operations

- **Deploy the worker, then move heavy work to it** — see F12; unlocks
  OCR, async tailoring, and scan-off-request-path in one stroke.
- **Per-workspace AI settings** — tasks-ai's `AiSettings` shape gives
  per-user budgets instead of one env-wide ceiling. *(1–2d.)*
- **Funnel telemetry** — upload → confirm → tailor → export → applied is
  already audit-evented; nothing aggregates it. An internal dashboard
  (admin console has the `internal/*` routes already) turns anecdote into
  signal. *(2d.)*
- **i18n (NL/FR)** — F16; the single biggest market-fit gap for the
  Belgian audience the business plan targets.

### Growth surface (optional, later)

- **Bookmarklet/extension** to push a job URL into ResuMatch without
  copy-paste. *(2d.)*
- **Read-only share link** for a tailored CV — careful: a public URL to
  personal data needs expiring, revocable tokens and a real reason to
  exist before it's worth the surface. *(Deferred unless asked for.)*

### Explicitly still out of scope

Job-board aggregation and resume-based job search (the licensing
dependency that killed the pre-pivot product), recruiter/employer-facing
features (AI Act high-risk territory, JM-005 unresolved), automatic
application submission, and any feature that would put unconfirmed words
in a candidate's history.

---

## Prioritized backlog

### P0 — fix what the docs promise (order within the group is free)

| # | Item | Effort |
|---|---|---|
| 1 | F1 — complete the data export; count erasure cascades; decide + document `AiUsageLedger` post-erasure | ~1d |
| 2 | F2 — implement the three Anthropic stub adapters (or boot-refuse `anthropic`) | ½–1d each |
| 3 | F4/F5/F7 — delete `FeedbackForm`, stale proxy routes, stale schema comment | ½d |
| 4 | F6 — refresh `app/roadmap/data.ts` | ½d |
| 5 | F3 — README Anthropic correction | trivial |
| 6 | F8 — close issue #453 | trivial |

### P1 — trust & safety before real users

| # | Item | Depends on | Effort |
|---|---|---|---|
| 7 | F9 — per-workspace rate limiting on intake + AI routes | — | 1–2d |
| 8 | F10 — granular delete for TargetJob/TailoredResume/CoverLetter/Application | — | 1–2d |
| 9 | F11 — retention sweep for `TargetJob.rawText` | pairs naturally with F10 | ½d |
| 10 | F13 — ClamAV named volume | — | ½d |
| 11 | Follow-up reminders consuming `followUpDate` | notification channel choice | 1–2d |
| 12 | F15 — e2e coverage of the core tailor flow (fixture provider) | — | 2–3d |

### P2 — growth features

| # | Item | Depends on | Effort |
|---|---|---|---|
| 13 | F12 — deploy `resumatch-worker` (compose + Dockerfile target) | — | ½d |
| 14 | Move scan/extract/tailor onto queues | #13 | 3–5d |
| 15 | More print templates + picker | — | 2–3d |
| 16 | Posting-change re-fetch + stale-profile re-tailor prompts | — | 2d |
| 17 | Interview-prep sheet + skill-gap suggestions | — | 2–3d each |
| 18 | F16 — i18n NL/FR for UI (+ output-language control) | `packages/shared-i18n` | 3–5d |
| 19 | Outcome feedback loop + funnel telemetry | — | 2–3d |
| 20 | Applications CSV + ICS exports | — | 1d |
| 21 | Server-side PDF / packet export / multi-variant profiles | evaluate need | 1–3d each |
| 22 | OCR in the isolated worker | #14 | 3–5d |

### P3 — legal/commercial gates (only if monetization is ever pursued)

JM-005 classification (#419), DPIA, candidate terms + privacy notice
(JM-008), consent model, incident runbook, dependency scanning, and a
fresh JM-001 review — the showcase license does not cover commercial
operation.

## Non-goals of this document

This megaplan describes what *could* be built and what's *broken*; it
commits nothing. Each backlog item still needs its own issue with
acceptance criteria — the numbering above is for reference, not a promise
of sequence.
