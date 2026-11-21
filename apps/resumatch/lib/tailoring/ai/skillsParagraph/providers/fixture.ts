import type { SkillsParagraphProvider, SkillsParagraphProviderCall, SkillsParagraphProviderOutput } from "../provider";
import { MAX_SKILLS_PARAGRAPH_LENGTH } from "../prompts";

/** Longest single sentence the fixture writes; a bigger group is split. */
const MAX_SENTENCE = 300;

/**
 * Deterministic, offline provider: zero cost, no network, the only one CI
 * runs. It writes no new wording — "Label: a, b and c." per skill group,
 * in skill order — so it always passes check.ts and lets the whole flow run
 * locally. A large group is split into bounded sentences, and it stops
 * before the paragraph limit, so one huge group can't make the checker
 * drop everything.
 */
export class SkillsParagraphFixtureProvider implements SkillsParagraphProvider {
  readonly name = "fixture";

  async write(call: SkillsParagraphProviderCall): Promise<SkillsParagraphProviderOutput> {
    const sentences: string[] = [];
    for (const group of call.groups) {
      let chunk: string[] = [];
      const flush = () => {
        if (chunk.length === 0) return;
        const list = joinList(chunk, call.language);
        sentences.push(group.label && sentences.every((s) => !s.startsWith(`${group.label}:`)) ? `${group.label}: ${list}.` : `${list}.`);
        chunk = [];
      };
      for (const skill of group.skills) {
        if (chunk.length > 0 && [...chunk, skill].join(", ").length + group.label.length + 2 > MAX_SENTENCE) flush();
        chunk.push(skill);
      }
      flush();
    }
    const kept: string[] = [];
    for (const sentence of sentences) {
      if ([...kept, sentence].join(" ").length > MAX_SKILLS_PARAGRAPH_LENGTH) break;
      kept.push(sentence);
    }
    const text = kept.join(" ");
    return {
      text,
      inputTokens: Math.ceil(call.user.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      costUsd: 0,
    };
  }
}

const AND: Record<string, string> = { en: "and", nl: "en", fr: "et", de: "und" };

function joinList(items: string[], language: string): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${AND[language] ?? "and"} ${items.at(-1)}`;
}
