import { createFakeProvider } from "@asafarim/appbuilder-ai";
import type {
  AiProvider,
  AnalyzeRequirementsInput,
  AnalyzeRequirementsResult,
  ModificationProposalType,
  ProposeModificationInput,
  ProposeModificationResult,
  ProposeOperationsInput,
  ProposeOperationsResult,
  ProposeRepairInput,
  ProposeRepairResult,
  ProviderCallOptions,
  RecommendTemplateInput,
  RecommendTemplateResult,
} from "@asafarim/appbuilder-ai";
import type { Db } from "../lib/db/client";
import { createApp } from "../lib/repositories/apps";
import { applyOperation } from "../lib/repositories/operations";
import { appendUserMessage } from "../lib/repositories/conversations";
import { claimJobById, enqueueModificationJob } from "../lib/repositories/modificationJobs";
import { runModificationJob } from "../lib/modification/pipeline";
import { REGRESSION_CORPUS, type RegressionCase } from "./regressionCorpus";
import { scoreCase, summarize, type CaseScore, type EvaluationReport } from "./scorer";

const owner = { principalId: "m13-eval-owner", roles: [] };

/**
 * Builds the minimal app the whole M13 Slice A corpus runs against: a
 * `home` page named "Home" (the only schema-representable stand-in for "the
 * title"), a matching navigation entry, and a non-blue `branding.primaryColor`
 * (the closest representable stand-in for "the title color").
 */
async function setupTitleApp(db: Db, suffix: string) {
  const app = await createApp(
    db,
    owner,
    { name: `M13 Eval App ${suffix}`, slug: `m13-eval-${suffix}-${Math.random().toString(36).slice(2, 8)}` },
    `m13-eval-create-${suffix}`,
  );
  let v = 1;
  await applyOperation(db, owner, app.id, {
    operation: { opVersion: "1.0.0", type: "CREATE_PAGE", page: { id: "home", name: "Home", path: "home" } },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-create-page`,
  });
  await applyOperation(db, owner, app.id, {
    operation: {
      opVersion: "1.0.0",
      type: "UPDATE_NAVIGATION",
      navigation: [{ id: "nav_home", label: "Home", targetPageId: "home", order: 0 }],
    },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-update-navigation`,
  });
  const { version } = await applyOperation(db, owner, app.id, {
    operation: { opVersion: "1.0.0", type: "UPDATE_BRANDING", patch: { primaryColor: "#111111" } },
    baseVersionNumber: v++,
    idempotencyKey: `${suffix}-update-branding`,
  });
  return { app, baseVersionNumber: version!.versionNumber };
}

/**
 * Wraps any `AiProvider` and stashes the last `proposeModification` result
 * so the harness can score against exactly what the pipeline received,
 * regardless of whether that provider is a deterministic `FakeAiProvider`
 * (the default CI baseline) or a real adapter (the doc's "optional
 * real-provider evaluation") — `runModificationJob` never persists a
 * proposal on the clarification-needed path (see pipeline.ts), so this is
 * the only path-independent way to recover it.
 */
class RecordingProvider implements AiProvider {
  readonly name: string;
  lastProposal: ModificationProposalType | null = null;

  constructor(private readonly base: AiProvider) {
    this.name = base.name;
  }

  analyzeRequirements(input: AnalyzeRequirementsInput, options: ProviderCallOptions): Promise<AnalyzeRequirementsResult> {
    return this.base.analyzeRequirements(input, options);
  }
  recommendTemplate(input: RecommendTemplateInput, options: ProviderCallOptions): Promise<RecommendTemplateResult> {
    return this.base.recommendTemplate(input, options);
  }
  proposeOperations(input: ProposeOperationsInput, options: ProviderCallOptions): Promise<ProposeOperationsResult> {
    return this.base.proposeOperations(input, options);
  }
  async proposeModification(input: ProposeModificationInput, options: ProviderCallOptions): Promise<ProposeModificationResult> {
    const result = await this.base.proposeModification(input, options);
    this.lastProposal = result.proposal;
    return result;
  }
  proposeRepair(input: ProposeRepairInput, options: ProviderCallOptions): Promise<ProposeRepairResult> {
    return this.base.proposeRepair(input, options);
  }
}

async function runOneCase(db: Db, regressionCase: RegressionCase, makeProvider: (c: RegressionCase) => AiProvider): Promise<CaseScore> {
  const { app, baseVersionNumber } = await setupTitleApp(db, regressionCase.id);

  const selectionContext = regressionCase.selection
    ? { appId: app.id, specificationVersionNumber: baseVersionNumber, ...regressionCase.selection }
    : null;

  const { message } = await appendUserMessage(db, owner, app.id, {
    content: regressionCase.userRequestText,
    selectionContext,
    baseVersionNumber,
  });
  const job = await enqueueModificationJob(db, owner, app.id, {
    conversationId: message.conversationId,
    triggeringMessageId: message.id,
    userRequestText: regressionCase.userRequestText,
    selectionContext,
    idempotencyKey: `m13-eval-job-${regressionCase.id}`,
  });

  const claimed = await claimJobById(db, job.id, "m13-eval-worker", 120_000);
  if (!claimed) throw new Error(`expected to claim freshly-enqueued eval job for case "${regressionCase.id}"`);

  const provider = new RecordingProvider(makeProvider(regressionCase));
  const outcome = await runModificationJob(
    { db, provider, workerId: "m13-eval-worker", leaseDurationMs: 120_000, signal: new AbortController().signal },
    claimed,
  );
  if (outcome.kind !== "yielded") {
    throw new Error(`case "${regressionCase.id}" did not reach a terminal outcome (kind=${outcome.kind})`);
  }
  if (!provider.lastProposal) {
    throw new Error(`case "${regressionCase.id}" never received a proposal from the provider`);
  }

  return scoreCase(regressionCase, provider.lastProposal, { status: outcome.job.status, failureCode: outcome.job.failureCode ?? null });
}

async function runCorpus(
  db: Db,
  corpus: readonly RegressionCase[],
  makeProvider: (c: RegressionCase) => AiProvider,
): Promise<EvaluationReport> {
  const cases: CaseScore[] = [];
  for (const regressionCase of corpus) {
    cases.push(await runOneCase(db, regressionCase, makeProvider));
  }
  return { generatedAt: new Date().toISOString(), cases, summary: summarize(cases) };
}

/** The deterministic, network-free CI baseline: each case is scored against the exact response reported for it in the M13 doc. */
export async function runEvaluation(db: Db, corpus: readonly RegressionCase[] = REGRESSION_CORPUS): Promise<EvaluationReport> {
  return runCorpus(db, corpus, (c) => createFakeProvider(c.reproducedProviderScript));
}

/**
 * Optional real-provider evaluation (M13 slice A exit criterion) — runs the
 * same corpus against a real `AiProvider` (e.g. `OpenAiProvider`) instead of
 * the scripted baseline. Not part of `pnpm test:integration`: real-model
 * output is non-deterministic and this is a release-gate check, not
 * per-commit CI (see docs/appbuilder-m13-multimodal-contextual-assistant.md
 * "Quality and safety gates"). See eval/recordRealProviderBaseline.ts.
 */
export async function runEvaluationWithProvider(
  db: Db,
  provider: AiProvider,
  corpus: readonly RegressionCase[] = REGRESSION_CORPUS,
): Promise<EvaluationReport> {
  return runCorpus(db, corpus, () => provider);
}
