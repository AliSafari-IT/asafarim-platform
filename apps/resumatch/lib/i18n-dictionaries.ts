import type { Dictionaries } from "@asafarim/shared-i18n";
import { commonDictionaries } from "./i18n/common";
import { historyDictionaries } from "./i18n/history";
import { navDictionaries } from "./i18n/nav";
import { shellDictionaries } from "./i18n/shell";

/**
 * ResuMatch's own strings for the shared i18n layer (#640), one module per
 * area under lib/i18n/. Everything the language bar itself shows comes from
 * @asafarim/shared-i18n's base dictionaries.
 *
 * Only the four languages the Belgium-locked bar offers (EN / NL / FR / DE);
 * anything missing falls back to English, so an area not translated yet
 * still renders its English copy.
 */
const areas: Dictionaries[] = [navDictionaries, shellDictionaries, commonDictionaries, historyDictionaries];

const resumatchDictionaries: Dictionaries = {};
for (const area of areas) {
  for (const [lang, dict] of Object.entries(area) as [keyof Dictionaries, Record<string, string>][]) {
    resumatchDictionaries[lang] = { ...resumatchDictionaries[lang], ...dict };
  }
}

export default resumatchDictionaries;
