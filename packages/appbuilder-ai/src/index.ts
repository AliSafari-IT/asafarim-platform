export { PLANNING_LIMITS, CONFIDENCE_LEVELS, type ConfidenceLevel } from "./constants";

export {
  RequirementsAnalysis,
  requiresClarification,
  ClarificationQuestion,
  type RequirementsAnalysisType,
  type ClarificationQuestionType,
} from "./schemas/requirementsAnalysis";
export {
  TemplateRecommendation,
  type TemplateRecommendationType,
  type TemplateSelectionRecord,
} from "./schemas/templateRecommendation";
export {
  OperationBatch,
  ProposedOperation,
  countOperations,
  type OperationBatchType,
  type ProposedOperationType,
} from "./schemas/operationProposal";
export {
  ModificationProposal,
  countModificationOperations,
  type ModificationProposalType,
} from "./schemas/modificationProposal";
export {
  ClarificationAnswer,
  ClarificationRound,
  ClarificationState,
  isFullyAnswered,
  type ClarificationAnswerType,
  type ClarificationRoundType,
  type ClarificationStateType,
} from "./schemas/clarification";

export {
  ProviderError,
  PROVIDER_ERROR_CODES,
  isRetryableProviderError,
  safeProviderErrorMessage,
  type ProviderErrorCode,
} from "./provider/errors";
export { redactSecrets, redactForLogging, buildSafeSummary } from "./provider/redact";
export {
  loadAiProviderConfig,
  safeConfigSummary,
  AiProviderConfigError,
  type AiProviderConfig,
} from "./provider/config";
export type {
  AiProvider,
  AnalyzeRequirementsInput,
  AnalyzeRequirementsResult,
  RecommendTemplateInput,
  RecommendTemplateResult,
  ProposeOperationsInput,
  ProposeOperationsResult,
  ProposeModificationInput,
  ProposeModificationResult,
  ModificationSelectionContext,
  ProviderCallOptions,
  UsageMetadata,
} from "./provider/types";

export { SYSTEM_POLICY, wrapUntrustedInput } from "./prompts/systemPolicy";
export { buildAnalysisPrompt } from "./prompts/buildAnalysisPrompt";
export { buildTemplatePrompt } from "./prompts/buildTemplatePrompt";
export { buildOperationPrompt } from "./prompts/buildOperationPrompt";
export { buildModificationPrompt } from "./prompts/buildModificationPrompt";

export { OpenAiProvider } from "./providers/openai";
export { FakeAiProvider, createFakeProvider, value, errorStep, type FakeProviderScript, type FakeStep } from "./providers/fake";
export { DefaultFakeProvider } from "./providers/defaultFake";
export * from "./fixtures/index";

import type { AiProvider } from "./provider/types";
import type { AiProviderConfig } from "./provider/config";
import { OpenAiProvider } from "./providers/openai";
import { DefaultFakeProvider } from "./providers/defaultFake";

/**
 * Builds the configured provider (OpenAI or the deterministic default fake)
 * from validated env config — the one place the worker/pipeline should
 * construct a provider for real job execution. Tests that need a specific
 * scripted scenario should construct `createFakeProvider(script)` directly
 * instead of going through this function.
 */
export function createProviderFromConfig(config: AiProviderConfig): AiProvider {
  if (config.provider === "fake") return new DefaultFakeProvider();
  return new OpenAiProvider(config);
}
