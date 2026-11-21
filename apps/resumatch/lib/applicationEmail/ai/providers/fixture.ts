import { applicationEmailSuggestionSchema } from "../schema";
import type { ApplicationEmailProvider, ApplicationEmailProviderCall, ApplicationEmailProviderOutput } from "../provider";

/**
 * Deterministic, offline provider: zero cost, no network, the only one CI
 * runs. Fixed wording per language with the job title and employer filled
 * in, so it always passes the grounding check.
 */
const COPY = {
  en: {
    subject: (role: string) => `Application: ${role}`,
    greeting: (name: string | null) => (name ? `Dear ${name},` : "Dear Hiring Manager,"),
    apply: (role: string, at: string) => `I would like to apply for the ${role} position${at}.`,
    attached: "Please find my CV and cover letter attached.",
    close: "I would welcome the opportunity to discuss my application with you.",
    signOff: "Kind regards,",
    at: (employer: string) => ` at ${employer}`,
    role: "advertised",
  },
  nl: {
    subject: (role: string) => `Sollicitatie: ${role}`,
    greeting: (name: string | null) => (name ? `Beste ${name},` : "Geachte heer/mevrouw,"),
    apply: (role: string, at: string) => `Graag solliciteer ik naar de functie ${role}${at}.`,
    attached: "In de bijlage vindt u mijn cv en motivatiebrief.",
    close: "Ik licht mijn kandidatuur graag toe in een gesprek.",
    signOff: "Met vriendelijke groet,",
    at: (employer: string) => ` bij ${employer}`,
    role: "uit de vacature",
  },
  fr: {
    subject: (role: string) => `Candidature : ${role}`,
    greeting: (name: string | null) => (name ? `Bonjour ${name},` : "Madame, Monsieur,"),
    apply: (role: string, at: string) => `Je souhaite poser ma candidature au poste de ${role}${at}.`,
    attached: "Vous trouverez ci-joint mon CV et ma lettre de motivation.",
    close: "Je serais heureux d'échanger avec vous au sujet de ma candidature.",
    signOff: "Cordialement,",
    at: (employer: string) => ` chez ${employer}`,
    role: "proposé",
  },
  de: {
    subject: (role: string) => `Bewerbung: ${role}`,
    greeting: (name: string | null) => (name ? `Guten Tag ${name},` : "Sehr geehrte Damen und Herren,"),
    apply: (role: string, at: string) => `hiermit bewerbe ich mich um die Stelle ${role}${at}.`,
    attached: "Meinen Lebenslauf und mein Anschreiben finden Sie im Anhang.",
    close: "Über die Gelegenheit zu einem persönlichen Gespräch freue ich mich.",
    signOff: "Mit freundlichen Grüßen",
    at: (employer: string) => ` bei ${employer}`,
    role: "ausgeschriebene",
  },
} as const;

export class ApplicationEmailFixtureProvider implements ApplicationEmailProvider {
  readonly name = "fixture";

  async generate(call: ApplicationEmailProviderCall): Promise<ApplicationEmailProviderOutput> {
    const copy = COPY[call.language];
    const role = call.jobTitle ?? copy.role;
    const at = call.employer ? copy.at(call.employer) : "";
    const suggestion = applicationEmailSuggestionSchema.parse({
      subject: copy.subject(role),
      greeting: copy.greeting(call.contactName),
      paragraphs: [`${copy.apply(role, at)} ${copy.attached}`, copy.close],
      signOff: copy.signOff,
    });
    return {
      suggestion,
      inputTokens: Math.ceil(call.user.length / 4),
      outputTokens: Math.ceil(JSON.stringify(suggestion).length / 4),
      costUsd: 0,
    };
  }
}
