import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { RequirementsAnalysis, type RequirementsAnalysisType } from "../schemas/requirementsAnalysis";
import { TemplateRecommendation } from "../schemas/templateRecommendation";
import { OperationBatch } from "../schemas/operationProposal";
import { ModificationProposal } from "../schemas/modificationProposal";
import { SYSTEM_POLICY } from "../prompts/systemPolicy";
import { buildAnalysisPrompt } from "../prompts/buildAnalysisPrompt";
import { buildTemplatePrompt } from "../prompts/buildTemplatePrompt";
import { buildOperationPrompt } from "../prompts/buildOperationPrompt";
import { buildModificationPrompt } from "../prompts/buildModificationPrompt";
import { ProviderError } from "../provider/errors";
import type { AiProviderConfig } from "../provider/config";
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

/** Maps any error from the OpenAI SDK onto our closed, provider-agnostic error classification. Never rethrows the raw SDK error. */
function toProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;

  if (err instanceof OpenAI.APIError) {
    const status = err.status;
    if (status === 401 || status === 403) {
      return new ProviderError({ code: "authentication_error", message: "OpenAI authentication failed.", cause: err });
    }
    if (status === 429) {
      return new ProviderError({ code: "rate_limit", message: "OpenAI rate limit exceeded.", cause: err });
    }
    if (status === 400 || status === 404 || status === 422) {
      return new ProviderError({ code: "invalid_request", message: "OpenAI rejected the request.", cause: err });
    }
    if (status && status >= 500) {
      return new ProviderError({ code: "unavailable", message: "OpenAI is temporarily unavailable.", cause: err });
    }
  }

  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return new ProviderError({ code: "timeout", message: "OpenAI request timed out.", cause: err });
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return new ProviderError({ code: "unavailable", message: "Could not reach OpenAI.", cause: err });
  }
  if (err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message))) {
    return new ProviderError({ code: "cancelled", message: "Generation request was cancelled.", cause: err });
  }

  return new ProviderError({ code: "unknown", message: "Unexpected OpenAI adapter error.", cause: err });
}

export class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly requestTimeoutMs: number;
  private readonly maxOutputTokens?: number;

  constructor(config: AiProviderConfig) {
    if (!config.openaiApiKey) {
      throw new ProviderError({ code: "authentication_error", message: "No OpenAI API key configured." });
    }
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
      maxRetries: 0, // we own retry/backoff at the pipeline level for observability + idempotency control
      timeout: config.requestTimeoutMs,
    });
    this.model = config.openaiModel;
    this.requestTimeoutMs = config.requestTimeoutMs;
    this.maxOutputTokens = config.maxOutputTokens;
  }

  private async parse<T>(
    userContent: string,
    schema: Parameters<typeof zodResponseFormat>[0],
    schemaName: string,
    options: ProviderCallOptions,
  ): Promise<{ data: T; usage: UsageMetadata }> {
    const start = Date.now();
    try {
      const completion = await this.client.beta.chat.completions.parse(
        {
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_POLICY },
            { role: "user", content: userContent },
          ],
          response_format: zodResponseFormat(schema, schemaName),
          max_completion_tokens: this.maxOutputTokens,
        },
        { signal: options.signal, timeout: this.requestTimeoutMs },
      );

      const choice = completion.choices[0];
      if (choice?.message.refusal) {
        throw new ProviderError({ code: "invalid_request", message: `Model refused: ${choice.message.refusal}` });
      }
      const parsed = choice?.message.parsed;
      if (!parsed) {
        throw new ProviderError({ code: "malformed_response", message: "OpenAI response did not match the requested schema." });
      }

      return {
        data: parsed as T,
        usage: {
          provider: this.name,
          model: this.model,
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens,
          latencyMs: Date.now() - start,
        },
      };
    } catch (err) {
      throw toProviderError(err);
    }
  }

  async analyzeRequirements(
    input: AnalyzeRequirementsInput,
    options: ProviderCallOptions,
  ): Promise<AnalyzeRequirementsResult> {
    const prompt = buildAnalysisPrompt(input);
    const { data, usage } = await this.parse<RequirementsAnalysisType>(
      prompt,
      RequirementsAnalysis,
      "requirements_analysis",
      options,
    );
    return { analysis: data, usage };
  }

  async recommendTemplate(
    input: RecommendTemplateInput,
    options: ProviderCallOptions,
  ): Promise<RecommendTemplateResult> {
    const prompt = buildTemplatePrompt(input);
    const { data, usage } = await this.parse(prompt, TemplateRecommendation, "template_recommendation", options);
    return { recommendation: data as any, usage };
  }

  async proposeOperations(
    input: ProposeOperationsInput,
    options: ProviderCallOptions,
  ): Promise<ProposeOperationsResult> {
    const prompt = buildOperationPrompt(input);
    const { data, usage } = await this.parse(prompt, OperationBatch, "operation_batch", options);
    return { batch: data as any, usage };
  }

  async proposeModification(
    input: ProposeModificationInput,
    options: ProviderCallOptions,
  ): Promise<ProposeModificationResult> {
    const prompt = buildModificationPrompt(input);
    const { data, usage } = await this.parse(prompt, ModificationProposal, "modification_proposal", options);
    return { proposal: data as any, usage };
  }
}

export { toProviderError as mapOpenAiError };
