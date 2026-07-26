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
import {
  REPAIR_ADD_MISSING_PERMISSION_SCRIPT,
  REPAIR_NARROW_PERMISSION_SCRIPT,
  REPAIR_UNSUPPORTED_CAPABILITY_SCRIPT,
  REPAIR_GENERIC_FALLBACK_SCRIPT,
} from "../fixtures/repair";
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
  ProposeRepairInput,
  ProposeRepairResult,
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
 * Same keyword-routing idea, for the M10 repair-diagnostics vocabulary —
 * keyed off the failure classification, target gate keys, and the
 * diagnostics text itself (there is no free user text at this layer, since
 * a repair is triggered by a validation-gate failure, not a request). Since
 * `permissions_authorization` failures are ALWAYS classified
 * `security_policy_failure` by lib/repair/classify.ts regardless of whether
 * the real defect is a missing grant or an over-broad one, a scripted
 * fixture app can steer which fixture applies by embedding a distinguishing
 * marker (e.g. an entity/role literally named with "narrow") in its
 * diagnostics text — see tests/e2e/specs/m10-validation-repair.spec.ts's
 * destructive-repair-confirmation fixture.
 */
function selectRepairScriptForPrompt(input: ProposeRepairInput): FakeProviderScript {
  if (input.failureClassification === "unsupported_product_capability") return REPAIR_UNSUPPORTED_CAPABILITY_SCRIPT;
  const diagnosticsText = JSON.stringify(input.diagnosticsSummary).toLowerCase();
  if (diagnosticsText.includes("narrow")) return REPAIR_NARROW_PERMISSION_SCRIPT;
  const gates = input.targetGateKeys.join(" ").toLowerCase();
  if (gates.includes("permissions") || gates.includes("reference_integrity")) {
    return REPAIR_ADD_MISSING_PERMISSION_SCRIPT;
  }
  return REPAIR_GENERIC_FALLBACK_SCRIPT;
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

  /** A repair job never calls analyzeRequirements first either — pins its own delegate on first call, keyed off the failure classification/target gates rather than free text. */
  async proposeRepair(input: ProposeRepairInput, options: ProviderCallOptions): Promise<ProposeRepairResult> {
    if (!this.delegate) {
      this.delegate = new FakeAiProvider(selectRepairScriptForPrompt(input));
    }
    return this.delegate.proposeRepair(input, options);
  }
}
