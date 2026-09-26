import type { Dictionaries } from "@asafarim/shared-i18n";

/**
 * Header navigation. Labels are kept short on purpose: all eight must fit
 * beside the language bar at laptop widths (see the media query in
 * resumatch.css). "Historiek" is the usual Belgian-Dutch word; "Roadmap" is
 * standard in French product UIs.
 */
export const navDictionaries: Dictionaries = {
  en: {
    "resumatch.nav.overview": "Overview",
    "resumatch.nav.roadmap": "Roadmap",
    "resumatch.nav.workspace": "Workspace",
    "resumatch.nav.profile": "Profile",
    "resumatch.nav.tailor": "Tailor",
    "resumatch.nav.history": "History",
    "resumatch.nav.applications": "Applications",
    "resumatch.nav.aiUsage": "AI usage",
  },
  nl: {
    "resumatch.nav.overview": "Overzicht",
    "resumatch.nav.roadmap": "Roadmap",
    "resumatch.nav.workspace": "Werkruimte",
    "resumatch.nav.profile": "Profiel",
    "resumatch.nav.tailor": "Afstemmen",
    "resumatch.nav.history": "Historiek",
    "resumatch.nav.applications": "Sollicitaties",
    "resumatch.nav.aiUsage": "AI-gebruik",
  },
  fr: {
    "resumatch.nav.overview": "Aperçu",
    "resumatch.nav.roadmap": "Roadmap",
    "resumatch.nav.workspace": "Mon espace",
    "resumatch.nav.profile": "Profil",
    "resumatch.nav.tailor": "Adapter",
    "resumatch.nav.history": "Historique",
    "resumatch.nav.applications": "Candidatures",
    "resumatch.nav.aiUsage": "Usage de l’IA",
  },
  de: {
    "resumatch.nav.overview": "Übersicht",
    "resumatch.nav.roadmap": "Roadmap",
    "resumatch.nav.workspace": "Arbeitsbereich",
    "resumatch.nav.profile": "Profil",
    "resumatch.nav.tailor": "Anpassen",
    "resumatch.nav.history": "Verlauf",
    "resumatch.nav.applications": "Bewerbungen",
    "resumatch.nav.aiUsage": "KI-Nutzung",
  },
};
