import { describe, expect, it } from "vitest";
import { ExtractionProviderError } from "../extraction/ai/provider";
import { CategorizeSkillsProviderError } from "../profile/ai/categorize/provider";
import { RewriteProviderError } from "../profile/ai/provider";
import { CoverLetterProviderError } from "../tailoring/ai/coverLetter/provider";
import { TailorProviderError } from "../tailoring/ai/provider";
import { JobFetchProviderError } from "../tailoring/jobFetchAi/provider";
import { JobMetaProviderError } from "../tailoring/jobMetaAi/provider";
import { AiProviderError } from "./providerError";

const domainErrors = [
  ExtractionProviderError,
  CategorizeSkillsProviderError,
  RewriteProviderError,
  CoverLetterProviderError,
  TailorProviderError,
  JobFetchProviderError,
  JobMetaProviderError,
] as const;

describe("domain provider errors (issue #515)", () => {
  it.each(domainErrors.map((E) => [E.name, E] as const))(
    "%s is a thin AiProviderError subclass that keeps its own name",
    (className, ErrorClass) => {
      const err = new ErrorClass("boom");
      expect(err).toBeInstanceOf(ErrorClass);
      expect(err).toBeInstanceOf(AiProviderError);
      expect(err.name).toBe(className);
      expect(err.message).toBe("boom");
      expect(err.retryable).toBe(true);
      expect(new ErrorClass("bad request", false).retryable).toBe(false);
    }
  );
});
