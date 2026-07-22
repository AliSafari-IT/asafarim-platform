import { RequirementsAnalysis } from "../schemas/requirementsAnalysis";
import { TemplateRecommendation } from "../schemas/templateRecommendation";
import { OperationBatch } from "../schemas/operationProposal";
import { ModificationProposal } from "../schemas/modificationProposal";
import { ProviderError } from "../provider/errors";
import type {
  AiProvider,
  AnalyzeRequirementsInput,
  AnalyzeRequirementsResult,
  ProviderCallOptions,
  RecommendTemplateInput,
  RecommendTemplateResult,
  ProposeOperationsInput,
  ProposeOperationsResult,
  ProposeModificationInput,
  ProposeModificationResult,
  UsageMetadata,
} from "../provider/types";

type Method = "analyzeRequirements" | "recommendTemplate" | "proposeOperations" | "proposeModification";

export type FakeStep = { kind: "value"; raw: unknown } | { kind: "error"; error: ProviderError };

export function value(raw: unknown): FakeStep {
  return { kind: "value", raw };
}
export function errorStep(error: ProviderError): FakeStep {
  return { kind: "error", error };
}

export interface FakeProviderScript {
  analyzeRequirements?: FakeStep[];
  recommendTemplate?: FakeStep[];
  proposeOperations?: FakeStep[];
  proposeModification?: FakeStep[];
}

const SCHEMAS = {
  analyzeRequirements: RequirementsAnalysis,
  recommendTemplate: TemplateRecommendation,
  proposeOperations: OperationBatch,
  proposeModification: ModificationProposal,
} as const;

function usage(model: string): UsageMetadata {
  return { provider: "fake", model, promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0 };
}

/**
 * Deterministic, network-free AiProvider for tests, local dev, and CI.
 * Consumes a pre-scripted, ordered sequence of steps per method — the last
 * scripted step repeats if a method is called more times than scripted,
 * which lets a short script cover an open-ended number of
 * `proposeOperations` iterations by scripting a final "isFinalBatch: true"
 * step last.
 *
 * Every scripted value is validated against the SAME Zod schema the OpenAI
 * adapter validates against (never a fake-only shortcut) — this is what
 * lets `fixtures/malformed.ts` and `fixtures/forbidden.ts` exercise the
 * real provider-boundary validation instead of a synthetic check.
 */
export class FakeAiProvider implements AiProvider {
  readonly name = "fake";
  private readonly cursors: Record<Method, number> = {
    analyzeRequirements: 0,
    recommendTemplate: 0,
    proposeOperations: 0,
    proposeModification: 0,
  };

  constructor(
    private readonly script: FakeProviderScript,
    private readonly model = "fake-fixture-v1",
  ) {}

  private consume(method: Method, options: ProviderCallOptions): unknown {
    if (options.signal?.aborted) {
      throw new ProviderError({ code: "cancelled", message: `Generation cancelled before ${method} dispatched.` });
    }
    const steps = this.script[method] ?? [];
    if (steps.length === 0) {
      throw new ProviderError({ code: "unknown", message: `Fake provider has no scripted steps for ${method}.` });
    }
    const index = Math.min(this.cursors[method], steps.length - 1);
    this.cursors[method] += 1;
    const entry = steps[index];

    if (entry.kind === "error") throw entry.error;

    const parsed = (SCHEMAS[method] as { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: unknown } }).safeParse(
      entry.raw,
    );
    if (!parsed.success) {
      throw new ProviderError({
        code: "malformed_response",
        message: `Fake provider script for ${method}[${index}] does not match the required schema.`,
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  async analyzeRequirements(
    _input: AnalyzeRequirementsInput,
    options: ProviderCallOptions,
  ): Promise<AnalyzeRequirementsResult> {
    return { analysis: this.consume("analyzeRequirements", options) as any, usage: usage(this.model) };
  }

  async recommendTemplate(
    _input: RecommendTemplateInput,
    options: ProviderCallOptions,
  ): Promise<RecommendTemplateResult> {
    return { recommendation: this.consume("recommendTemplate", options) as any, usage: usage(this.model) };
  }

  async proposeOperations(
    _input: ProposeOperationsInput,
    options: ProviderCallOptions,
  ): Promise<ProposeOperationsResult> {
    return { batch: this.consume("proposeOperations", options) as any, usage: usage(this.model) };
  }

  async proposeModification(
    _input: ProposeModificationInput,
    options: ProviderCallOptions,
  ): Promise<ProposeModificationResult> {
    return { proposal: this.consume("proposeModification", options) as any, usage: usage(this.model) };
  }
}

export function createFakeProvider(script: FakeProviderScript, model?: string): AiProvider {
  return new FakeAiProvider(script, model);
}
