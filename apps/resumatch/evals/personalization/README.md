# Personalization evaluation (#934)

Synthetic cases and a runner that measure whether request-scoped
personalization (milestone 34: #928 to #933) is accurate and relevant, and
whether it may roll out.

- `cases.ts`: 37 synthetic cases in nine categories (long and thin CVs,
  career changes, multilingual jobs, contradictory evidence, request vs
  default, injection, missing skills, workspace isolation). Each states the
  evidence a correct run must use and the claims it must never make.
- `run.ts`: the deterministic run. Same functions as the server, a fixed
  stand-in reply, no database, network or model. Compares the
  pre-milestone baseline with the current pipeline.
- `provider.ts`: the bounded real-provider comparison (never in CI).
- `decision.ts`: the go/no-go rules.
- `rubric.md`: the fixed human review rubric.
- `eval.test.ts`: runs in `pnpm test`, so CI fails on any gate.

## Procedure

1. `pnpm --filter @asafarim/resumatch eval:personalization deterministic`
   prints the report. Exit code 1 when a gate fails.
2. With a provider key in the environment:
   `RESUMATCH_EVAL_ALLOW_PROVIDER=1 pnpm --filter @asafarim/resumatch eval:personalization provider --provider openai --max-cases 10 --max-cost 2`.
   Two calls per case (baseline and candidate). Stops before the cost cap.
   Writes `out/provider-report.json` (aggregates) and `out/review.json`
   (the synthetic replies to review). `out/` is git-ignored.
3. Review `out/review.json` with `rubric.md`.
4. `pnpm --filter @asafarim/resumatch eval:personalization decide --provider-report evals/personalization/out/provider-report.json --review evals/personalization/out/review.json`
   prints the decision and its reasons. Copy the aggregates into the
   private evaluation report; never commit the replies.

Bump `CASE_SET_VERSION` when cases change and `HARNESS_VERSION` when
measurement changes. Hiring outcomes are not a quality measure here.
Fine-tuning is a separate decision that needs its own evidence.
