import type { Dictionaries } from "@asafarim/shared-i18n";

/**
 * Tailor drafts (lib/tailoring/drafts): the resume note and save status in
 * the Tailor flow, "Fetch again" for a reused fetch, and the "Unfinished
 * jobs" list on /tailor.
 */
export const draftsDictionaries: Dictionaries = {
  en: {
    "resumatch.drafts.title": "Unfinished jobs",
    "resumatch.drafts.sub":
      "Jobs you started tailoring but haven't saved a CV for. Each is kept for {days} days after your last change.",
    "resumatch.drafts.untitled": "Untitled job",
    "resumatch.drafts.step.options": "Choosing options",
    "resumatch.drafts.step.review": "In review",
    "resumatch.drafts.updated": "Last change {date}",
    "resumatch.drafts.resume": "Resume",
    "resumatch.drafts.discard": "Discard",
    "resumatch.drafts.discardTitle": "Discard this unfinished job?",
    "resumatch.drafts.discardBody":
      "Your choices for this job and any review edits are deleted. Saved CVs and letters are not touched.",
    "resumatch.drafts.keep": "Keep it",
    "resumatch.drafts.discardFailed": "Couldn't discard it. Try again.",
    "resumatch.flow.draft.resumed": "Picked up where you left off. This job was read on {date} and isn't fetched again.",
    "resumatch.flow.draft.reviewExpired":
      "Your last review of this job was already saved or has expired, so you're back on the options. Run it again for a new review.",
    "resumatch.flow.draft.saving": "Saving your progress…",
    "resumatch.flow.draft.saved": "Progress saved. You can leave and come back.",
    "resumatch.flow.draft.saveFailed": "Couldn't save your progress. It's still on this page.",
    "resumatch.flow.draft.startNew": "Start a new job",
    "resumatch.flow.draft.discard": "Discard this job",
    "resumatch.flow.reused": "You already fetched this link on {date}, so it wasn't fetched again.",
    "resumatch.flow.fetchAgain": "Fetch again",
  },
  nl: {
    "resumatch.drafts.title": "Onafgewerkte vacatures",
    "resumatch.drafts.sub":
      "Vacatures waarvoor je begon met aanpassen maar nog geen cv bewaarde. Elk blijft {days} dagen na je laatste wijziging bewaard.",
    "resumatch.drafts.untitled": "Vacature zonder titel",
    "resumatch.drafts.step.options": "Opties kiezen",
    "resumatch.drafts.step.review": "Nakijken",
    "resumatch.drafts.updated": "Laatste wijziging {date}",
    "resumatch.drafts.resume": "Verdergaan",
    "resumatch.drafts.discard": "Weggooien",
    "resumatch.drafts.discardTitle": "Deze onafgewerkte vacature weggooien?",
    "resumatch.drafts.discardBody":
      "Je keuzes voor deze vacature en je aanpassingen in het nakijken worden verwijderd. Bewaarde cv's en brieven blijven zoals ze zijn.",
    "resumatch.drafts.keep": "Bewaren",
    "resumatch.drafts.discardFailed": "Weggooien lukte niet. Probeer opnieuw.",
    "resumatch.flow.draft.resumed": "Je gaat verder waar je was. Deze vacature werd gelezen op {date} en wordt niet opnieuw opgehaald.",
    "resumatch.flow.draft.reviewExpired":
      "Je laatste nakijkronde voor deze vacature is al bewaard of verlopen, dus je bent terug bij de opties. Start opnieuw voor een nieuw voorstel.",
    "resumatch.flow.draft.saving": "Je voortgang wordt bewaard…",
    "resumatch.flow.draft.saved": "Voortgang bewaard. Je kunt weggaan en later verdergaan.",
    "resumatch.flow.draft.saveFailed": "Je voortgang kon niet bewaard worden. Ze staat nog op deze pagina.",
    "resumatch.flow.draft.startNew": "Nieuwe vacature beginnen",
    "resumatch.flow.draft.discard": "Deze vacature weggooien",
    "resumatch.flow.reused": "Je haalde deze link al op {date} op, dus hij werd niet opnieuw opgehaald.",
    "resumatch.flow.fetchAgain": "Opnieuw ophalen",
  },
  fr: {
    "resumatch.drafts.title": "Offres en cours",
    "resumatch.drafts.sub":
      "Les offres pour lesquelles vous avez commencé l’adaptation sans encore enregistrer de CV. Chacune est conservée {days} jours après votre dernière modification.",
    "resumatch.drafts.untitled": "Offre sans titre",
    "resumatch.drafts.step.options": "Choix des options",
    "resumatch.drafts.step.review": "En relecture",
    "resumatch.drafts.updated": "Dernière modification {date}",
    "resumatch.drafts.resume": "Reprendre",
    "resumatch.drafts.discard": "Abandonner",
    "resumatch.drafts.discardTitle": "Abandonner cette offre en cours ?",
    "resumatch.drafts.discardBody":
      "Vos choix pour cette offre et vos modifications de relecture sont supprimés. Les CV et lettres enregistrés ne sont pas touchés.",
    "resumatch.drafts.keep": "La garder",
    "resumatch.drafts.discardFailed": "Impossible de l’abandonner. Réessayez.",
    "resumatch.flow.draft.resumed": "Vous reprenez là où vous en étiez. Cette offre a été lue le {date} et n’est pas récupérée à nouveau.",
    "resumatch.flow.draft.reviewExpired":
      "Votre dernière relecture pour cette offre a déjà été enregistrée ou a expiré : vous revenez aux options. Relancez pour une nouvelle relecture.",
    "resumatch.flow.draft.saving": "Enregistrement de votre progression…",
    "resumatch.flow.draft.saved": "Progression enregistrée. Vous pouvez partir et revenir plus tard.",
    "resumatch.flow.draft.saveFailed": "Impossible d’enregistrer votre progression. Elle reste sur cette page.",
    "resumatch.flow.draft.startNew": "Commencer une nouvelle offre",
    "resumatch.flow.draft.discard": "Abandonner cette offre",
    "resumatch.flow.reused": "Vous avez déjà récupéré ce lien le {date} : il n’a pas été récupéré à nouveau.",
    "resumatch.flow.fetchAgain": "Récupérer à nouveau",
  },
  de: {
    "resumatch.drafts.title": "Offene Stellen",
    "resumatch.drafts.sub":
      "Stellen, für die du mit dem Anpassen begonnen, aber noch keinen Lebenslauf gespeichert hast. Jede bleibt {days} Tage nach deiner letzten Änderung erhalten.",
    "resumatch.drafts.untitled": "Stelle ohne Titel",
    "resumatch.drafts.step.options": "Optionen wählen",
    "resumatch.drafts.step.review": "In Prüfung",
    "resumatch.drafts.updated": "Letzte Änderung {date}",
    "resumatch.drafts.resume": "Fortsetzen",
    "resumatch.drafts.discard": "Verwerfen",
    "resumatch.drafts.discardTitle": "Diese offene Stelle verwerfen?",
    "resumatch.drafts.discardBody":
      "Deine Einstellungen für diese Stelle und deine Änderungen in der Prüfung werden gelöscht. Gespeicherte Lebensläufe und Anschreiben bleiben unberührt.",
    "resumatch.drafts.keep": "Behalten",
    "resumatch.drafts.discardFailed": "Verwerfen hat nicht geklappt. Versuch es noch einmal.",
    "resumatch.flow.draft.resumed": "Du machst dort weiter, wo du aufgehört hast. Diese Stelle wurde am {date} gelesen und wird nicht erneut abgerufen.",
    "resumatch.flow.draft.reviewExpired":
      "Deine letzte Prüfung für diese Stelle wurde schon gespeichert oder ist abgelaufen, daher bist du wieder bei den Optionen. Starte erneut für eine neue Prüfung.",
    "resumatch.flow.draft.saving": "Dein Fortschritt wird gespeichert…",
    "resumatch.flow.draft.saved": "Fortschritt gespeichert. Du kannst gehen und später weitermachen.",
    "resumatch.flow.draft.saveFailed": "Dein Fortschritt konnte nicht gespeichert werden. Er ist noch auf dieser Seite.",
    "resumatch.flow.draft.startNew": "Neue Stelle beginnen",
    "resumatch.flow.draft.discard": "Diese Stelle verwerfen",
    "resumatch.flow.reused": "Du hast diesen Link bereits am {date} abgerufen, daher wurde er nicht erneut abgerufen.",
    "resumatch.flow.fetchAgain": "Erneut abrufen",
  },
};
