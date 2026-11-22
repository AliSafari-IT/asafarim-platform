import type { SkillCategory } from "../../../../profile/skillCategories";
import type { OutputLanguage } from "../../../language";
import type { SkillsParagraphProvider, SkillsParagraphProviderCall, SkillsParagraphProviderOutput } from "../provider";
import { MAX_SKILLS_PARAGRAPH_LENGTH } from "../prompts";

/** Longest single sentence the fixture writes; a bigger group is split. */
const MAX_SENTENCE = 300;

type Lead = { first: string; next: string };

/**
 * One plain sentence frame per skill theme, per language: `{}` is the
 * joined skill list. The words around it are lower-case and generic, so
 * the check (check.ts) always keeps them. `next` is used when a theme is
 * not the first sentence, so the paragraph doesn't open every sentence
 * the same way.
 */
const FRAMES: Record<OutputLanguage, Partial<Record<SkillCategory, Lead>> & { fallback: Lead; more: string }> = {
  en: {
    "Languages & Frameworks": { first: "Writes software mainly in {}.", next: "Programming work is done mainly in {}." },
    "Frontend Development": { first: "Builds web interfaces with {}.", next: "On the front end, builds interfaces with {}." },
    "Backend & APIs": { first: "Develops back ends and APIs with {}.", next: "On the back end, works with {}." },
    Databases: { first: "Stores and queries data with {}.", next: "For data storage, uses {}." },
    "Cloud & DevOps": { first: "Builds, ships and runs software with {}.", next: "Deployment and operations rely on {}." },
    "Version Control": { first: "Manages source code with {}.", next: "Source code is kept in {}." },
    "Testing & QA": { first: "Tests software with {}.", next: "Quality is checked with {}." },
    "Tools & IDEs": { first: "Works day to day with {}.", next: "Everyday tools include {}." },
    "Data & Analytics": { first: "Analyses data with {}.", next: "For data work, uses {}." },
    "AI & Machine Learning": { first: "Builds AI features with {}.", next: "AI work draws on {}." },
    "Project & Process": { first: "Organises work with {}.", next: "Work is organised with {}." },
    fallback: { first: "Key skills include {}.", next: "Other skills include {}." },
    more: "Further skills include {}.",
  },
  nl: {
    "Languages & Frameworks": { first: "Schrijft software vooral in {}.", next: "Programmeert vooral in {}." },
    "Frontend Development": { first: "Bouwt webinterfaces met {}.", next: "Aan de front-end werkt met {}." },
    "Backend & APIs": { first: "Ontwikkelt back-ends en APIs met {}.", next: "Aan de back-end werkt met {}." },
    Databases: { first: "Slaat gegevens op en bevraagt ze met {}.", next: "Voor gegevensopslag gebruikt {}." },
    "Cloud & DevOps": { first: "Bouwt, levert en beheert software met {}.", next: "Uitrol en beheer steunen op {}." },
    "Version Control": { first: "Beheert broncode met {}.", next: "Broncode staat in {}." },
    "Testing & QA": { first: "Test software met {}.", next: "Kwaliteit wordt bewaakt met {}." },
    "Tools & IDEs": { first: "Werkt dagelijks met {}.", next: "Dagelijkse hulpmiddelen zijn {}." },
    "Data & Analytics": { first: "Analyseert gegevens met {}.", next: "Voor datawerk gebruikt {}." },
    "AI & Machine Learning": { first: "Bouwt AI-functies met {}.", next: "Voor AI-werk gebruikt {}." },
    "Project & Process": { first: "Organiseert werk met {}.", next: "Werk wordt georganiseerd met {}." },
    fallback: { first: "Belangrijke vaardigheden zijn {}.", next: "Andere vaardigheden zijn {}." },
    more: "Verder ook {}.",
  },
  fr: {
    "Languages & Frameworks": { first: "Développe principalement en {}.", next: "La programmation se fait surtout en {}." },
    "Frontend Development": { first: "Conçoit des interfaces web avec {}.", next: "Côté front-end, travaille avec {}." },
    "Backend & APIs": { first: "Développe des back-ends et des APIs avec {}.", next: "Côté back-end, travaille avec {}." },
    Databases: { first: "Stocke et interroge les données avec {}.", next: "Pour le stockage des données, utilise {}." },
    "Cloud & DevOps": { first: "Construit, livre et exploite des logiciels avec {}.", next: "Le déploiement et l'exploitation reposent sur {}." },
    "Version Control": { first: "Gère le code source avec {}.", next: "Le code source est géré avec {}." },
    "Testing & QA": { first: "Teste les logiciels avec {}.", next: "La qualité est vérifiée avec {}." },
    "Tools & IDEs": { first: "Travaille au quotidien avec {}.", next: "Les outils du quotidien sont {}." },
    "Data & Analytics": { first: "Analyse les données avec {}.", next: "Pour le travail sur les données, utilise {}." },
    "AI & Machine Learning": { first: "Construit des fonctions d'IA avec {}.", next: "Le travail en IA s'appuie sur {}." },
    "Project & Process": { first: "Organise le travail avec {}.", next: "Le travail est organisé avec {}." },
    fallback: { first: "Les compétences clés sont {}.", next: "D'autres compétences sont {}." },
    more: "Également {}.",
  },
  de: {
    "Languages & Frameworks": { first: "Entwickelt Software vor allem in {}.", next: "Programmiert wird vor allem in {}." },
    "Frontend Development": { first: "Baut Weboberflächen mit {}.", next: "Im Frontend kommen {} zum Einsatz." },
    "Backend & APIs": { first: "Entwickelt Backends und APIs mit {}.", next: "Im Backend kommen {} zum Einsatz." },
    Databases: { first: "Speichert und verarbeitet Daten mit {}.", next: "Für die Datenhaltung kommen {} zum Einsatz." },
    "Cloud & DevOps": { first: "Baut, liefert und betreibt Software mit {}.", next: "Bereitstellung und Betrieb stützen sich auf {}." },
    "Version Control": { first: "Verwaltet Quellcode mit {}.", next: "Der Quellcode liegt in {}." },
    "Testing & QA": { first: "Testet Software mit {}.", next: "Die Qualität wird mit {} geprüft." },
    "Tools & IDEs": { first: "Arbeitet täglich mit {}.", next: "Im Alltag kommen {} zum Einsatz." },
    "Data & Analytics": { first: "Analysiert Daten mit {}.", next: "Für die Datenarbeit kommen {} zum Einsatz." },
    "AI & Machine Learning": { first: "Baut KI-Funktionen mit {}.", next: "Für KI-Arbeit kommen {} zum Einsatz." },
    "Project & Process": { first: "Organisiert die Arbeit mit {}.", next: "Die Arbeit wird mit {} organisiert." },
    fallback: { first: "Wichtige Kenntnisse sind {}.", next: "Weitere Kenntnisse sind {}." },
    more: "Außerdem {}.",
  },
};

/**
 * Deterministic, offline provider: zero cost, no network, the only one CI
 * runs. Each skill group becomes one plain sentence from a fixed frame per
 * theme (FRAMES), in skill order, so it adds no fact and always passes
 * check.ts. It finds a group's theme from its `category` (the taxonomy
 * key behind the translated label). A large group is split into
 * bounded sentences, and it stops before the paragraph limit, so one huge
 * group can't make the checker drop everything.
 */
export class SkillsParagraphFixtureProvider implements SkillsParagraphProvider {
  readonly name = "fixture";

  async write(call: SkillsParagraphProviderCall): Promise<SkillsParagraphProviderOutput> {
    const frames = FRAMES[call.language] ?? FRAMES.en;
    const sentences: string[] = [];
    for (const group of call.groups) {
      const category = group.category ?? null;
      const lead = (category && frames[category as SkillCategory]) || frames.fallback;
      let chunk: string[] = [];
      let usedLead = false;
      const flush = () => {
        if (chunk.length === 0) return;
        const frame = usedLead ? frames.more : sentences.length === 0 ? lead.first : lead.next;
        sentences.push(frame.replace("{}", joinList(chunk, call.language)));
        usedLead = true;
        chunk = [];
      };
      for (const skill of group.skills) {
        if (chunk.length > 0 && [...chunk, skill].join(", ").length + 60 > MAX_SENTENCE) flush();
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
