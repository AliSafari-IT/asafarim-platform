import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { RequirementsAnalysisType } from "../schemas/requirementsAnalysis";
import type { TemplateRecommendationType } from "../schemas/templateRecommendation";
import type { OperationBatchType } from "../schemas/operationProposal";
import type { ModificationProposalType } from "../schemas/modificationProposal";
import type { ClarificationRoundType } from "../schemas/clarification";

/**
 * Usage/latency metadata recorded for cost tracking (M12 quotas build on
 * this) and observability. Never carries provider secrets or raw request/
 * response headers — only counts and identifiers.
 */
export interface UsageMetadata {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
}

export interface ProviderCallOptions {
  /** Aborts the in-flight provider call — wired to job cancellation. */
  signal?: AbortSignal;
  /** Correlates provider-side logs with the job/attempt without exposing job internals to the provider itself. */
  requestId: string;
}

export interface AnalyzeRequirementsInput {
  /** Untrusted free text — treated as data to analyze, never as instructions (see prompts/systemPolicy.ts). */
  prompt: string;
  requestedStarterFamily: string;
  /** Prior clarification rounds (questions + answers), for a follow-up analysis after clarification. */
  clarificationHistory: ClarificationRoundType[];
  availableTemplateIds: readonly string[];
}
export interface AnalyzeRequirementsResult {
  analysis: RequirementsAnalysisType;
  usage: UsageMetadata;
}

export interface RecommendTemplateInput {
  analysis: RequirementsAnalysisType;
  availableTemplates: ReadonlyArray<{ id: string; displayName: string; description: string }>;
  requestedStarterFamily: string;
}
export interface RecommendTemplateResult {
  recommendation: TemplateRecommendationType;
  usage: UsageMetadata;
}

export interface ProposeOperationsInput {
  analysis: RequirementsAnalysisType;
  templateId: string;
  /** The specification as it stands after the template and any prior accepted batches. */
  currentSpec: ApplicationSpecificationType;
  /** Reasoning summaries from prior accepted batches this job, for continuity across iterations. */
  priorBatchSummaries: readonly string[];
  remainingOperationBudget: number;
  iteration: number;
  maxIterations: number;
}
export interface ProposeOperationsResult {
  batch: OperationBatchType;
  usage: UsageMetadata;
}

/** Bounded, stable-id-only description of a preview element the user selected before asking for a change — see lib/modification/selectionContext.ts (apps/appbuilder). Never raw DOM/HTML. */
export interface ModificationSelectionContext {
  pageId?: string;
  componentId?: string;
  componentKind?: string;
  label?: string;
}

export interface ProposeModificationInput {
  /** Untrusted free text — the user's conversational request. Treated as data, never as instructions (see prompts/systemPolicy.ts). */
  userRequest: string;
  /** The specification as it stands right now — the model must work only against this, never re-derive/guess prior state. */
  currentSpec: ApplicationSpecificationType;
  /** Bounded context if the user selected a page/component in the preview before asking; null if not. */
  selection: ModificationSelectionContext | null;
  /** Caps how many operations a single proposal may contain — smaller than M07's per-batch cap since this is one bounded follow-up edit, not an app build-out. */
  operationBudget: number;
}
export interface ProposeModificationResult {
  proposal: ModificationProposalType;
  usage: UsageMetadata;
}

/**
 * Server-only AI provider boundary. Independent of UI, repositories, and
 * orchestration — implementations (OpenAI adapter, fake/fixture provider)
 * live behind this interface and the generation pipeline never imports a
 * concrete provider directly, only `AiProvider`.
 *
 * Every method returns *structured* data validated against this package's
 * Zod schemas before it is ever returned — an adapter that cannot produce a
 * schema-conformant result must throw `ProviderError({ code: "malformed_response" })`
 * rather than return best-effort/partial data.
 */
export interface AiProvider {
  readonly name: string;
  analyzeRequirements(
    input: AnalyzeRequirementsInput,
    options: ProviderCallOptions,
  ): Promise<AnalyzeRequirementsResult>;
  recommendTemplate(input: RecommendTemplateInput, options: ProviderCallOptions): Promise<RecommendTemplateResult>;
  proposeOperations(input: ProposeOperationsInput, options: ProviderCallOptions): Promise<ProposeOperationsResult>;
  /** M08: proposes a single bounded operation batch answering one conversational modification request. */
  proposeModification(input: ProposeModificationInput, options: ProviderCallOptions): Promise<ProposeModificationResult>;
}
