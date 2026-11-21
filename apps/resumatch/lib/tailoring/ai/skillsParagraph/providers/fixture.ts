import type { SkillsParagraphProvider, SkillsParagraphProviderCall, SkillsParagraphProviderOutput } from "../provider";

/**
 * Deterministic, offline provider: zero cost, no network, the only one CI
 * runs. It writes no new wording — one sentence per skill group, "Label:
 * a, b and c." — so it always passes check.ts and lets the whole flow run
 * locally.
 */
export class SkillsParagraphFixtureProvider implements SkillsParagraphProvider {
  readonly name = "fixture";

  async write(call: SkillsParagraphProviderCall): Promise<SkillsParagraphProviderOutput> {
    const text = call.groups
      .filter((group) => group.skills.length > 0)
      .map((group) => {
        const list = joinList(group.skills, call.language);
        return group.label ? `${group.label}: ${list}.` : `${list}.`;
      })
      .join(" ");
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
