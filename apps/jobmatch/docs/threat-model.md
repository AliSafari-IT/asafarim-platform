# JobMatch threat model — M1 baseline (JM-016)

Scope: the foundation shipped in M1 — the Next.js app, its dedicated
PostgreSQL database, its use of platform SSO, and its logging. It is written
to be extended, not rewritten: each later milestone adds a section rather
than replacing this one.

Two things make JobMatch's risk profile different from the rest of the
platform, and both are the reason for the boundaries below:

- **CV data is the most sensitive data the platform will hold.** A CV is
  free text that routinely carries a name, address, date of birth,
  nationality, health information, and family details — much of it
  special-category data under GDPR Article 9 that nobody asked for.
- **Job content is untrusted input from third parties.** From M3, JobMatch
  ingests text written by strangers and, from M5, feeds it to a model. That
  makes every job description a potential prompt-injection payload.

## Assets

| Asset | Why it matters |
|---|---|
| Candidate documents (M2) | Special-category data; a breach is a reportable incident |
| Extracted profiles (M2) | Derived from the above; same sensitivity |
| Platform session (M1) | Grants access to every workspace surface |
| JobMatch database credentials (M1) | Direct access to all of the above |
| Source connector credentials (M3) | Disclosure breaches a source agreement, not just security |
| Model provider keys (M5) | Cost and data-exfiltration exposure |

## Trust boundaries in M1

1. **Browser to JobMatch.** Everything except the landing and legal pages
   requires a session. `proxy.ts` denies by default; the public list is
   explicit and short.
2. **JobMatch to platform identity.** JobMatch reads the session and never
   writes to the platform user table. It stores only the opaque user id.
3. **JobMatch to its own database.** A separate instance with separate
   credentials. The platform database has no JobMatch tables, and JobMatch
   holds no platform database credentials.
4. **JobMatch to logs.** All log and audit payloads pass through
   `lib/observability/redact.ts`, which is allow-list based.

## Threats addressed in M1

| Threat | Control | Where |
|---|---|---|
| Anonymous access to candidate surfaces | Deny-by-default proxy, sign-in at Hub | `proxy.ts` |
| Valid JWT for a deactivated account | `isActive` re-checked at the data boundary, not only in the proxy | `lib/workspace.ts` |
| IDOR on another candidate's workspace | No route accepts a workspace id; it is derived from the session only | `lib/workspace.ts` |
| CV text or credentials reaching a log sink | Allow-listed redaction, forbidden keys dropped entirely, applied inside the logger rather than at call sites | `lib/observability/` |
| Driver or connector error messages leaking connection strings | Errors are logged by class name only; the UI shows a digest, never `error.message` | `lib/observability/logger.ts`, `app/error.tsx` |
| Health endpoint disclosing infrastructure | Payload is up/down plus latency; asserted by test | `lib/health.ts` |
| A misconfigured environment silently using the platform database | No fallback from `JOBMATCH_DATABASE_URL` to `DATABASE_URL`; startup validation fails loudly | `lib/env.ts` |
| Indexing of an unlaunched product that has no candidate terms yet | `robots: { index: false }` until the M0 legal work lands | `app/layout.tsx` |

## Test-data isolation

AppBuilder's integration suite once wiped a developer's database because it
had no separate test target. JobMatch inherits that lesson as a rule from
its first commit: unit tests touch no database at all, CI migrates a
throwaway container, and any future integration test must require an
explicit `JOBMATCH_TEST_DATABASE_URL` and refuse to run without it.

## Deferred — with the milestone that owns each

These are *not* mitigated yet, and no M1 code pretends otherwise.

| Threat | Owner |
|---|---|
| Malicious uploads (macro documents, zip bombs, polyglot files) | JM-018, malware scanning and quarantine |
| Signed-URL leakage and object-storage IDOR | JM-017 |
| Parser and OCR exploitation via malformed documents | JM-019 |
| SSRF and proxy abuse from connectors | JM-030 |
| Prompt injection via job descriptions | JM-044 |
| Bulk extraction of jobs or profiles through search | JM-037 |
| Data-rights workflows (access, deletion, consent withdrawal) | JM-023 |
| Dependency scanning and an incident runbook | JM-016 remaining scope, M9 |

## Known limitations of this document

It has not been reviewed by external counsel or a security assessor. The
AI Act and Article 22 classification it will eventually depend on is JM-005
and is still open, so nothing here should be read as a compliance position.
