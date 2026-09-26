import type { Dictionaries } from "@asafarim/shared-i18n";
import { commonDictionaries } from "./i18n/common";
import { historyDictionaries } from "./i18n/history";
import { navDictionaries } from "./i18n/nav";
import { previewDictionaries } from "./i18n/preview";
import { profileDictionaries } from "./i18n/profile";
import { shellDictionaries } from "./i18n/shell";
import { tailorDictionaries } from "./i18n/tailor";

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
  preview: previewDictionaries,
  profile: profileDictionaries,
};

const resumatchDictionaries: Dictionaries = {};
for (const area of Object.values(resumatchDictionaryAreas)) {
  for (const [lang, dict] of Object.entries(area) as [keyof Dictionaries, Record<string, string>][]) {
    resumatchDictionaries[lang] = { ...resumatchDictionaries[lang], ...dict };
  }
}

export default resumatchDictionaries;
