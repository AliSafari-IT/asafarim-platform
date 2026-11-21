import type { ProviderCallMeta } from "../../costs/providerMeta";
import type { ResuMatchAiProvider } from "../../env";
import { AiProviderError } from "../../ai/providerError";
import type { OutputLanguage } from "../../tailoring/language";
import type { ApplicationEmailSuggestion } from "./schema";

export interface ApplicationEmailProviderCall {
  language: OutputLanguage;
  jobTitle: string | null;
  employer: string | null;
  contactName: string | null;
  /** Evidence the fixture builds from; the real prompt is system/user. */
  profileText: string;
  system: string;
  user: string;
  promptVersion: string;
  model: string;
  signal?: AbortSignal;
}

export interface ApplicationEmailProviderOutput extends ProviderCallMeta {
  suggestion: ApplicationEmailSuggestion;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ApplicationEmailProvider {
  readonly name: ResuMatchAiProvider;
  generate(call: ApplicationEmailProviderCall): Promise<ApplicationEmailProviderOutput>;
}

export class ApplicationEmailProviderError extends AiProviderError {
  constructor(message: string, retryable = true) {
    super(message, retryable);
    this.name = "ApplicationEmailProviderError";
  }
}
