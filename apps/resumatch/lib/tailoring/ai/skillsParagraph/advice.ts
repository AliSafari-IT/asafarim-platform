import type { CandidateProfileContent } from "../../../profile/contract";
import { reviewSkillsParagraph } from "./check";
import { skillsParagraphInputs } from "./inputs";

/** Why a sentence is worth a second look, in the words the preview uses. */
export type HandEditConcern = "unlisted" | "rating" | "claim";

export interface HandEditAdvice {
  sentence: string;
  concerns: HandEditConcern[];
}

/**
 * Advice for a hand-edited paragraph: the sentences the AI check would not
 * have kept, judged against this CV's skills and its profile version.
 * Pure, no AI call, so the preview runs it on every render and the advice
 * follows later changes to the CV's skill list.
 */
export function reviewHandEditedParagraph({
  paragraph,
  skills,
  outputLanguage,
  profileContent,
}: {
  paragraph: string;
  skills: string[];
  outputLanguage: string | null;
  profileContent: CandidateProfileContent | null | undefined;
}): HandEditAdvice[] {
  const { language, categoryLabels, profileText } = skillsParagraphInputs({ skills, outputLanguage, profileContent });
  return reviewSkillsParagraph(paragraph, { skills, categoryLabels, profileText, language }).map(
    ({ sentence, reasons }) => {
      const concerns = new Set<HandEditConcern>();
      for (const reason of reasons) {
        // Anything else is one of the cover letter's claim rules
        // (mentoring, leading people, a certification, a spoken language…).
        concerns.add(reason === "unlisted_name" ? "unlisted" : reason === "rating" ? "rating" : "claim");
      }
      return { sentence, concerns: [...concerns] };
    },
  );
}
