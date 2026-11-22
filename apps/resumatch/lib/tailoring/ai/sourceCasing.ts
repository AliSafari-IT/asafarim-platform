/**
 * Restore the source's own spelling of brand-like names in AI text.
 *
 * The grounding checks compare words case-insensitively, so a model that
 * writes "ASafarIM Digital" for the profile's "ASafariM Digital", or
 * "Typescript" for "TypeScript", passes them and the wrong spelling goes
 * out under the candidate's name. A word is respelled only when the
 * source (profile, letter, job posting) spells the same letters with a
 * capital inside the word, the way names like ASafariM, TypeScript or
 * PostgreSQL are written, and never in the model's form. Ordinary words,
 * plain capitalisation ("The", "React") and acronyms ("IT") are left
 * alone, and so is any form the source itself uses (a URL's "asafarim").
 */

const WORD = /[\p{L}\p{N}]+/gu;

/** Mixed case with a capital inside: ASafariM, TypeScript, PostgreSQL.
 *  All-caps acronyms (IT, AI) are left out, so "it" never becomes "IT". */
function hasInnerCapital(word: string): boolean {
  return /\p{Lu}/u.test(word.slice(1)) && /\p{Ll}/u.test(word);
}

export interface SourceCasing {
  apply(text: string): string;
}

export function sourceCasing(sourceText: string): SourceCasing {
  const variants = new Map<string, Map<string, number>>();
  for (const match of sourceText.matchAll(WORD)) {
    const word = match[0];
    const key = word.toLowerCase();
    let forms = variants.get(key);
    if (!forms) variants.set(key, (forms = new Map()));
    forms.set(word, (forms.get(word) ?? 0) + 1);
  }
  const preferred = new Map<string, string>();
  for (const [key, forms] of variants) {
    let best: string | null = null;
    let bestCount = 0;
    for (const [form, count] of forms) {
      if (hasInnerCapital(form) && count > bestCount) {
        best = form;
        bestCount = count;
      }
    }
    if (best) preferred.set(key, best);
  }
  return {
    apply(text: string): string {
      if (preferred.size === 0) return text;
      return text.replace(WORD, (word) => {
        const target = preferred.get(word.toLowerCase());
        if (!target || target === word) return word;
        // The source already uses the model's form somewhere: keep it.
        if (variants.get(word.toLowerCase())?.has(word)) return word;
        return target;
      });
    },
  };
}
