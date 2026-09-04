# JobMatch threat model — M1 baseline (JM-016)

Scope: the foundation shipped in M1, the CV pipeline shipped in M2, and the job ingestion shipped in M3 — the Next.js app, its dedicated
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

## M2 additions — the CV pipeline

M2 is the milestone where JobMatch starts holding the data this document was
written for. Three controls carry most of the weight.

### An unscanned document is treated exactly like an infected one

There is no state between "uploaded" and "scanned clean" from which a parser
can run. `lib/documents/pipeline.ts` encodes that as a state machine whose
only edge into an extractable state comes from `SCANNING`, and
`extractDocument` re-asserts it rather than trusting its caller. When no
scanner is configured the verdict is `unavailable`, which quarantines — the
default is never `clean`.

The dev escape hatch is deliberately awkward: it is selected by the exact
literal `insecure-accept-all`, it is refused on any deployed environment
whatever the variable says, and it names itself on every document it clears
so those rows stay identifiable. A test asserts each of those three.

**Still open:** no ClamAV sidecar is deployed, so on the current production
stack every upload quarantines. That is the correct failure mode, and it
also means the CV pipeline is not usable in production until the sidecar
exists. Standing it up is deployment work, tracked under JM-018.

### The declared content type is never trusted

`lib/documents/fileType.ts` sniffs the bytes. A ZIP that is not an OOXML
Word document is rejected outright rather than falling through to the text
check — the header bytes of a JAR are valid UTF-8, so a fallthrough would
classify a renamed archive as a "CV". Encrypted PDFs are detected up front
so a worker never hangs on a password prompt. Filenames are display-only:
storage keys are `<workspaceId>/<uuid>.<ext>` and are never built from user
text.

### Protected attributes have nowhere to land

`lib/profile/contract.ts` is a strict schema with no field for age, date of
birth, nationality, gender, marital status, health, or a photograph — all of
which appear routinely on European CVs. Unknown keys are rejected, and a
second check rejects keys that read as protected attributes by name, so
adding one is a decision someone has to argue for rather than something that
slips through in a broader change. The API returns 422 and names the
offending key.

### Threats addressed in M2

| Threat | Control | Where |
|---|---|---|
| Malicious upload reaching a parser | State machine with a single scanned edge, re-asserted at the extraction entry point | `lib/documents/pipeline.ts`, `service.ts` |
| Fail-open scanning when the scanner is down | `unavailable` quarantines; no configuration means no clearance | `lib/documents/scanner.ts` |
| A dev fail-open shipped to production | Exact-literal opt-in, refused on deployed environments, self-identifying | `lib/documents/scanner.ts` |
| Renamed archive or executable treated as a document | Byte sniffing; a ZIP that is not a DOCX is terminal | `lib/documents/fileType.ts` |
| Path traversal through a filename | Keys derived from ids only; the filename is display metadata | `lib/documents/storage.ts` |
| CV link leaking through history or referrer | No presigned URLs; bytes stream through an authenticated route | `app/api/documents/[documentId]/file` |
| Quarantined file served back to its owner | The download route refuses `QUARANTINED` outright | same |
| CV bytes made world-readable by a bucket default | `acl: "private"` passed explicitly, against a `public-read` default | `lib/documents/storage.ts` |
| Special-category data stored or inferred | Strict schema with no such field, plus a name check | `lib/profile/contract.ts` |
| Extraction output silently driving matching | Matching reads only a candidate-confirmed version | `lib/profile/versions.ts` |
| Parser error message leaking document content | Parser errors are discarded, not logged; reason codes only | `lib/extraction/text.ts` |
| Malformed document retried forever | Retry budget on the row, so a restart does not reset it | `lib/documents/pipeline.ts` |
| Erasure leaving derived personal data behind | Erasure removes bytes, documents, and every profile version | `lib/profile/dataRights.ts` |
| Erasure leaving orphaned bytes | Objects deleted first and **read back to confirm**; only confirmed ids have their rows dropped | same |
| A row uploaded mid-erasure losing its row but keeping its bytes | Row deletion scoped to the enumerated, confirmed ids — never to the whole workspace | same |
| Upload failing after bytes are stored, leaving an unreferenced CV | The row is written before the bytes; the row is the only handle erasure has | `lib/documents/service.ts` |
| Retention promised but never enforced | `sweepExpiredDocuments` deletes expired originals; the route is disabled outright when its token is unset | `lib/documents/retention.ts` |
| A destructive action reported as done when the server refused it | Client handlers check `response.ok` before claiming success | `app/profile/*Panel.tsx` |
| Confirming a stale profile after an upload | The review form is keyed by version id, so new extraction replaces it | `app/profile/page.tsx` |
| A referee's contact details stored as the candidate's own | Emails are resolved against the detected name, and generic locals (info@, hr@) are deprioritised | `lib/extraction/profileExtractor.ts` |
| A misread layout filling the profile with text from the wrong part of the page | Section sizes are checked for plausibility; an implausible one marks the layout unreliable and section-derived fields are left empty | same |
| Decompression bomb producing unbounded text | Extraction output capped; every profile collection bounded | `lib/extraction/text.ts`, `contract.ts` |

### Deliberately not done in M2

**OCR.** It means running an image decoder and a recognition engine over an
untrusted document — large, historically memory-unsafe surfaces — and the
only process available to run them in is the one holding database
credentials and every signed-in session. A document with no text layer gets
an honest `NO_TEXT_LAYER` and the candidate types their profile instead.
`lib/extraction/ocr.ts` is the interface an isolated worker will implement.

**Model-based extraction.** Sending every candidate's CV to a model provider
is a disclosure decision JM-005 has not answered. The M2 extractor is
deterministic and local.

**Consent withdrawal as a distinct action.** Erasure is implemented; a
separate "withdraw consent but keep the account" flow waits for the consent
model itself, which is JM-008.

## M3 additions — job ingestion

M3 is where JobMatch starts making outbound requests on its own behalf and
storing other people's content. Two things change the risk picture, and the
controls follow from them.

### Nothing is fetched without a recorded agreement

`lib/ingestion/authorization.ts` is the whole of the "no unapproved scraping"
rule, expressed as a function. A sync is refused unless the source is ACTIVE,
explicitly enabled, carries an agreement reference, and that agreement has an
expiry which has not passed. `runSync` asks it first and makes no network
request when the answer is no.

Requiring an *expiry* is deliberate. An open-ended agreement would mean a
source is fetched forever because nobody revisited it; requiring an end date
means every source is re-examined on a known day, and the sync stops itself
rather than waiting to be switched off.

**No source ships enabled.** Choosing one and agreeing its terms is JM-003
and JM-004 — commercial and legal work, not engineering. The machinery is
built and tested; the register is empty on purpose.

### An endpoint is attacker-controlled input

A connector endpoint is operator-supplied configuration, which makes every
sync a potential server-side request forgery: point a source at the cloud
metadata service and it fetches credentials on the attacker's behalf.

`lib/ingestion/http.ts` is the only way ingestion reaches the network:

- HTTPS only, to a public address, re-checked at request time rather than
  only at configuration time.
- **Redirects are not followed.** A permitted host redirecting to a private
  address is the standard bypass, and re-validating each hop is more moving
  parts than refusing is worth.
- Response size cap and timeout, so a hostile or broken source cannot
  exhaust memory or hold a sync open.
- Fetch errors are never logged or surfaced: they embed the full URL, which
  for a partner API carries the key in its query string.

### Threats addressed in M3

| Threat | Control | Where |
|---|---|---|
| Fetching a source nobody agreed terms with | Authorization checked before any request; refusal recorded as a run | `lib/ingestion/authorization.ts`, `run.ts` |
| An agreement lapsing unnoticed | Expiry is mandatory and enforced; expiring soon is surfaced on the sources page | `authorization.ts`, `status.ts` |
| SSRF via an operator-supplied endpoint | Public-HTTPS-only policy, private ranges and metadata hosts blocked | `lib/ingestion/http.ts` |
| SSRF via redirect to a private address | Redirects refused outright, not followed | same |
| Credentials leaking through an error | Fetch errors discarded; reason codes only | same |
| A hostile or broken feed exhausting memory | Declared *and* actual size capped; record count capped | `http.ts`, `feedConnector.ts` |
| Breaching an agreed rate limit | Delay derived from the agreed rate; `Retry-After` obeyed; bounded backoff | `http.ts` |
| Re-fetching content that has not changed | Conditional requests with ETag and Last-Modified | same |
| Showing a candidate the same job three times | Deduplication by source id, URL, then canonical key; copies linked, not displayed | `lib/ingestion/dedupe.ts` |
| Displaying a copy from a source without reuse rights | Representative selection prefers the employer, then a source with commercial reuse granted | same |
| Wasting a candidate's time on a filled role | Freshness assessed from four separate dates, including silent disappearance | `lib/ingestion/freshness.ts` |
| Showing postings after an agreement ends | Source termination outranks every date | same |
| An unfixable normalization bug | Raw snapshots stored before parsing, so a fix is replayed rather than re-fetched | `run.ts` |
| Retaining a source's content indefinitely | Snapshot payloads dropped at the source's own retention window; the row and hash survive | `run.ts` |
| A source silently ceasing to sync | Every attempt writes a run row, including refusals | `run.ts`, `status.ts` |
| The sync endpoint being reachable by anyone | Shared-secret bearer token, constant-time compared; unset disables the route entirely | `app/api/ingestion/sync` |

### Deliberately not done in M3

**Prompt-injection defences for job text.** Descriptions are stored as the
source wrote them and are not yet fed to a model. That is JM-044, and it
lands with the matching work rather than before it.

**Browser-based or parser-based connectors.** Only JSON over HTTPS is
supported. Rendering a page to extract jobs means running a browser over
untrusted content, which needs the isolation JM-030 asks for and does not
have yet.

**Search and eligibility.** Postings are ingested but nothing displays them
to candidates. That is M4, and putting a job in front of someone before the
eligibility rules exist is how a product starts wasting the time it promised
to save.

## Test-data isolation

AppBuilder's integration suite once wiped a developer's database because it
had no separate test target. JobMatch inherits that lesson as a rule from
its first commit: unit tests touch no database at all, CI migrates a
throwaway container, and any future integration test must require an
explicit `JOBMATCH_TEST_DATABASE_URL` and refuse to run without it.

## Deferred — with the milestone that owns each

These are *not* mitigated yet, and no shipped code pretends otherwise.

| Threat | Owner |
|---|---|
| OCR exploitation via malformed documents (OCR not implemented; see M2 additions) | JM-019 |
| Prompt injection via job descriptions | JM-044 |
| Bulk extraction of jobs or profiles through search | JM-037 |
| Consent withdrawal as a distinct action (access, export, and erasure are done) | JM-008, JM-023 |
| Dependency scanning and an incident runbook | JM-016 remaining scope, M9 |

## Known limitations of this document

It has not been reviewed by external counsel or a security assessor. The
AI Act and Article 22 classification it will eventually depend on is JM-005
and is still open, so nothing here should be read as a compliance position.
