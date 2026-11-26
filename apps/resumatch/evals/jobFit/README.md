# Job fit benchmark (#971)

Synthetic cases, every name, employer and posting invented. Nothing here
comes from a real candidate.

## What is measured

Three variants on the same cases (`run.ts`):

- **baseline**: what ResuMatch showed before #971. The key-term scope score
  of `assessJobFit` as the match, and the tailoring selection's requirement
  coverage as the per-requirement judgments.
- **keyword**: the new pipeline with the labelled *basic keyword analysis*
  (no AI): validation, `fit_rubric@1`, the gate.
- **model**: the new pipeline fed with a real provider's reply
  (`provider.ts`, by hand only).

Metrics: extraction recall (labelled requirements found), boilerplate
extracted, judgment accuracy (within the labelled set), false support
(`direct` where the label does not allow it), unknown treated as unmet,
match within the labelled range, suitability, a number shown where the
label says there is too little to judge, and stability (largest change in
the match when unrelated skills are added, skills are reordered or the
title is repeated). Reports carry ids, versions and numbers only.

`dev` cases were looked at while writing the prompt; `heldout` cases were
written afterwards. Release thresholds (`thresholds.ts`) were set before
any tuning and are judged on held-out cases only.

## Running it

```bash
# Deterministic, also part of `pnpm test` (eval.test.ts):
pnpm --filter @asafarim/resumatch eval:job-fit deterministic

# Real provider, costs money, capped; held-out cases run first:
RESUMATCH_EVAL_ALLOW_PROVIDER=1 pnpm --filter @asafarim/resumatch \
  eval:job-fit provider --provider openai --max-cases 18 --max-cost 0.5
```

The provider run writes `out/provider-report.json` (numbers) and
`out/review.json` (the synthetic replies, git ignored). A person reads every
reply in the review sheet, fills `review.agreesWithLabels` and `notes`, and
the AI method ships only when the report says `releaseGo: true` **and** the
review found no reply that claims support the case does not give.

## Labels for human review

Written by Claude from the issue's rules: missing is unknown, an explicit
"no" is unmet, transferable is partial, alternatives count by the best one.
They need a human check before the first real-provider run is trusted.
`baseline` and `keyword` are the matches the deterministic run gives.

| Case | Split | Expected judgments | Match range, suitability | baseline | keyword |
|---|---|---|---|---|---|
| dev-equivalent-names | dev | postgres → direct; typescript → direct; rest api → direct | 90–100 | 86 | 100 |
| dev-required-vs-preferred | dev | react → direct; typescript → direct; css → direct; graphql → unknown; storybook → unknown | 78–85 | 63 | insufficient |
| dev-or-alternatives | dev | c# → direct; sql server → direct; unit testing → unknown | 60–70 | 63 | 67 |
| dev-licence-unknown | dev | driving licence → unknown; forklift → direct; inventory → direct | 60–70, needs_confirmation | 30 | 67 |
| dev-negation | dev | docker → direct; kubernetes → unmet; linux → direct/partial | 50–70 | 83 | insufficient |
| dev-career-transition | dev | delivering training → direct/partial; learning materials → direct/partial; lms → unknown | 30–70 | 30 | 33 |
| dev-cross-language-nl | dev | python → direct; projectbeheer → direct/partial; rijbewijs → unknown | 50–70 | 60 | 67 |
| dev-boilerplate | dev | annual accounts → direct; excel → direct/partial; tax law → unknown | 50–70 | 27 | 67 |
| ho-unrelated-years | heldout | 5+ years → unknown/partial; javascript → direct; code review → unknown | 30–50 | 43 | 33 |
| ho-overlapping-dates | heldout | 5+ years → unknown/partial; go → direct; postgresql → direct | 60–85 | 83 | insufficient |
| ho-degree-alternative | heldout | bachelor → direct/partial; java → direct; spring → direct | 80–100 | 44 | insufficient |
| ho-conflict | heldout | terraform → conflict/unmet; aws → direct; python → unknown | 25–40 | 67 | insufficient |
| ho-late-evidence | heldout | kafka → direct; java → direct; sql → direct | 90–100 | 83 | insufficient |
| ho-false-friend | heldout | java → unknown/partial; hibernate → unknown; html → direct | 25–50 | 40 | insufficient |
| ho-cross-language-de-fr | heldout | gestion de projet → direct; budget → direct/partial; autocad → direct | 80–100 | 25 | insufficient |
| ho-injection | heldout | excel → direct; sap → unknown; leadership → unknown | 30–40 | 13 | insufficient |
| ho-sparse | heldout | cooking → direct/partial | none (insufficient) | 33 | insufficient |
| ho-language-level | heldout | french → unknown/partial; customer service → direct; zendesk → direct | 60–75, needs_confirmation | 71 | insufficient |

## Limitations

- 18 cases is a small set; the ranges are wide on purpose and a single
  case moves a rate by 5 to 10 points.
- The keyword variant inherits the line-based requirement extractor, which
  misses requirements written as prose (held-out extraction recall 0.57).
  It then honestly shows "not enough information" instead of a number.
- Labels are one reviewer's judgment until checked.
