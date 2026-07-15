import en from "./en";
import nl from "./nl";
import fr from "./fr";
import de from "./de";
import type { BaseLanguage, Dict, Dictionaries } from "../types";

/** Bundled base dictionaries (en, nl, fr, de). Apps may extend/override these. */
export const baseDictionaries: Dictionaries = { en, nl, fr, de };

/** Merge multiple dictionary sets so later entries override earlier ones. */
export function mergeDictionaries(...sets: Dictionaries[]): Dictionaries {
  const result: Dictionaries = {};
  for (const set of sets) {
    for (const [lang, dict] of Object.entries(set) as Array<[BaseLanguage, Dict]>) {
      result[lang] = { ...(result[lang] ?? {}), ...dict };
    }
  }
  return result;
}

export { en, nl, fr, de };
