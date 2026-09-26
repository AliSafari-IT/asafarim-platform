import type { Dictionaries } from "@asafarim/shared-i18n";

/**
 * The tailored-CV and cover-letter preview pages, their toolbars, and the
 * deterministic checklists (coverage, CV quality, letter quality) — the
 * letter checklist also renders inside TailorFlow's review step. The CV
 * and letter themselves are not here: they stay in their output language.
 */
export const previewDictionaries: Dictionaries = {
  en: {
    "resumatch.preview.metaTitle": "Preview",
    "resumatch.preview.kicker": "Tailor",
    "resumatch.preview.title": "Your tailored CV",
    "resumatch.preview.description": "Tailored toward {job}.",
    "resumatch.preview.langNote":
      "Written in {language}. Employers, job titles, dates, education and skill names are kept exactly as in your profile.",
    "resumatch.preview.degraded":
      "This version could not be AI-tailored right now (budget or provider issue), so it shows your confirmed profile carried over unchanged. Try generating it again later.",
    "resumatch.preview.viewCoverLetter": "View cover letter",
    "resumatch.preview.noCoverLetter": "No cover letter for this CV.",
    "resumatch.preview.downloadPdf": "Download PDF",
    "resumatch.preview.downloadDocx": "Download DOCX",
    "resumatch.preview.saveApplication": "Save to applications",
    "resumatch.preview.savedApplication": "Saved to applications",
    "resumatch.preview.saveApplicationError": "Could not save — try again",

    "resumatch.letter.title": "Your cover letter",
    "resumatch.letter.description": "Written for {job}.",
    "resumatch.letter.backToCv": "← View the tailored CV it goes with",
    "resumatch.letter.langNote":
      "Written in {language}. Names, numbers and dates are kept exactly as in your profile and the job.",
    "resumatch.letter.degraded": "This letter could not be AI-drafted right now (budget or provider issue).",

    "resumatch.coverage.title": "Coverage of this posting",
    "resumatch.coverage.percent": "{percent}% of your skills matched",
    "resumatch.coverage.matched": "Matched",
    "resumatch.coverage.missing": "Not covered",
    "resumatch.coverage.note":
      "A rough, deterministic read of this posting's own wording against your resume — not an ATS score, and never a reason to add a skill you don't have. Some \"not covered\" terms are simply irrelevant to you.",

    "resumatch.quality.title": "Document hygiene",
    "resumatch.quality.metric": "Bullets include a metric",
    "resumatch.quality.metric.detail": "{withMetric} of {total} bullets contain a number.",
    "resumatch.quality.verb": "Bullets open with a strong action verb",
    "resumatch.quality.verb.detail.one": "{count} bullet opens on a weak or passive verb.",
    "resumatch.quality.verb.detail.other": "{count} bullets open on a weak or passive verb.",
    "resumatch.quality.length": "Bullets are print-friendly length",
    "resumatch.quality.length.detail.one": "{count} bullet likely wraps to a second line.",
    "resumatch.quality.length.detail.other": "{count} bullets likely wrap to a second line.",
    "resumatch.quality.contact": "Contact details and headline complete",
    "resumatch.quality.contact.detail": "Missing: {fields}.",
    "resumatch.quality.field.headline": "Headline",
    "resumatch.quality.field.summary": "Summary",
    "resumatch.quality.field.email": "Email",
    "resumatch.quality.field.phone": "Phone",
    "resumatch.quality.skills": "Skills count looks reasonable",
    "resumatch.quality.skills.low.one": "Only {count} skill listed — consider adding more.",
    "resumatch.quality.skills.low.other": "Only {count} skills listed — consider adding more.",
    "resumatch.quality.skills.high": "{count} skills listed — consider trimming to the most relevant.",

    "resumatch.letterQuality.title": "Letter hygiene",
    "resumatch.letterQuality.length": "Length fits the target",
    "resumatch.letterQuality.length.detail.one": "{words} words across {count} paragraph",
    "resumatch.letterQuality.length.detail.other": "{words} words across {count} paragraphs",
    "resumatch.letterQuality.length.outOfRange": " — outside the usual range for this length.",
    "resumatch.letterQuality.generic": "No generic filler phrases",
    "resumatch.letterQuality.generic.detail":
      "Found: {phrases} — these read as templated to most ATS/recruiter screens.",
    "resumatch.letterQuality.placeholder": "No unfilled placeholders",
    "resumatch.letterQuality.placeholder.detail":
      "A bracketed placeholder like [Company Name] appears somewhere in the letter — fill it in or remove it.",
    "resumatch.letterQuality.greeting": "Greeting looks intentional",
    "resumatch.letterQuality.greeting.detail":
      "The greeting looks like it still has a placeholder in it rather than a real or neutral salutation.",
    "resumatch.letterQuality.language": "Greeting and sign-off match the letter's language",
    "resumatch.letterQuality.language.detail":
      "The greeting or sign-off looks like it's in another language (for example an English “Dear …” or “Sincerely,”) — use this language's own formula.",
    "resumatch.letterQuality.signed": "Signed with your name",
    "resumatch.letterQuality.signed.detail": "Your confirmed profile has no name to sign this with yet.",
  },
  nl: {
    "resumatch.preview.metaTitle": "Voorbeeld",
    "resumatch.preview.kicker": "Afstemmen",
    "resumatch.preview.title": "Je afgestemde cv",
    "resumatch.preview.description": "Afgestemd op {job}.",
    "resumatch.preview.langNote":
      "Geschreven in het {language}. Werkgevers, functietitels, datums, opleidingen en vaardigheden blijven exact zoals in je profiel.",
    "resumatch.preview.degraded":
      "Deze versie kon nu niet door AI worden afgestemd (budget- of providerprobleem), dus ze toont je bevestigde profiel ongewijzigd. Probeer later opnieuw te genereren.",
    "resumatch.preview.viewCoverLetter": "Motivatiebrief bekijken",
    "resumatch.preview.noCoverLetter": "Geen motivatiebrief bij dit cv.",
    "resumatch.preview.downloadPdf": "Pdf downloaden",
    "resumatch.preview.downloadDocx": "DOCX downloaden",
    "resumatch.preview.saveApplication": "Bewaren bij sollicitaties",
    "resumatch.preview.savedApplication": "Bewaard bij sollicitaties",
    "resumatch.preview.saveApplicationError": "Bewaren mislukt — probeer opnieuw",

    "resumatch.letter.title": "Je motivatiebrief",
    "resumatch.letter.description": "Geschreven voor {job}.",
    "resumatch.letter.backToCv": "← Bekijk het afgestemde cv dat erbij hoort",
    "resumatch.letter.langNote":
      "Geschreven in het {language}. Namen, cijfers en datums blijven exact zoals in je profiel en de vacature.",
    "resumatch.letter.degraded": "Deze brief kon nu niet door AI worden opgesteld (budget- of providerprobleem).",

    "resumatch.coverage.title": "Dekking van deze vacature",
    "resumatch.coverage.percent": "{percent}% van je vaardigheden komt overeen",
    "resumatch.coverage.matched": "Overeenkomend",
    "resumatch.coverage.missing": "Niet gedekt",
    "resumatch.coverage.note":
      "Een ruwe, deterministische vergelijking van de eigen formulering van deze vacature met je cv — geen ATS-score, en nooit een reden om een vaardigheid toe te voegen die je niet hebt. Sommige ‘niet gedekte’ termen zijn gewoon niet relevant voor jou.",

    "resumatch.quality.title": "Documentcontrole",
    "resumatch.quality.metric": "Punten bevatten een meetbaar resultaat",
    "resumatch.quality.metric.detail": "{withMetric} van de {total} punten bevatten een getal.",
    "resumatch.quality.verb": "Punten beginnen met een sterk actiewerkwoord",
    "resumatch.quality.verb.detail.one": "{count} punt begint met een zwak of passief werkwoord.",
    "resumatch.quality.verb.detail.other": "{count} punten beginnen met een zwak of passief werkwoord.",
    "resumatch.quality.length": "Punten hebben een printvriendelijke lengte",
    "resumatch.quality.length.detail.one": "{count} punt loopt waarschijnlijk door op een tweede regel.",
    "resumatch.quality.length.detail.other": "{count} punten lopen waarschijnlijk door op een tweede regel.",
    "resumatch.quality.contact": "Contactgegevens en titel volledig",
    "resumatch.quality.contact.detail": "Ontbreekt: {fields}.",
    "resumatch.quality.field.headline": "Titel",
    "resumatch.quality.field.summary": "Samenvatting",
    "resumatch.quality.field.email": "E-mail",
    "resumatch.quality.field.phone": "Telefoon",
    "resumatch.quality.skills": "Aantal vaardigheden ziet er redelijk uit",
    "resumatch.quality.skills.low.one": "Slechts {count} vaardigheid vermeld — overweeg er meer toe te voegen.",
    "resumatch.quality.skills.low.other": "Slechts {count} vaardigheden vermeld — overweeg er meer toe te voegen.",
    "resumatch.quality.skills.high": "{count} vaardigheden vermeld — overweeg in te korten tot de meest relevante.",

    "resumatch.letterQuality.title": "Briefcontrole",
    "resumatch.letterQuality.length": "Lengte past bij het doel",
    "resumatch.letterQuality.length.detail.one": "{words} woorden in {count} alinea",
    "resumatch.letterQuality.length.detail.other": "{words} woorden in {count} alinea’s",
    "resumatch.letterQuality.length.outOfRange": " — buiten het gebruikelijke bereik voor deze lengte.",
    "resumatch.letterQuality.generic": "Geen algemene opvulzinnen",
    "resumatch.letterQuality.generic.detail":
      "Gevonden: {phrases} — die lezen voor de meeste ATS-systemen en recruiters als sjabloontekst.",
    "resumatch.letterQuality.placeholder": "Geen onafgewerkte plaatshouders",
    "resumatch.letterQuality.placeholder.detail":
      "Er staat ergens in de brief een plaatshouder tussen haken zoals [Bedrijfsnaam] — vul hem in of verwijder hem.",
    "resumatch.letterQuality.greeting": "Aanhef ziet er bewust uit",
    "resumatch.letterQuality.greeting.detail":
      "De aanhef lijkt nog een plaatshouder te bevatten in plaats van een echte of neutrale aanspreking.",
    "resumatch.letterQuality.language": "Aanhef en afsluiting passen bij de taal van de brief",
    "resumatch.letterQuality.language.detail":
      "De aanhef of afsluiting lijkt in een andere taal te staan (bijvoorbeeld een Engelse “Dear …” of “Sincerely,”) — gebruik de eigen formule van deze taal.",
    "resumatch.letterQuality.signed": "Ondertekend met je naam",
    "resumatch.letterQuality.signed.detail": "Je bevestigde profiel heeft nog geen naam om mee te ondertekenen.",
  },
  fr: {
    "resumatch.preview.metaTitle": "Aperçu",
    "resumatch.preview.kicker": "Adapter",
    "resumatch.preview.title": "Votre CV adapté",
    "resumatch.preview.description": "Adapté pour {job}.",
    "resumatch.preview.langNote":
      "Rédigé en {language}. Les employeurs, intitulés de poste, dates, formations et compétences restent exactement comme dans votre profil.",
    "resumatch.preview.degraded":
      "Cette version n’a pas pu être adaptée par l’IA pour le moment (problème de budget ou de fournisseur) ; elle reprend donc votre profil confirmé tel quel. Réessayez de la générer plus tard.",
    "resumatch.preview.viewCoverLetter": "Voir la lettre de motivation",
    "resumatch.preview.noCoverLetter": "Pas de lettre de motivation pour ce CV.",
    "resumatch.preview.downloadPdf": "Télécharger le PDF",
    "resumatch.preview.downloadDocx": "Télécharger le DOCX",
    "resumatch.preview.saveApplication": "Ajouter aux candidatures",
    "resumatch.preview.savedApplication": "Ajouté aux candidatures",
    "resumatch.preview.saveApplicationError": "Échec de l’enregistrement — réessayez",

    "resumatch.letter.title": "Votre lettre de motivation",
    "resumatch.letter.description": "Rédigée pour {job}.",
    "resumatch.letter.backToCv": "← Voir le CV adapté qui l’accompagne",
    "resumatch.letter.langNote":
      "Rédigée en {language}. Les noms, chiffres et dates restent exactement comme dans votre profil et l’offre.",
    "resumatch.letter.degraded":
      "Cette lettre n’a pas pu être rédigée par l’IA pour le moment (problème de budget ou de fournisseur).",

    "resumatch.coverage.title": "Couverture de cette offre",
    "resumatch.coverage.percent": "{percent} % de vos compétences correspondent",
    "resumatch.coverage.matched": "Correspondances",
    "resumatch.coverage.missing": "Non couverts",
    "resumatch.coverage.note":
      "Une lecture approximative et déterministe du vocabulaire de l’offre face à votre CV — pas un score ATS, et jamais une raison d’ajouter une compétence que vous n’avez pas. Certains termes « non couverts » ne vous concernent tout simplement pas.",

    "resumatch.quality.title": "Contrôle du document",
    "resumatch.quality.metric": "Les points contiennent un chiffre",
    "resumatch.quality.metric.detail": "{withMetric} points sur {total} contiennent un nombre.",
    "resumatch.quality.verb": "Les points commencent par un verbe d’action fort",
    "resumatch.quality.verb.detail.one": "{count} point commence par un verbe faible ou passif.",
    "resumatch.quality.verb.detail.other": "{count} points commencent par un verbe faible ou passif.",
    "resumatch.quality.length": "Les points ont une longueur adaptée à l’impression",
    "resumatch.quality.length.detail.one": "{count} point risque de passer sur une deuxième ligne.",
    "resumatch.quality.length.detail.other": "{count} points risquent de passer sur une deuxième ligne.",
    "resumatch.quality.contact": "Coordonnées et titre complets",
    "resumatch.quality.contact.detail": "Manquant : {fields}.",
    "resumatch.quality.field.headline": "Titre",
    "resumatch.quality.field.summary": "Résumé",
    "resumatch.quality.field.email": "E-mail",
    "resumatch.quality.field.phone": "Téléphone",
    "resumatch.quality.skills": "Le nombre de compétences semble raisonnable",
    "resumatch.quality.skills.low.one": "Seulement {count} compétence indiquée — pensez à en ajouter.",
    "resumatch.quality.skills.low.other": "Seulement {count} compétences indiquées — pensez à en ajouter.",
    "resumatch.quality.skills.high": "{count} compétences indiquées — pensez à garder les plus pertinentes.",

    "resumatch.letterQuality.title": "Contrôle de la lettre",
    "resumatch.letterQuality.length": "La longueur correspond à la cible",
    "resumatch.letterQuality.length.detail.one": "{words} mots sur {count} paragraphe",
    "resumatch.letterQuality.length.detail.other": "{words} mots sur {count} paragraphes",
    "resumatch.letterQuality.length.outOfRange": " — hors de la fourchette habituelle pour cette longueur.",
    "resumatch.letterQuality.generic": "Pas de formules toutes faites",
    "resumatch.letterQuality.generic.detail":
      "Trouvé : {phrases} — cela paraît générique pour la plupart des ATS et des recruteurs.",
    "resumatch.letterQuality.placeholder": "Pas d’espace réservé non rempli",
    "resumatch.letterQuality.placeholder.detail":
      "Un espace réservé entre crochets comme [Nom de l’entreprise] apparaît dans la lettre — complétez-le ou supprimez-le.",
    "resumatch.letterQuality.greeting": "La formule d’appel semble voulue",
    "resumatch.letterQuality.greeting.detail":
      "La formule d’appel semble encore contenir un espace réservé plutôt qu’une salutation réelle ou neutre.",
    "resumatch.letterQuality.language": "Formules d’appel et de politesse dans la langue de la lettre",
    "resumatch.letterQuality.language.detail":
      "La formule d’appel ou de politesse semble être dans une autre langue (par exemple un « Dear … » ou « Sincerely, » anglais) — utilisez la formule propre à cette langue.",
    "resumatch.letterQuality.signed": "Signée de votre nom",
    "resumatch.letterQuality.signed.detail": "Votre profil confirmé n’a pas encore de nom pour signer.",
  },
  de: {
    "resumatch.preview.metaTitle": "Vorschau",
    "resumatch.preview.kicker": "Anpassen",
    "resumatch.preview.title": "Dein angepasster Lebenslauf",
    "resumatch.preview.description": "Angepasst an {job}.",
    "resumatch.preview.langNote":
      "Auf {language} verfasst. Arbeitgeber, Stellentitel, Daten, Ausbildung und Fähigkeiten bleiben genau wie in deinem Profil.",
    "resumatch.preview.degraded":
      "Diese Version konnte gerade nicht per KI angepasst werden (Budget- oder Anbieterproblem), daher zeigt sie dein bestätigtes Profil unverändert. Versuche es später erneut.",
    "resumatch.preview.viewCoverLetter": "Anschreiben ansehen",
    "resumatch.preview.noCoverLetter": "Kein Anschreiben zu diesem Lebenslauf.",
    "resumatch.preview.downloadPdf": "PDF herunterladen",
    "resumatch.preview.downloadDocx": "DOCX herunterladen",
    "resumatch.preview.saveApplication": "Zu Bewerbungen hinzufügen",
    "resumatch.preview.savedApplication": "Zu Bewerbungen hinzugefügt",
    "resumatch.preview.saveApplicationError": "Speichern fehlgeschlagen — erneut versuchen",

    "resumatch.letter.title": "Dein Anschreiben",
    "resumatch.letter.description": "Verfasst für {job}.",
    "resumatch.letter.backToCv": "← Den zugehörigen angepassten Lebenslauf ansehen",
    "resumatch.letter.langNote":
      "Auf {language} verfasst. Namen, Zahlen und Daten bleiben genau wie in deinem Profil und der Stelle.",
    "resumatch.letter.degraded":
      "Dieses Anschreiben konnte gerade nicht per KI entworfen werden (Budget- oder Anbieterproblem).",

    "resumatch.coverage.title": "Abdeckung dieser Stellenanzeige",
    "resumatch.coverage.percent": "{percent} % deiner Fähigkeiten passen",
    "resumatch.coverage.matched": "Treffer",
    "resumatch.coverage.missing": "Nicht abgedeckt",
    "resumatch.coverage.note":
      "Ein grober, deterministischer Abgleich der Formulierungen dieser Anzeige mit deinem Lebenslauf — kein ATS-Score und nie ein Grund, eine Fähigkeit hinzuzufügen, die du nicht hast. Manche „nicht abgedeckten“ Begriffe sind für dich einfach irrelevant.",

    "resumatch.quality.title": "Dokumentprüfung",
    "resumatch.quality.metric": "Punkte enthalten eine Kennzahl",
    "resumatch.quality.metric.detail": "{withMetric} von {total} Punkten enthalten eine Zahl.",
    "resumatch.quality.verb": "Punkte beginnen mit einem starken Verb",
    "resumatch.quality.verb.detail.one": "{count} Punkt beginnt mit einem schwachen oder passiven Verb.",
    "resumatch.quality.verb.detail.other": "{count} Punkte beginnen mit einem schwachen oder passiven Verb.",
    "resumatch.quality.length": "Punkte haben eine druckfreundliche Länge",
    "resumatch.quality.length.detail.one": "{count} Punkt bricht wahrscheinlich in eine zweite Zeile um.",
    "resumatch.quality.length.detail.other": "{count} Punkte brechen wahrscheinlich in eine zweite Zeile um.",
    "resumatch.quality.contact": "Kontaktdaten und Überschrift vollständig",
    "resumatch.quality.contact.detail": "Fehlt: {fields}.",
    "resumatch.quality.field.headline": "Überschrift",
    "resumatch.quality.field.summary": "Zusammenfassung",
    "resumatch.quality.field.email": "E-Mail",
    "resumatch.quality.field.phone": "Telefon",
    "resumatch.quality.skills": "Anzahl der Fähigkeiten wirkt angemessen",
    "resumatch.quality.skills.low.one": "Nur {count} Fähigkeit angegeben — erwäge, mehr hinzuzufügen.",
    "resumatch.quality.skills.low.other": "Nur {count} Fähigkeiten angegeben — erwäge, mehr hinzuzufügen.",
    "resumatch.quality.skills.high": "{count} Fähigkeiten angegeben — erwäge, auf die relevantesten zu kürzen.",

    "resumatch.letterQuality.title": "Anschreiben-Prüfung",
    "resumatch.letterQuality.length": "Länge passt zum Ziel",
    "resumatch.letterQuality.length.detail.one": "{words} Wörter in {count} Absatz",
    "resumatch.letterQuality.length.detail.other": "{words} Wörter in {count} Absätzen",
    "resumatch.letterQuality.length.outOfRange": " — außerhalb des üblichen Bereichs für diese Länge.",
    "resumatch.letterQuality.generic": "Keine allgemeinen Floskeln",
    "resumatch.letterQuality.generic.detail":
      "Gefunden: {phrases} — das wirkt auf die meisten ATS und Recruiter wie eine Vorlage.",
    "resumatch.letterQuality.placeholder": "Keine offenen Platzhalter",
    "resumatch.letterQuality.placeholder.detail":
      "Im Anschreiben steht ein Platzhalter in Klammern wie [Firmenname] — fülle ihn aus oder entferne ihn.",
    "resumatch.letterQuality.greeting": "Anrede wirkt beabsichtigt",
    "resumatch.letterQuality.greeting.detail":
      "Die Anrede scheint noch einen Platzhalter zu enthalten statt einer echten oder neutralen Anrede.",
    "resumatch.letterQuality.language": "Anrede und Grußformel passen zur Sprache des Anschreibens",
    "resumatch.letterQuality.language.detail":
      "Anrede oder Grußformel scheinen in einer anderen Sprache zu sein (zum Beispiel ein englisches „Dear …“ oder „Sincerely,“) — verwende die übliche Formel dieser Sprache.",
    "resumatch.letterQuality.signed": "Mit deinem Namen unterschrieben",
    "resumatch.letterQuality.signed.detail": "Dein bestätigtes Profil hat noch keinen Namen zum Unterschreiben.",
  },
};
