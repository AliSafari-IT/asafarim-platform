import type { Dictionaries } from "@asafarim/shared-i18n";

/**
 * One-time calendar export (#969, calendar-export.md): the "Add to
 * calendar" actions on the application card and on interview entries, and
 * the wording inside the downloaded .ics file (translated on the server in
 * the candidate's language).
 */
export const calendarDictionaries: Dictionaries = {
  en: {
    "resumatch.cal.add": "Add to calendar",
    "resumatch.cal.note":
      "A one-time .ics download. Changing or removing this in ResuMatch won't update an event you've already imported, and reminders depend on your calendar's settings.",
    "resumatch.cal.saveFirst": "Add to calendar is available once the date is saved.",
    "resumatch.cal.event.followUpTitle": "Follow up: {job}",
    "resumatch.cal.event.interviewTitle": "Interview: {job}",
    "resumatch.cal.event.jobAt": "{title} at {employer}",
    "resumatch.cal.event.untitled": "Job application",
    "resumatch.cal.event.link": "Application in ResuMatch: {url}",
    "resumatch.cal.event.savedTime": "Time as saved in ResuMatch: {time} ({zone})",
    "resumatch.cal.event.oneTime": "Exported once from ResuMatch. Changes made there don't update this event.",
    "resumatch.cal.file.followUp": "Follow-up",
    "resumatch.cal.file.interview": "Interview",
  },
  nl: {
    "resumatch.cal.add": "Toevoegen aan agenda",
    "resumatch.cal.note":
      "Een eenmalige .ics-download. Als je dit in ResuMatch wijzigt of verwijdert, wordt een al geïmporteerde afspraak niet bijgewerkt. Herinneringen hangen af van de instellingen van je agenda.",
    "resumatch.cal.saveFirst": "Toevoegen aan agenda kan zodra de datum is opgeslagen.",
    "resumatch.cal.event.followUpTitle": "Opvolgen: {job}",
    "resumatch.cal.event.interviewTitle": "Sollicitatiegesprek: {job}",
    "resumatch.cal.event.jobAt": "{title} bij {employer}",
    "resumatch.cal.event.untitled": "Sollicitatie",
    "resumatch.cal.event.link": "Sollicitatie in ResuMatch: {url}",
    "resumatch.cal.event.savedTime": "Tijd zoals opgeslagen in ResuMatch: {time} ({zone})",
    "resumatch.cal.event.oneTime": "Eenmalig geëxporteerd uit ResuMatch. Wijzigingen daar werken deze afspraak niet bij.",
    "resumatch.cal.file.followUp": "Opvolging",
    "resumatch.cal.file.interview": "Gesprek",
  },
  fr: {
    "resumatch.cal.add": "Ajouter au calendrier",
    "resumatch.cal.note":
      "Un téléchargement .ics ponctuel. Modifier ou supprimer cet élément dans ResuMatch ne met pas à jour un événement déjà importé, et les rappels dépendent des réglages de votre calendrier.",
    "resumatch.cal.saveFirst": "L’ajout au calendrier est possible une fois la date enregistrée.",
    "resumatch.cal.event.followUpTitle": "Relance : {job}",
    "resumatch.cal.event.interviewTitle": "Entretien : {job}",
    "resumatch.cal.event.jobAt": "{title} chez {employer}",
    "resumatch.cal.event.untitled": "Candidature",
    "resumatch.cal.event.link": "Candidature dans ResuMatch : {url}",
    "resumatch.cal.event.savedTime": "Heure enregistrée dans ResuMatch : {time} ({zone})",
    "resumatch.cal.event.oneTime": "Exporté une seule fois depuis ResuMatch. Les modifications faites là-bas ne mettent pas cet événement à jour.",
    "resumatch.cal.file.followUp": "Relance",
    "resumatch.cal.file.interview": "Entretien",
  },
  de: {
    "resumatch.cal.add": "Zum Kalender hinzufügen",
    "resumatch.cal.note":
      "Ein einmaliger .ics-Download. Änderungen oder Löschungen in ResuMatch aktualisieren einen bereits importierten Termin nicht, und Erinnerungen hängen von den Einstellungen Ihres Kalenders ab.",
    "resumatch.cal.saveFirst": "Zum Kalender hinzufügen ist möglich, sobald das Datum gespeichert ist.",
    "resumatch.cal.event.followUpTitle": "Nachfassen: {job}",
    "resumatch.cal.event.interviewTitle": "Vorstellungsgespräch: {job}",
    "resumatch.cal.event.jobAt": "{title} bei {employer}",
    "resumatch.cal.event.untitled": "Bewerbung",
    "resumatch.cal.event.link": "Bewerbung in ResuMatch: {url}",
    "resumatch.cal.event.savedTime": "Uhrzeit wie in ResuMatch gespeichert: {time} ({zone})",
    "resumatch.cal.event.oneTime": "Einmalig aus ResuMatch exportiert. Änderungen dort aktualisieren diesen Termin nicht.",
    "resumatch.cal.file.followUp": "Nachfassen",
    "resumatch.cal.file.interview": "Vorstellungsgespräch",
  },
};
