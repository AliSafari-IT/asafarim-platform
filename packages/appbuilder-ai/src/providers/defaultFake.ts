import { FakeAiProvider, type FakeProviderScript } from "./fake";
import { ProviderError } from "../provider/errors";
import { CONSTRUCTION_TASK_MANAGEMENT_SCRIPT } from "../fixtures/constructionTaskManagement";
import { CRM_SUCCESS_SCRIPT } from "../fixtures/crm";
import { GENERIC_FALLBACK_SCRIPT } from "../fixtures/generic";
import {
  ADD_PRIORITY_FIELD_SCRIPT,
  COMPACT_TABLE_SCRIPT,
  RESTRICT_PERMISSION_SCRIPT,
  GENERIC_MODIFICATION_FALLBACK_SCRIPT,
} from "../fixtures/modification";
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
} from "../provider/types";

function selectScriptForPrompt(prompt: string): FakeProviderScript {
  const text = prompt.toLowerCase();
  if (text.includes("construction") || text.includes("crew") || text.includes("job site")) {
    return CONSTRUCTION_TASK_MANAGEMENT_SCRIPT;
  }
  if (text.includes("crm") || text.includes("sales pipeline") || text.includes("deal")) {
    return CRM_SUCCESS_SCRIPT;
  }
  return GENERIC_FALLBACK_SCRIPT;
}

/** Same keyword-routing idea as selectScriptForPrompt, but for the M08 conversational-modification vocabulary. */
function selectModificationScriptForPrompt(prompt: string): FakeProviderScript {
  const text = prompt.toLowerCase();
  if (text.includes("priority")) return ADD_PRIORITY_FIELD_SCRIPT;
  if (text.includes("compact")) return COMPACT_TABLE_SCRIPT;
  if (text.includes("only managers") || text.includes("restrict") || text.includes("no longer")) {
    return RESTRICT_PERMISSION_SCRIPT;
  }
  return GENERIC_MODIFICATION_FALLBACK_SCRIPT;
}

/**
 * The provider used when `APPBUILDER_AI_PROVIDER=fake` (the default for
 * local dev, CI, and Playwright's golden path) with no test explicitly
 * injecting its own scripted `FakeAiProvider`. Deterministically maps the
 * job's untrusted prompt text to a known fixture scenario by keyword —
 * never calls a network, never varies run-to-run — so `pnpm dev` and the
 * e2e suite behave identically without per-run configuration. Each call
 * to `analyzeRequirements` re-selects and pins the scenario for the
 * remainder of this provider instance's lifetime (one instance per job
 * execution — see the pipeline orchestrator).
 */
export class DefaultFakeProvider implements AiProvider {
  readonly name = "fake";
  private delegate: FakeAiProvider | null = null;

  async analyzeRequirements(
    input: AnalyzeRequirementsInput,
    options: ProviderCallOptions,
  ): Promise<AnalyzeRequirementsResult> {
    this.delegate = new FakeAiProvider(selectScriptForPrompt(input.prompt));
    return this.delegate.analyzeRequirements(input, options);
  }

  async recommendTemplate(
    input: RecommendTemplateInput,
    options: ProviderCallOptions,
  ): Promise<RecommendTemplateResult> {
    if (!this.delegate) {
      throw new ProviderError({ code: "unknown", message: "recommendTemplate called before analyzeRequirements." });
    }
    return this.delegate.recommendTemplate(input, options);
  }

  async proposeOperations(
    input: ProposeOperationsInput,
    options: ProviderCallOptions,
  ): Promise<ProposeOperationsResult> {
    if (!this.delegate) {
      throw new ProviderError({ code: "unknown", message: "proposeOperations called before analyzeRequirements." });
    }
    return this.delegate.proposeOperations(input, options);
  }

  /**
   * Unlike the M07 methods above, a modification job never calls
   * analyzeRequirements first — it goes straight to proposeModification —
   * so this pins its own delegate independently on first call, keyed off
   * the modification vocabulary rather than the generation one.
   */
  async proposeModification(
    input: ProposeModificationInput,
    options: ProviderCallOptions,
  ): Promise<ProposeModificationResult> {
    if (!this.delegate) {
      this.delegate = new FakeAiProvider(selectModificationScriptForPrompt(input.userRequest));
    }
    return this.delegate.proposeModification(input, options);
  }
}
