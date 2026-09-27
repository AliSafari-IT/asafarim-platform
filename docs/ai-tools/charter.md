# ASafarIM AI Workbench — product charter

**Status:** Accepted
**Date:** 2026-09-27
**Issue:** [#671](https://github.com/AliSafari-IT/asafarim-platform/issues/671) (AIT-001), part of epic [#670](https://github.com/AliSafari-IT/asafarim-platform/issues/670)

This is the product and information-architecture contract for the public AI
tools at `asafarim.com/tools`. It is written before any shared UI or provider
code exists so that those implementations follow decisions made here, rather
than making them by accident. Anything later issues build (#672–#684) must be
consistent with this document; if it needs to change, change it here first.

---

## 1. The promise

> **Free, reviewable AI tools that turn messy input into usable work.**

A visitor pastes something they already have — requirements, meeting notes, a
block of prose — and leaves with a structured, editable work artifact they can
export or continue in a full app. They get that result without signing in,
without being asked to hire anyone first, and without their text being kept.

### Audience

| Who | What they come for | What they should leave with |
|---|---|---|
| **Practitioners** — QA engineers, developers, product/project leads, researchers, students | A specific job done quickly on their own material | A reviewed, exported artifact (Markdown/CSV/JSON) or a handoff into Testora, TasksAI, or TimelineAI |
| **Evaluators** — hiring managers, technical collaborators, prospective clients | Evidence of how Ali builds AI systems | A working tool, then the Showcase case study with its contracts, evals, and limits |

Practitioners are the primary audience. Every page is designed for them first.
Evaluators are served *by* the practitioner experience being good, and by
links that appear after the result — never by gating or interrupting it.

### Portfolio intent

The Workbench is portfolio work, and it says so plainly. Its value to Ali is
indirect: a stranger who got something useful is more likely to read how it
was built. That only works if the tools are genuinely useful, so:

- The primary call to action on every tool page is **run the tool**.
- Author, case-study, and contact links appear **after** the result.
- Tools are not described as commercial services, and fixture results are
  never described as production usage (same honesty rule as the
  `ShowcaseProject` block in `packages/auth/src/apps.ts`).

---

## 2. Where things live

One public front door, with each surface doing one job.

| Surface | Owns | Does **not** own |
|---|---|---|
| **`apps/web` → `/tools`** | Stable and beta public tools: discovery, the tool pages, anonymous execution, export, and starting a handoff. Indexable. | Unfinished experiments, saved work, accounts, engineering deep-dives. |
| **`apps/labs`** | Prototypes and experiments with no reliability promise (`experiments/registry.ts`). Where a tool idea starts. | Anything marketed as a dependable tool. Labs pages are not the canonical home of a Workbench tool. |
| **`apps/showcase`** | Engineering evidence: architecture, contracts, eval method and reproducible results, limitations, security posture (#683). | Running tools. Showcase links to `/tools`; it does not embed a second copy. |
| **`apps/hub`** | Sign-in, only when a user chooses a handoff into an authenticated app. | Anything before first value. No tool requires Hub to produce a result. |
| **Dedicated apps** — Testora, TasksAI, TimelineAI (and ResuMatch etc.) | Persisted, authenticated, collaborative workflows. They receive handoffs and show an import preview (#678). | Being silently written to. Public tools never mutate them without an explicit, confirmed import by a signed-in user. |

Rules that follow from this table:

1. **A tool has exactly one canonical URL**, under `asafarim.com/tools/<slug>`.
   No new subdomain or app is created for a tool.
2. **Labs → Web is a promotion, not a copy.** When a Labs experiment becomes a
   Workbench tool, the Labs entry links to the tool page (or is archived); the
   two do not diverge in parallel.
3. **Web → dedicated app is a graduation**, justified only by usage data (§5).
   Until then, the deeper workflow is served by handing off to an existing app.
4. **Showcase describes shipped behavior.** Roadmap intent is labelled as such
   or left out.

---

## 3. MVP tools

Three tools, each a narrow job with a clear "done" state and an existing full
app to continue in. Each is a vertical slice of the same platform (#672/#673),
so the second and third tools reuse what the first one proves.

### 3.1 Requirements → Test Plan ([#675](https://github.com/AliSafari-IT/asafarim-platform/issues/675))

- **User:** a QA engineer, developer, or product owner holding a user story,
  acceptance criteria, or a short spec.
- **Completed job:** "I have a reviewable test plan whose every case traces back
  to a line of my requirements, and I know which requirements were too vague
  to test."
- **Output:** test cases grouped by category (functional, edge, negative,
  accessibility, …), each citing the requirement it covers; an explicit list of
  ambiguities/open questions; no claim that anything was executed.
- **Done when:** the user has edited the plan and exported it (Markdown/CSV) or
  started a Testora handoff.
- **Continue in:** Testora.

### 3.2 Notes → Action Plan ([#676](https://github.com/AliSafari-IT/asafarim-platform/issues/676))

- **User:** anyone leaving a meeting, a brainstorm, or a messy planning doc.
- **Completed job:** "My notes are now a list of concrete actions, with the
  dependencies and risks made explicit, and I can see which note each action
  came from."
- **Output:** actions with evidence excerpts; dependencies forming an acyclic
  graph; risks, decisions, milestones (checkpoints, never dates) and open
  questions. Deadlines appear **only if the notes state them**, quoted as facts
  — never invented. The plan **never assigns people**, even when the notes name
  someone next to the work: that ownership stays visible in the quoted notes
  and decisions for the reader to act on. Every item is labelled as from the
  notes, from the user's own constraints, inferred, or a suggestion.
- **Done when:** exported or handed off.
- **Continue in:** TasksAI.

### 3.3 Text → Cited Timeline ([#677](https://github.com/AliSafari-IT/asafarim-platform/issues/677))

- **User:** a researcher, student, journalist, or analyst with prose that
  contains events.
- **Completed job:** "Every event in this text is on a timeline, each cites the
  sentence it came from, dates keep the precision the text actually gave, and
  conflicting accounts are flagged instead of silently resolved."
- **Output:** events with source quote, date **at its stated precision**
  (year / month / day / approximate / range — "spring 1990" never becomes
  `1990-04-01`), and conflicts for review. Dates use TimelineAI's own
  contract and parser from `@asafarim/timeline-contract`: the model only
  copies the date phrase, and the server decides its precision. Accepted
  events export in TimelineAI's versioned import format
  (`timelineai-events/1`), which a TimelineAI test validates against its
  own schemas.
- **Done when:** exported or handed off.
- **Continue in:** TimelineAI.

### Shared output contract (all tools)

Every result distinguishes, visibly and in its schema:

- **Extracted** — present in the input; carries a source excerpt.
- **Inferred** — reasoned from the input; labelled as inference.
- **Uncertain / missing** — flagged for the user rather than filled in.

Results are proposals. The user reviews and edits them before anything is
exported or handed off.

---

## 4. Lifecycle

Every tool in the registry (#672) has exactly one lifecycle state. The state is
derived from evidence, not chosen as a label.

| State | Meaning to a visitor | Listed on `/tools` | Indexable | Live provider calls |
|---|---|---|---|---|
| `experiment` | "Early; may change or disappear." | Only in a clearly separated "experimental" section, if at all | No | Allowed only with experiment-level quotas |
| `beta` | "Works and is tested; rough edges are documented." | Yes, with a Beta badge | Yes | Yes, within quotas |
| `stable` | "Dependable; changes are versioned." | Yes | Yes | Yes, within quotas |
| `paused` | "Temporarily unavailable" — explanatory page and examples stay up | Yes, marked paused | Yes (page is still useful) | No (fixture examples only) |
| `retired` | "No longer offered" — page explains why and points to an alternative | No | No (redirect or `noindex` + link to alternative) | No |

Relationship to Labs: Labs keeps its own statuses (`prototype`, `active`,
`beta`, `paused`, `archived`). A Labs experiment enters the Workbench only by
meeting the `beta` gate below; it does not inherit a Workbench state from its
Labs status.

### 4.1 Promotion gates

Each gate is a checklist a reviewer can verify from the repo, CI, or a linked
report. A tool may not be registered in a state whose gate it has not passed.

**→ `experiment`** (entry into the Workbench registry)
- [ ] Named owner.
- [ ] Input and output schemas (Zod) exist and are versioned.
- [ ] At least one committed fixture that runs with no API key.
- [ ] Page states limitations and that the tool is experimental.

**→ `beta`** (everything above, plus)
- [ ] Eval suite (#679) covers normal, ambiguous, sparse, contradictory,
      over-limit, and prompt-injection cases, and passes the tool's thresholds
      in fixture mode in CI.
- [ ] Unsupported-claim and false-precision rates are reported separately and
      are at or below the tool's documented thresholds.
- [ ] Threat-model review (#680) completed for this tool: input caps, rate
      limit, timeout, spend ceiling, kill switch, safe rendering, redacted logs.
- [ ] Retention for this tool is documented and matches the privacy copy.
- [ ] Analytics events instrumented from the allowlist only (#682).
- [ ] Unit, component, and fixture-mode E2E tests pass; axe shows no
      serious/critical violations; the primary workflow works keyboard-only.
- [ ] Page metadata, canonical URL, and people-first content complete (#681).
- [ ] Operational runbook entry: env vars, kill switch, quotas, rollback.
- [ ] At least one export format works end to end.

**→ `stable`** (everything above, plus)
- [ ] At least 30 days in `beta` with live calls enabled.
- [ ] Live successful-result rate ≥ 90% of started live runs over the last
      30 days (failures from rate limits the user hit are excluded; provider
      and invalid-output failures are not).
- [ ] No open P0/P1 bug or security issue against the tool.
- [ ] Output schema has not had a breaking change in the last 30 days, and
      breaking changes from here on bump the tool version.
- [ ] Showcase case study published (#683) and linked from the tool page.

### 4.2 Demotion and retirement

These are triggers, not suggestions. When one fires, the state changes and
the change is noted in the tool's changelog entry.

- **→ `paused`** immediately, by kill switch, when any of: a suspected data
  leak; a security issue rated high/critical; daily spend ceiling reached;
  provider outage; eval regression below the `beta` thresholds on `main`.
  Pausing never takes the explanatory page offline.
- **`stable` → `beta`** when the live successful-result rate falls below 90%
  over a rolling 30 days, or a breaking schema change ships.
- **→ `retired`** when any of:
  - fewer than 20 successful runs in each of two consecutive 30-day review
    periods (§5.3) **after** 90 days in `beta`/`stable`;
  - `paused` for more than 30 days without a fix in progress;
  - the job is better served by a dedicated app the tool now links to.

  Retired tools keep a short page explaining what happened and where to go
  instead, so inbound links do not dead-end.

---

## 5. Success measures

Catalogue size is **not** a success metric. Page views alone are not a success
metric. The measures below are what the 30/60/90-day reviews look at; the
event taxonomy that produces them is defined in #682.

### 5.1 Per-tool metrics

| Metric | Definition | Why it matters |
|---|---|---|
| **Activation rate** | tool page views → at least one run started | Is the page understandable and the input low-friction? |
| **Successful-result rate** | runs started → valid result shown, split by `fixture` vs `live` | Is the tool reliable? Fixture success never counts toward live success. |
| **Useful-action rate** | successful results → edited, exported, or handed off | Did the output actually become work? This is the headline measure. |
| **Export/share rate** | successful results → export, by format | Which formats people need. |
| **Full-app handoffs** | handoffs started and completed, per destination | Does the continuation path work, and is it wanted? |
| **Case-study visits** | tool page or result → Showcase case study | Evaluator interest, reached *after* value. |
| **Qualified contact conversions** | contact opened from a tool/case-study context and resulting in a real enquiry (counted manually at review) | The portfolio outcome — tracked, not optimised at the user's expense. |
| **Cost per successful live run** | server-side cost events (`@asafarim/ai-cost-ledger`) ÷ successful live runs | Is the tool affordable to keep free? |
| **Organic discovery** | non-brand search impressions/clicks to tool pages (Search Console) | Is the tool findable by people who need the job done? |

Baselines are captured before launch (#682): current non-brand
impressions/clicks for `asafarim.com`, homepage and Showcase traffic, and
contact-form volume. Without a baseline, no before/after claim is made.

### 5.2 What never goes into measurement

Input text, output text, excerpts, prompt content, emails, IP addresses,
handoff ids, and free-form provider errors are never sent to analytics. Only
low-cardinality properties (tool slug, tool version, mode, lifecycle, export
format, allowlisted outcome category) are allowed. Bot, internal, and
fixture traffic is separated so it cannot inflate decisions.

### 5.3 Review cadence

At 30, 60, and 90 days after the first tool reaches `beta`, and every 90 days
after that, a short review records, per tool: activation, successful-result
rate (fixture/live), useful-action rate, failure categories, cost per
successful run, organic discovery, handoffs, and qualified conversions — and
applies the lifecycle rules in §4.

### 5.4 Rule for commissioning a fourth tool

A fourth tool (e.g. from the deferred list in #670: JD → skills evidence map,
AI cost estimator, document change analyzer) is **not** started until a review
shows **all** of:

1. At least two of the three MVP tools are `beta` or `stable`.
2. Across the MVP tools, at least 200 successful live runs in the review
   period, with a combined useful-action rate ≥ 30%.
3. Cost per successful live run is within the budget recorded in the
   operational runbook.
4. No MVP tool has an open P0/P1 issue.
5. The proposed tool has a written job statement in the format of §3, an
   existing full app or explicit reason it needs none, and a fixture plan.

If the MVP tools are not meeting these, the next work goes into improving them,
not adding to the catalogue.

The thresholds in §4 and §5.4 are starting values. They may be revised at a
review with the reasoning recorded in this document — not quietly adjusted to
fit the numbers.

---

## 6. User-facing promises

These are written in the words a visitor will see. Implementation (#673,
#678, #680) must make each one true, and the privacy page must be updated to
match before the first tool is `beta`.

**No sign-in needed.**
> You can try every tool without an account. Signing in is only needed if you
> choose to continue your result in one of our full apps.

**What happens to your text.**
> We send your text to an AI provider to generate the result, and then we
> don't keep it. We don't store your input or result on our servers, and we
> don't put them in our analytics. If you choose to continue in a full app,
> we hold the result you selected briefly so that app can import it — and only
> after you sign in and confirm.

**Please don't paste secrets.**
> Don't paste passwords, API keys, or sensitive personal information. We don't
> keep your text, but it does pass through an AI provider to produce your
> result.

**AI disclosure.**
> This tool uses AI to draft a proposal from your text. It can be wrong or
> incomplete. Items marked "from your text" quote the part they came from;
> items marked "inferred" are the AI's reasoning, and "needs your input" means
> the text didn't say.

**You stay in control.**
> Nothing is saved, sent, or published until you choose to. You can edit
> everything before you export it, and nothing is added to another app unless
> you review it there and confirm the import.

**Examples and limits.**
> Examples run instantly with prepared sample results — they're labelled as
> examples. Live runs are limited per visitor to keep the tools free. If live
> generation is unavailable, we say so; we never show a sample as if it were
> your result.

---

## 7. Explicit exclusions

The Workbench will **not** include:

- **A generic chatbot** or open-ended "ask anything" box.
- **A generic summariser** — every tool completes a specific job with a
  structured, reviewable output.
- **Bulk SEO pages** — no auto-generated tool/keyword/location permutations,
  and no indexable pages of user results.
- **Auto-publish** — nothing a tool produces is posted anywhere on the user's
  behalf.
- **Hidden writes into platform apps** — no handoff without a signed-in user
  reviewing an import preview and confirming it.
- **Sign-in before first useful result.**
- **Retention of anonymous inputs/outputs** beyond the request, except the
  short-lived, single-use, user-initiated handoff described above.
- **Invented facts to fill gaps** — no fabricated assignees, deadlines, dates,
  test executions, testimonials, or usage numbers.

---

## 8. Related work, and why it is not duplicated here

- **[#12](https://github.com/AliSafari-IT/asafarim-platform/issues/12) —
  Content Intelligence Workbench.** A deeper, persisted analysis product. The
  AI Workbench tools are narrow, anonymous, single-shot jobs. If a tool's usage
  shows demand for saved, multi-document analysis, that is evidence for #12,
  not a reason to grow a public tool into it.
- **[#244](https://github.com/AliSafari-IT/asafarim-platform/issues/244) —
  TasksAI copilot expansion.** The in-app planning assistant for signed-in
  TasksAI users. Notes → Action Plan is the anonymous front door that hands off
  *into* TasksAI; it does not replicate the copilot's board-aware features.
- **[#298](https://github.com/AliSafari-IT/asafarim-platform/issues/298) —
  TimelineAI cited storytelling.** TimelineAI owns saved timelines, layouts,
  and storytelling. Text → Cited Timeline produces a one-off cited event list
  and hands it off; editing and presentation stay in TimelineAI.

The handoff contracts (#678) are the only shared surface with these apps, and
they are versioned so either side can change independently.

---

## 9. Open follow-ups surfaced while writing this charter

- The current privacy page (`apps/web/content/legal.ts`) does not mention
  Umami analytics or AI-tool processing. It must be updated to match §6 before
  any tool reaches `beta` (owned by #680).
- Workbench lifecycle states intentionally differ from the platform app
  registry's `active | coming-soon`. The tool registry (#672) should keep its
  own type rather than overloading `PlatformAppStatus`.
