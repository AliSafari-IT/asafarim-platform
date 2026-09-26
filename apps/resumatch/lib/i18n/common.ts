import type { Dictionaries } from "@asafarim/shared-i18n";

/**
 * Components shared across pages: the journey tracker, the output-language
 * badge, and the account-inactive notice. Counts use `.one` / `.other` key
 * pairs, since the shared formatter has no plural rules.
 */
export const commonDictionaries: Dictionaries = {
  en: {
    "resumatch.journey.aria": "Your progress",
    "resumatch.journey.title": "Your journey",
    "resumatch.journey.done": "Done: ",
    "resumatch.journey.profile": "Profile",
    "resumatch.journey.profile.confirmed": "Confirmed",
    "resumatch.journey.profile.pending": "Not confirmed yet",
    "resumatch.journey.tailor": "Tailor",
    "resumatch.journey.tailor.count.one": "{count} tailored CV",
    "resumatch.journey.tailor.count.other": "{count} tailored CVs",
    "resumatch.journey.tailor.none": "Nothing tailored yet",
    "resumatch.journey.track": "Track",
    "resumatch.journey.track.count.one": "{count} application",
    "resumatch.journey.track.count.other": "{count} applications",
    "resumatch.journey.track.none": "No applications yet",

    "resumatch.langBadge.writtenIn": "Written in ",
    "resumatch.langBadge.coverLetterWrittenIn": "Cover letter written in ",

    "resumatch.inactive.kicker": "Tailor",
    "resumatch.inactive.title": "This account cannot open a workspace.",
    "resumatch.inactive.strong": "Account inactive.",
    "resumatch.inactive.body": "Your platform account is not active, so ResuMatch will not open a workspace for it.",

    "resumatch.untitledJob": "Untitled job",
    "resumatch.coverLetter": "Cover letter",
    "resumatch.degraded": "Degraded",
  },
  nl: {
    "resumatch.journey.aria": "Je voortgang",
    "resumatch.journey.title": "Je traject",
    "resumatch.journey.done": "Klaar: ",
    "resumatch.journey.profile": "Profiel",
    "resumatch.journey.profile.confirmed": "Bevestigd",
    "resumatch.journey.profile.pending": "Nog niet bevestigd",
    "resumatch.journey.tailor": "Afstemmen",
    "resumatch.journey.tailor.count.one": "{count} afgestemd cv",
    "resumatch.journey.tailor.count.other": "{count} afgestemde cv’s",
    "resumatch.journey.tailor.none": "Nog niets afgestemd",
    "resumatch.journey.track": "Opvolgen",
    "resumatch.journey.track.count.one": "{count} sollicitatie",
    "resumatch.journey.track.count.other": "{count} sollicitaties",
    "resumatch.journey.track.none": "Nog geen sollicitaties",

    "resumatch.langBadge.writtenIn": "Geschreven in: ",
    "resumatch.langBadge.coverLetterWrittenIn": "Motivatiebrief geschreven in: ",

    "resumatch.inactive.kicker": "Afstemmen",
    "resumatch.inactive.title": "Dit account kan geen werkruimte openen.",
    "resumatch.inactive.strong": "Account inactief.",
    "resumatch.inactive.body": "Je platformaccount is niet actief, dus ResuMatch opent er geen werkruimte voor.",

    "resumatch.untitledJob": "Vacature zonder titel",
    "resumatch.coverLetter": "Motivatiebrief",
    "resumatch.degraded": "Beperkt",
  },
  fr: {
    "resumatch.journey.aria": "Votre progression",
    "resumatch.journey.title": "Votre parcours",
    "resumatch.journey.done": "Terminé : ",
    "resumatch.journey.profile": "Profil",
    "resumatch.journey.profile.confirmed": "Confirmé",
    "resumatch.journey.profile.pending": "Pas encore confirmé",
    "resumatch.journey.tailor": "Adapter",
    "resumatch.journey.tailor.count.one": "{count} CV adapté",
    "resumatch.journey.tailor.count.other": "{count} CV adaptés",
    "resumatch.journey.tailor.none": "Rien d’adapté pour l’instant",
    "resumatch.journey.track": "Suivre",
    "resumatch.journey.track.count.one": "{count} candidature",
    "resumatch.journey.track.count.other": "{count} candidatures",
    "resumatch.journey.track.none": "Aucune candidature pour l’instant",

    "resumatch.langBadge.writtenIn": "Rédigé en : ",
    "resumatch.langBadge.coverLetterWrittenIn": "Lettre de motivation rédigée en : ",

    "resumatch.inactive.kicker": "Adapter",
    "resumatch.inactive.title": "Ce compte ne peut pas ouvrir d’espace de travail.",
    "resumatch.inactive.strong": "Compte inactif.",
    "resumatch.inactive.body":
      "Votre compte plateforme n’est pas actif, ResuMatch n’ouvrira donc pas d’espace de travail pour celui-ci.",

    "resumatch.untitledJob": "Offre sans titre",
    "resumatch.coverLetter": "Lettre de motivation",
    "resumatch.degraded": "Dégradé",
  },
  de: {
    "resumatch.journey.aria": "Dein Fortschritt",
    "resumatch.journey.title": "Dein Weg",
    "resumatch.journey.done": "Erledigt: ",
    "resumatch.journey.profile": "Profil",
    "resumatch.journey.profile.confirmed": "Bestätigt",
    "resumatch.journey.profile.pending": "Noch nicht bestätigt",
    "resumatch.journey.tailor": "Anpassen",
    "resumatch.journey.tailor.count.one": "{count} angepasster Lebenslauf",
    "resumatch.journey.tailor.count.other": "{count} angepasste Lebensläufe",
    "resumatch.journey.tailor.none": "Noch nichts angepasst",
    "resumatch.journey.track": "Verfolgen",
    "resumatch.journey.track.count.one": "{count} Bewerbung",
    "resumatch.journey.track.count.other": "{count} Bewerbungen",
    "resumatch.journey.track.none": "Noch keine Bewerbungen",

    "resumatch.langBadge.writtenIn": "Verfasst auf: ",
    "resumatch.langBadge.coverLetterWrittenIn": "Anschreiben verfasst auf: ",

    "resumatch.inactive.kicker": "Anpassen",
    "resumatch.inactive.title": "Dieses Konto kann keinen Arbeitsbereich öffnen.",
    "resumatch.inactive.strong": "Konto inaktiv.",
    "resumatch.inactive.body":
      "Dein Plattformkonto ist nicht aktiv, daher öffnet ResuMatch keinen Arbeitsbereich dafür.",

    "resumatch.untitledJob": "Stelle ohne Titel",
    "resumatch.coverLetter": "Anschreiben",
    "resumatch.degraded": "Eingeschränkt",
  },
};
