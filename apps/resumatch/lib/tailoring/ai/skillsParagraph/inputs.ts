import type { CandidateProfileContent } from "../../../profile/contract";
import type { SkillCategory } from "../../../profile/skillCategories";
import { buildProfileText } from "../../buildProfileText";
import { isOutputLanguage, templateLabels, type OutputLanguage } from "../../language";
import { groupSkillsForCv, profileSkillCategories } from "../../skillsLayout";

/**
 * What the paragraph is written from and checked against, for one CV: its
 * skills grouped under the headings the CV shows, and the profile text the
 * claim rules read. Shared by the AI write and the advisory review of a
 * hand-edited paragraph (./handEdit.ts), so both judge by the same list.
 */
export function skillsParagraphInputs({
  skills,
  outputLanguage,
  profileContent,
}: {
  skills: string[];
  outputLanguage: string | null;
  profileContent: CandidateProfileContent | null | undefined;
}) {
  // A CV with no language applied (older, or degraded) was written from the
  // profile as it stands; English is the honest default for its labels.
  const language: OutputLanguage = isOutputLanguage(outputLanguage) ? outputLanguage : "en";
  const labels = templateLabels(language);
  const categoryOf = profileSkillCategories(profileContent);
  const groups = groupSkillsForCv(skills, categoryOf).map(({ category, skills: names }) => ({
    label: category ? labels.skillCategories[category as SkillCategory] : "",
    skills: names,
    category: category ?? null,
  }));
  // Only the headings the prompt actually showed back a word in the reply.
  const categoryLabels = groups.map((group) => group.label).filter(Boolean);
  // Evidence for the claim rules only; it never reaches the prompt.
  const profileText = profileContent ? buildProfileText(profileContent).text : "";
  return { language, groups, categoryLabels, profileText };
}
