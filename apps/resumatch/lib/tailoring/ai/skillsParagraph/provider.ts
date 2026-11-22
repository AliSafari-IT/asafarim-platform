import type { ProviderCallMeta } from "../../../costs/providerMeta";
import type { ResuMatchAiProvider } from "../../../env";
import { AiProviderError } from "../../../ai/providerError";
import type { OutputLanguage } from "../../language";

/**
 * Skills paragraph provider interface. The prompt (prompts.ts) carries only
 * this CV's own skill names, grouped by category; its HARD RULES limit the
 * output to those names. check.ts verifies the reply before it is stored.
 */
export interface SkillsParagraphProviderCall {
  /** This CV's skill groups, as rendered (category label, or "" for none),
   *  with the untranslated taxonomy key when there is one. */
  groups: { label: string; skills: string[]; category?: string | null }[];
  language: OutputLanguage;
  system: string;
  user: string;
  promptVersion: string;
  model: string;
  signal?: AbortSignal;
}

export interface SkillsParagraphProviderOutput extends ProviderCallMeta {
  /** Plain paragraph text, not JSON. */
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface SkillsParagraphProvider {
  readonly name: ResuMatchAiProvider;
  write(call: SkillsParagraphProviderCall): Promise<SkillsParagraphProviderOutput>;
}

export class SkillsParagraphProviderError extends AiProviderError {
  constructor(message: string, retryable = true) {
    super(message, retryable);
    this.name = "SkillsParagraphProviderError";
  }
}
