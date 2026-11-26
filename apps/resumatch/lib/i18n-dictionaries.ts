import type { Dictionaries } from "@asafarim/shared-i18n";
import { commonDictionaries } from "./i18n/common";
import { evidenceDictionaries } from "./i18n/evidence";
import { feedbackDictionaries } from "./i18n/feedback";
import { draftsDictionaries } from "./i18n/drafts";
import { contactPreferencesDictionaries } from "./i18n/contactPreferences";
import { writingPreferencesDictionaries } from "./i18n/writingPreferences";
import { historyDictionaries } from "./i18n/history";
import { landingDictionaries } from "./i18n/landing";
import { navDictionaries } from "./i18n/nav";
import { photoDictionaries } from "./i18n/photo";
import { previewDictionaries } from "./i18n/preview";
import { profileDictionaries } from "./i18n/profile";
import { profileImportDictionaries } from "./i18n/profileImport";
import { requirementsDictionaries } from "./i18n/requirements";
import { claimReviewDictionaries } from "./i18n/claimReview";
import { sendDictionaries } from "./i18n/send";
import { shellDictionaries } from "./i18n/shell";
import { tailorDictionaries } from "./i18n/tailor";
import { trackingDictionaries } from "./i18n/tracking";
import { timelineDictionaries } from "./i18n/timeline";
import { jobSourceDictionaries } from "./i18n/jobSource";

/**
 * ResuMatch's own strings for the shared i18n layer (#640), one module per
 * area under lib/i18n/. Everything the language bar itself shows comes from
 * @asafarim/shared-i18n's base dictionaries.
 *
 * Only the four languages the Belgium-locked bar offers (EN / NL / FR / DE);
 * anything missing falls back to English, so an area not translated yet
 * still renders its English copy.
 */
/** Every area, by name — the dictionary test checks each one separately. */
export const resumatchDictionaryAreas: Record<string, Dictionaries> = {
  nav: navDictionaries,
  shell: shellDictionaries,
  common: commonDictionaries,
  history: historyDictionaries,
  tailor: tailorDictionaries,
  drafts: draftsDictionaries,
  evidence: evidenceDictionaries,
  feedback: feedbackDictionaries,
  requirements: requirementsDictionaries,
  claimReview: claimReviewDictionaries,
  contactPreferences: contactPreferencesDictionaries,
  writingPreferences: writingPreferencesDictionaries,
  preview: previewDictionaries,
  profile: profileDictionaries,
  profileImport: profileImportDictionaries,
  photo: photoDictionaries,
  tracking: trackingDictionaries,
  timeline: timelineDictionaries,
  jobSource: jobSourceDictionaries,
  send: sendDictionaries,
  landing: landingDictionaries,
};

const resumatchDictionaries: Dictionaries = {};
for (const area of Object.values(resumatchDictionaryAreas)) {
  for (const [lang, dict] of Object.entries(area) as [keyof Dictionaries, Record<string, string>][]) {
    resumatchDictionaries[lang] = { ...resumatchDictionaries[lang], ...dict };
  }
}

export default resumatchDictionaries;
