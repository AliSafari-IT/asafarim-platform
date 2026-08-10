# EduMatch — the Learning Brief experience

EduMatch is not a tutor directory, a lead-generation site, or a booking app.
It is a personal learning assistant that understands where a student is
struggling, helps immediately where it can, and — when human support is
actually worth it — prepares, matches, books, and tracks the tutoring.

> "Show us what you are learning. We will help you understand it and find the
> right tutor when you need one."

This document describes how that journey is implemented. It supersedes the
single-shot inquiry intake (`/student/inquiry/new`), which remains in place for
existing inquiries.

## The journey

```
Ask → Understand → Clarify → Help now → Build brief → Confirm
    → Match (≤5) → Prepared proposals → Compare → Book → Learn → Track
```

| Step | Surface | Service |
| --- | --- | --- |
| Ask | `/student/learn` | `learning-briefs.startIntake` |
| Understand | — | `learning-intake.analyseIntake` |
| Clarify | one question per turn | `learning-brief.nextBriefQuestion` |
| Help now | inline in the transcript | `learning-intake` → `ImmediateHelp` |
| Build brief | `EduLearningBrief` (DRAFT) | `learning-briefs.persistAnalysis` |
| Confirm | brief review panel | `learning-briefs.confirmBrief` |
| Match | up to 5 tutors | `brief-matching.matchTutorsForBrief` |
| Invite | one quote request | `brief-flow.matchAndInvite` |
| Prepare | `/tutor/invites/[id]` | `lesson-proposals.getOrCreatePreparedProposal` |
| Compare | `/student/brief/[id]/compare` | `brief-flow.compareProposals` |
| Book | existing checkout | `quotes.acceptQuote` + Stripe |
| Track | `/student/journey` | `learning-journey` |

## Data model

| Model | Purpose |
| --- | --- |
| `EduLearningBrief` | The structured learning need. DRAFT → CONFIRMED → MATCHED → ARCHIVED. |
| `EduIntakeTurn` | One conversational turn. QUESTION turns record which brief field they targeted. |
| `EduMatchCandidate` | A selected tutor with the persisted score breakdown and reasons. |
| `EduQuote` (extended) | Now doubles as the prepared proposal: plan outline, session count/length, mode, language, earliest start, cancellation policy, `sentAt`. |
| `EduSessionRecord` | What happened in a lesson: topics, summary, homework, next step, progress. |
| `EduReview` | One verified review per completed booking. |

`EduTutorProfile` gains matching signals (`languagesTaught`, `qualifications`,
`teachingStyle`, `weeklyAvailability`, `clearedForMinorsAt`,
`medianResponseMinutes`, `invitesReceived`, `proposalsSent`, `lastMatchedAt`).
`EduStudentProfile` gains `preferredLanguage`, `isMinor`, `guardianName`,
`guardianEmail`.

A confirmed brief also creates a legacy `EduInquiry` (with the brief rendered as
prose) so the existing quote, booking, payment, PDF, admin, and notification
plumbing keeps working unchanged.

Migration: `20260810180000_add_edumatch_learning_brief`.

## Design commitments

These are enforced in code and covered by tests, not just described here.

**Never pretend to understand the student's level.** The extraction prompt
instructs the model to omit anything the student did not say, every returned
field is re-validated against the brief schema individually, and `confidence`
is recomputed from *filled fields* (`computeBriefCompleteness`) rather than from
anything the model asserts. A hallucinated school year leaves
`educationalLevel` empty, which means the question still gets asked.

**One question at a time.** `BRIEF_REQUIREMENTS` is the interview script, in
order. `nextBriefQuestion` returns the first unfilled, un-asked requirement, and
`appliesTo` suppresses irrelevant questions (no "which city?" for an online-only
student). Asked fields are recoverable from the turn log, so we can prove we
never asked the same thing twice.

**Help before tutors.** The analysis returns `ImmediateHelp` — explanation,
worked example, practice questions, study steps, prerequisite gaps — and a
triage outcome. `SELF_STUDY` is presented as a complete outcome: the student
can take the plan and never book anything.

**The brief is the student's document.** Nothing is shared until
`confirmBrief`, every field is editable on the review screen, and student edits
always win over the AI's reading. Confirming and sharing are separate actions.

**At most five tutors, and position is not purchasable.**
`MATCH_WEIGHTS` contains exactly eight factors — subject, level, language,
mode, schedule, rating, responsiveness, proximity — all derived from verified
profile facts or platform-observed behaviour. There is no featured/boost/bid
term, and a test asserts the exact key set so one can't be added quietly. The
full breakdown is persisted on `EduMatchCandidate`, so any ranking a student saw
can be explained afterwards.

**Hard filters are eligibility, not score.** Subject, verification,
safeguarding clearance for minors, and (for in-person) reachability are gates
evaluated before scoring. `ineligibilityReason` returns *why* a tutor was
dropped, which powers the admin matching diagnostics.

**New tutors get a real chance.** A qualified verified tutor with no reviews
loses every rating-weighted comparison forever. The fifth slot is reserved for a
newcomer when the top four are all established, rotated by `lastMatchedAt` so it
circulates. Rotated-in tutors clear every hard filter and are labelled as such —
the bar isn't lowered, the door is widened.

**Nothing is ever sent on a tutor's behalf.** Prepared proposals are created as
`DRAFT` and are invisible to the student. Only `POST .../send` — an explicit
tutor action — stamps `sentAt` and moves the quote to `PENDING`. A tutor who
edits and closes the tab has published nothing.

**Invite-only.** Brief-driven quote requests can only be quoted by tutors in
`EduMatchCandidate`. Without this the five-tutor promise leaks the moment a
request id does.

**Verified reviews are structural.** `leaveReview` requires a `COMPLETED`
booking owned by the caller, and `bookingId` is unique. There is no `verified`
flag to forge — existence is the verification. Tutor ratings are recomputed from
reviews rather than incremented, so a removed review can't leave a stale
average.

**Academic integrity.** Every student message runs through the existing
moderation layer before it reaches a provider. A refused message never enters
the brief; the student sees the redirection text as an assistant turn.

## Degradation without an AI provider

With no `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`, `analyseIntake` falls back to a
deterministic keyword pass (`heuristicExtract` + `heuristicTriage`). The whole
flow — questions, brief, confirmation, matching, proposals, booking, journey —
still works end to end. The fallback is honest about knowing less: it fills only
what it can literally see in the text, which produces *more* follow-up
questions, never invented answers. It emits no `ImmediateHelp` rather than
fabricating a lesson.

This is also what makes the flow testable in CI without a model provider.

## API

Student:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/learning/briefs` | Start a conversation |
| `GET` | `/api/learning/briefs` | List own briefs |
| `GET` | `/api/learning/briefs/[id]` | Brief + full transcript |
| `PATCH` | `/api/learning/briefs/[id]` | Student corrections |
| `POST` | `/api/learning/briefs/[id]/messages` | Reply in the conversation |
| `POST` | `/api/learning/briefs/[id]/confirm` | Approve for sharing (contacts nobody) |
| `GET` | `/api/learning/briefs/[id]/matches` | Preview the ≤5 tutors |
| `POST` | `/api/learning/briefs/[id]/matches` | Invite them |
| `GET` | `/api/learning/briefs/[id]/proposals` | Comparison + factual differences |
| `GET` | `/api/student/journey` | Learning record and patterns |
| `POST` | `/api/bookings/[id]/review` | Verified review |

Tutor:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/tutors/invites` | Briefs matched to this tutor |
| `GET` | `/api/tutors/proposals/[quoteRequestId]` | Brief + prepared proposal |
| `PATCH` | `/api/tutors/proposals/[quoteRequestId]/quote` | Adjust the draft |
| `POST` | `/api/tutors/proposals/[quoteRequestId]/send` | Approve and send |
| `POST` | `/api/tutors/proposals/[quoteRequestId]/decline` | Pass on the request |
| `POST` | `/api/bookings/[id]/session-record` | Write up a lesson |
| `GET` | `/api/bookings/[id]/session-record` | Read it back (private notes: tutor only) |

`requireStudentAutoProvision` creates a minimal student profile on first
contact — the promise is value before paperwork. `gradeLevel` is deliberately
left empty rather than defaulted; the brief fills it in once the student says.

## North Star

**Completed Trusted Learning Sessions per month.** In the data model that is a
`COMPLETED` `EduBooking` with an `ATTENDED` `EduSessionRecord` — which is why
recording an attended session is what completes the booking.

Supporting metrics available from the current schema: proposals per request
(`EduQuote` sent per `EduQuoteRequest`), time to first tutor response
(`invitedAt` → `sentAt`), tutor acceptance rate (`proposalsSent` /
`invitesReceived`), booking conversion, lesson completion, repeat bookings,
goal progress (`EduSessionRecord.goalProgress`), and verified review scores.

## Not yet built

- Voice capture in the browser (audio *upload* works today and is transcribed by
  the existing Whisper path; live recording UI is not built).
- The interactive diagnostic step. `NEEDS_DIAGNOSTIC` is produced by triage and
  `diagnosticResult` exists on the brief, but the student-facing diagnostic
  currently resolves through more conversation rather than a dedicated exercise.
- Guardian approval flow for minors. The data (`isMinor`, `guardianName`,
  `guardianEmail`) and the safeguarding *match* filter are in place; the
  approval gate before payment is not.
- Localisation of the new strings beyond `en` and `nl`. `fr`, `de`, and `lb`
  fall back to English via the shared-i18n fallback until translated.
