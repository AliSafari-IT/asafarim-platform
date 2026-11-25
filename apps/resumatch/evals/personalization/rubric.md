# Personalization review rubric (#934)

Fixed rubric for the human review of real-provider output. Do not change a
definition between a baseline and a candidate review; a changed rubric is a
new rubric version and the comparison starts again.

Rubric version: `personalization_rubric@1`.

Review each item in `out/review.json` without looking at which variant it
is (sort by id, hide the `variant` field). Fill in every `review` field.

## relevance (1 to 4)

How well the headline, summary and bullets serve this job, using only what
the candidate's data supports.

| Score | Meaning |
|---|---|
| 1 | Mostly unrelated to the job, or the relevant experience is missing. |
| 2 | Some relevant points, but the strongest evidence for this job is absent or buried. |
| 3 | The relevant experience leads; minor misses. |
| 4 | Every requirement the candidate can support is addressed, best evidence first. |

## adherence (1 to 4)

How well the output follows the request: the note, the output language and
the rules (no invented facts, nothing claimed for an unmet requirement).

| Score | Meaning |
|---|---|
| 1 | Ignores the request or breaks a rule. |
| 2 | Follows part of it. |
| 3 | Follows it with small slips (wording, one sentence in the wrong language). |
| 4 | Follows it fully. |

## fabricated (yes or no)

Yes when any text claims a qualification, credential, employer, title,
date, number, language, leadership or management role that the case's
profile and confirmed evidence do not state. The case's `prohibitedClaims`
list is a reminder, not the full list. **One yes in a candidate item blocks
rollout.** A fabrication screen hit (`fabricationScreen: true` in the
provider report) must always be reviewed; mark `fabricated: false` only if
the phrase appears in a supported way (for example "no Kubernetes
experience" repeated from the profile).

## final text (edit burden)

Write what you would actually send in `finalHeadline`, `finalSummary` and
`finalBullets` (leave a field null when you would send it unchanged). Edit
burden is the word-level edit distance from the suggestion to your final
text. It is reported on its own and never inferred from whether a
suggestion was kept.

## reviewer

Your initials. Two reviewers on the same item: keep the lower relevance and
adherence scores, and fabricated = yes if either said yes.
