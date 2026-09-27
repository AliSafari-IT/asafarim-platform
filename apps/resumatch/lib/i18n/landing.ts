import type { Dictionaries } from "@asafarim/shared-i18n";

/**
 * The landing page (and its illustrations), the roadmap, the workspace
 * page, the error / not-found / loading states, and the site description
 * in the root layout's metadata.
 *
 * Roadmap milestones keep their id, status and tags in app/roadmap/data.ts;
 * their title and summary live here as resumatch.roadmap.<id>.title/.summary.
 */
export const landingDictionaries: Dictionaries = {
  en: {
    "resumatch.meta.tagline": "AI-tailored CVs",
    "resumatch.meta.description":
      "AI-tailored CVs: paste a job posting URL and rewrite your resume toward it, then download it as a PDF.",

    "resumatch.landing.eyebrow": "Building in the open",
    "resumatch.landing.hero.before": "Your CV, ",
    "resumatch.landing.hero.accent": "tailored",
    "resumatch.landing.hero.after": " to one job.",
    "resumatch.landing.hero.lead":
      "Paste the URL of a job you want. ResuMatch reads it, rewrites your confirmed profile toward it with AI, and hands you a downloadable PDF — without ever inventing a fact about you.",
    "resumatch.landing.cta.build": "Build your profile",
    "resumatch.landing.cta.how": "See how it works",
    "resumatch.landing.hero.note": "Sign in with your platform account — no new password.",
    "resumatch.landing.stats.aria": "ResuMatch in three numbers",
    "resumatch.landing.stat1.label": "fabricated facts",
    "resumatch.landing.stat1.sub": "Every line traces back to your confirmed profile.",
    "resumatch.landing.stat2.label": "job at a time",
    "resumatch.landing.stat2.sub": "On purpose — no mass-applying, no scraping at scale.",
    "resumatch.landing.stat3.num": "90 days",
    "resumatch.landing.stat3.viz": "90d",
    "resumatch.landing.stat3.label": "then auto-deleted",
    "resumatch.landing.stat3.sub": "Originals go automatically — or sooner, with one click.",

    "resumatch.landing.how.kicker": "How it works",
    "resumatch.landing.how.title": "Three steps. Nothing hidden in between.",
    "resumatch.landing.how.scanPassed": "✓ Malware scan passed",
    "resumatch.landing.how.step1.title": "Upload your CV",
    "resumatch.landing.how.step1.body":
      "Scanned first, then read into a profile you correct before anything else touches it.",
    "resumatch.landing.how.step2.title": "Paste a job URL",
    "resumatch.landing.how.step2.body":
      "The one job you actually want. Fetched directly — no job-board licensing, no bulk scraping.",
    "resumatch.landing.how.download": "Download",
    "resumatch.landing.how.step3.title": "Download the tailored PDF",
    "resumatch.landing.how.step3.body":
      "AI rewords and reprioritizes your confirmed profile toward that job. Print-ready.",

    "resumatch.landing.rewrite.kicker": "What tailoring does",
    "resumatch.landing.rewrite.title": "Reordered and reworded. Never invented.",
    "resumatch.landing.rewrite.lead": "Follow the lines: every bullet on the right comes from one on the left.",
    "resumatch.landing.zone.can": "AI may reword",
    "resumatch.landing.zone.locked": "Locked — never changed",
    "resumatch.landing.zone.none": "No field exists",
    "resumatch.landing.zone.noneNote": "Nothing to store, so nothing to infer.",
    "resumatch.landing.pill.summary": "Summary",
    "resumatch.landing.pill.headline": "Headline",
    "resumatch.landing.pill.bullets": "Experience bullets",
    "resumatch.landing.pill.order": "Bullet order",
    "resumatch.landing.pill.employers": "Employers",
    "resumatch.landing.pill.dates": "Dates",
    "resumatch.landing.pill.degrees": "Degrees",
    "resumatch.landing.pill.unlistedSkills": "Skills you didn't list",
    "resumatch.landing.pill.age": "Age",
    "resumatch.landing.pill.nationality": "Nationality",
    "resumatch.landing.pill.gender": "Gender",

    "resumatch.landing.journey.kicker": "Your CV’s journey",
    "resumatch.landing.journey.title": "From upload to gone, every stop is visible.",
    "resumatch.landing.journey.upload": "Upload",
    "resumatch.landing.journey.uploadSub": "PDF, DOCX, or TXT",
    "resumatch.landing.journey.scan": "Malware scan",
    "resumatch.landing.journey.scanSub": "Nothing opens it first",
    "resumatch.landing.journey.scanBranch": "No answer? → quarantined, never processed",
    "resumatch.landing.journey.confirm": "You confirm",
    "resumatch.landing.journey.confirmSub": "Your profile, not a parser’s guess",
    "resumatch.landing.journey.tailored": "Tailored",
    "resumatch.landing.journey.tailoredSub": "Toward one job",
    "resumatch.landing.journey.pdf": "Your PDF",
    "resumatch.landing.journey.pdfSub": "Review, then use",
    "resumatch.landing.retention.aria":
      "Retention: originals are deleted automatically after 90 days, and you can delete everything at any time before that.",
    "resumatch.landing.retention.marker": "Delete everything — one click, any day",
    "resumatch.landing.retention.day0": "Day 0 · upload",
    "resumatch.landing.retention.day": "Day {n}",
    "resumatch.landing.retention.day90": "Day 90 · auto-deleted",
    "resumatch.landing.retention.note":
      "One click removes your file, every profile version, every fetched job page, and every tailored CV.",

    "resumatch.landing.security.kicker": "Built to be trusted",
    "resumatch.landing.security.title": "Four walls around your CV.",
    "resumatch.landing.security.lead":
      "A request passes every ring before it reaches your data. Pick a layer to see what it does.",
    "resumatch.landing.layer1.title": "Deny-by-default routing",
    "resumatch.landing.layer1.body":
      "Only the landing and legal pages are public. Every other surface requires a session, checked again at the data boundary.",
    "resumatch.landing.layer2.title": "Shared sign-in",
    "resumatch.landing.layer2.body":
      "Hub issues the session, ResuMatch only reads it. There is no second password to manage or leak.",
    "resumatch.landing.layer3.title": "Redacted observability",
    "resumatch.landing.layer3.body":
      "Every log line and audit row passes an allow-list. CV text and job-page content cannot reach a log sink by accident.",
    "resumatch.landing.layer4.title": "Isolated database",
    "resumatch.landing.layer4.body":
      "Its own PostgreSQL instance and credentials. It stores an opaque platform user id and never copies the platform user table.",

    "resumatch.landing.final.title": "Ready to tailor your first CV?",
    "resumatch.landing.final.body": "Upload once, confirm your profile, and point it at the job you want.",

    "resumatch.landing.diff.before": "Your confirmed profile",
    "resumatch.landing.diff.after": "Tailored for “{role}”",
    "resumatch.landing.diff.role": "Frontend Engineer",
    "resumatch.landing.diff.b1": "Led migration of the billing service to Go",
    "resumatch.landing.diff.b2": "Mentored four junior engineers",
    "resumatch.landing.diff.b3": "Rebuilt the checkout UI in React + TypeScript",
    "resumatch.landing.diff.b4": "Cut page load time by 40%",
    "resumatch.landing.diff.b5": "Ran a WCAG 2.1 AA accessibility audit",
    "resumatch.landing.diff.r3": "Rebuilt the checkout experience in React and TypeScript",
    "resumatch.landing.diff.r5": "Audited the product against WCAG 2.1 AA and fixed the gaps",
    "resumatch.landing.diff.wasN": "▲ was #{n}",
    "resumatch.landing.diff.reworded": "reworded",
    "resumatch.landing.diff.caption":
      "Illustrative example. Same five facts on both sides — reordered toward the job, two reworded, none added.",

    "resumatch.landing.art.jobPosting": "JOB POSTING",
    "resumatch.landing.art.experience": "EXPERIENCE",
    "resumatch.landing.art.skills": "SKILLS",
    "resumatch.landing.art.match": "MATCH",
    "resumatch.landing.art.accessibility": "Accessibility",
    "resumatch.landing.art.scanned": "Scanned",
    "resumatch.landing.art.scannedSub": "before it is read",
    "resumatch.landing.art.noInvented": "0 invented facts",

    "resumatch.roadmap.kicker": "Project direction",
    "resumatch.roadmap.title": "The ResuMatch journey",
    "resumatch.roadmap.description":
      "An outcome-led view of what has shipped, what is mid-stream, and where the AI-tailoring tool is heading. ResuMatch is an experimental portfolio showcase — every milestone is complete only when its exit evidence is demonstrated, not when its code merges.",
    "resumatch.roadmap.history": "History",
    "resumatch.roadmap.roadmap": "Roadmap",
    "resumatch.roadmap.all": "All",
    "resumatch.roadmap.progress": "{done} of {total} shipped",
    "resumatch.roadmap.toggle": "Timeline view",
    "resumatch.roadmap.changelogTitle": "Delivered & in progress",
    "resumatch.roadmap.changelogSubtitle": "M1–M5 · docs/business-plan.md",
    "resumatch.roadmap.roadmapTitle": "What's next",
    "resumatch.roadmap.roadmapSubtitle": "More layouts, real model providers, production readiness",
    "resumatch.roadmap.status.shipped": "Shipped",
    "resumatch.roadmap.status.in-progress": "In progress",
    "resumatch.roadmap.status.planned": "Planned",
    "resumatch.roadmap.status.exploring": "Exploring",
    "resumatch.roadmap.timeframe.next": "Next",
    "resumatch.roadmap.timeframe.later": "Later",
    "resumatch.roadmap.M1.title": "Platform & delivery foundation",
    "resumatch.roadmap.M1.summary":
      "A deployable Next.js app on the platform: Hub SSO, its own PostgreSQL with an opaque platform user id, a validated env contract, redaction-by-construction logging, an append-only audit table, and CI. Carried over unchanged from the pre-pivot product.",
    "resumatch.roadmap.M2.title": "Candidate profile & CV pipeline",
    "resumatch.roadmap.M2.summary":
      "Private document storage with byte-level type sniffing and a 10 MB cap, malware scanning as a hard gate (a ClamAV sidecar in production), deterministic PDF/Word/text extraction with an optional AI pass that degrades back to it, full section CRUD with inline editing and manual entry, an AI tone-rewrite for the Summary field, an immutable lineage-linked profile with no field for any protected attribute, and one-click GDPR access + erasure.",
    "resumatch.roadmap.M3.title": "Job details, five ways in",
    "resumatch.roadmap.M3.summary":
      "The pivot replaced authorized-source ingestion (which needed a licensing agreement per job board) with candidate-supplied postings: paste a URL — fetched under an SSRF-resistant posture, or browsed by the model when a real provider is configured — paste the posting text, paste a job-invitation email, upload the posting as PDF/DOCX, or fill in a manual entry form. Every path lands on the same extracted confirmation before anything else happens.",
    "resumatch.roadmap.M4.title": "AI CV tailoring",
    "resumatch.roadmap.M4.summary":
      "A tailoring pipeline built around one hard guarantee: AI rewords and reprioritizes a candidate's summary, headline, and experience bullets — it never invents an employer, a date, a degree, or a skill the candidate did not already list. Enforced structurally: provider output is merged with the source profile in code, not trusted verbatim. Proposal-review, not one-shot — generate-preview returns a draft to edit and approve before generate-confirm persists it — with freeform per-run instructions as a third fenced input, a deterministic keyword-coverage report, and a quality checklist on every preview.",
    "resumatch.roadmap.M5.title": "Export, history & diff",
    "resumatch.roadmap.M5.summary":
      "A clean print-optimized layout (Download PDF via the browser's print dialog) plus real DOCX downloads for resume and letter, both generated from the same content source so the two exports can never diverge. The history view lists every tailored run and compares any two side by side. `templateKey` already exists as a field so more layouts stay additive.",
    "resumatch.roadmap.M6.title": "AI cover letters",
    "resumatch.roadmap.M6.summary":
      "A second fenced provider call drafts a cover letter from the same confirmed inputs under the same no-fabrication contract and merge discipline — with tone and length controls, the same preview/confirm review before anything is saved, its own deterministic quality checks, and the same print + DOCX export paths as the resume.",
    "resumatch.roadmap.M7.title": "Application tracking",
    "resumatch.roadmap.M7.summary":
      "A per-application list tracking each job through saved → applied → interviewing → offer/rejected, with a multi-step status indicator, optional notes, a follow-up date field, and a link back to the tailored resume used — the pivot's lightweight replacement for the removed tracked-jobs workflow, with zero licensing exposure since every row is candidate-supplied or candidate-approved.",
    "resumatch.roadmap.M8.title": "Real model providers",
    "resumatch.roadmap.M8.summary":
      "OpenAI and Anthropic adapters for the tailoring and cover-letter calls, plus OpenAI for extraction, Summary rewrite, and job-URL browsing — never selectable in a deployed environment until the JM-005 classification sign-off is recorded and a key is present. The fixture provider stays the only one CI ever exercises. Known gap: the Anthropic extraction/rewrite/job-fetch adapters are still stubs, tracked in docs/megaplan.md (F2).",
    "resumatch.roadmap.M9.title": "More layouts & market fit",
    "resumatch.roadmap.M9.summary":
      "A second and third visual template to choose between — the review step already lets a candidate hand-adjust content before saving — plus the trust-and-safety backlog that real users need: per-item deletion, rate limiting, follow-up reminders, and NL/FR coverage for the Belgian audience. The full audit and prioritized list live in docs/megaplan.md.",
    "resumatch.roadmap.M10.title": "Production readiness & privacy operations",
    "resumatch.roadmap.M10.summary":
      "A DPIA decision for the AI-tailoring flow specifically (a job page's text and a candidate's rewritten resume both pass through a model call), a deployed async worker moving scan/extract/tailor off the request path, an incident runbook, and load + recovery evidence — the bar for operating at pilot scale.",

    "resumatch.workspace.kicker": "Workspace",
    "resumatch.workspace.inactiveBody":
      "Your platform account is not active, so ResuMatch will not create or open a workspace for it. Contact the platform administrator if this is unexpected.",
    "resumatch.workspace.title": "Your ResuMatch workspace exists.",
    "resumatch.workspace.description":
      "An isolated, per-user container in ResuMatch's own database. Your profile and every tailored CV you generate hang off this one row.",
    "resumatch.workspace.card": "Workspace",
    "resumatch.workspace.created":
      "Created {date}. Keyed to your platform account by an opaque id — your name and email stay in the platform database.",
    "resumatch.workspace.profileCard": "Your profile",
    "resumatch.workspace.profileBody":
      "Upload a CV, correct what was read from it, and confirm it. Tailoring always reads from your confirmed version.",
    "resumatch.workspace.tailorCard": "Tailor a CV",
    "resumatch.workspace.tailorBody":
      "Paste a job posting URL and let AI reword your confirmed profile toward it, then download it as a PDF.",

    "resumatch.error.kicker": "Error",
    "resumatch.error.title": "Something went wrong on our side.",
    "resumatch.error.strong": "This request could not be completed.",
    "resumatch.error.body": "The failure has been logged. If you report it, quote reference",
    "resumatch.error.unavailable": "unavailable",
    "resumatch.error.retry": "Try again",
    "resumatch.loadingApp": "Loading ResuMatch…",
    "resumatch.notFound.title": "That page does not exist.",
    "resumatch.notFound.back": "Back to the overview →",
  },
  nl: {
    "resumatch.meta.tagline": "Cv’s op maat met AI",
    "resumatch.meta.description":
      "Cv’s op maat met AI: plak de URL van een vacature, laat je cv erop afstemmen en download het als pdf.",

    "resumatch.landing.eyebrow": "Openlijk in ontwikkeling",
    "resumatch.landing.hero.before": "Je cv, ",
    "resumatch.landing.hero.accent": "afgestemd",
    "resumatch.landing.hero.after": " op één vacature.",
    "resumatch.landing.hero.lead":
      "Plak de URL van een vacature die je wilt. ResuMatch leest ze, herschrijft je bevestigde profiel ernaar met AI en geeft je een pdf om te downloaden — zonder ooit een feit over jou te verzinnen.",
    "resumatch.landing.cta.build": "Bouw je profiel",
    "resumatch.landing.cta.how": "Bekijk hoe het werkt",
    "resumatch.landing.hero.note": "Meld je aan met je platformaccount — geen nieuw wachtwoord.",
    "resumatch.landing.stats.aria": "ResuMatch in drie getallen",
    "resumatch.landing.stat1.label": "verzonnen feiten",
    "resumatch.landing.stat1.sub": "Elke regel is terug te voeren op je bevestigde profiel.",
    "resumatch.landing.stat2.label": "vacature tegelijk",
    "resumatch.landing.stat2.sub": "Met opzet — geen massaal solliciteren, geen grootschalig scrapen.",
    "resumatch.landing.stat3.num": "90 dagen",
    "resumatch.landing.stat3.viz": "90d",
    "resumatch.landing.stat3.label": "daarna automatisch gewist",
    "resumatch.landing.stat3.sub": "Originelen verdwijnen automatisch — of eerder, met één klik.",

    "resumatch.landing.how.kicker": "Hoe het werkt",
    "resumatch.landing.how.title": "Drie stappen. Niets verborgen daartussen.",
    "resumatch.landing.how.scanPassed": "✓ Malwarescan geslaagd",
    "resumatch.landing.how.step1.title": "Upload je cv",
    "resumatch.landing.how.step1.body":
      "Eerst gescand, daarna ingelezen in een profiel dat jij verbetert voordat er iets anders mee gebeurt.",
    "resumatch.landing.how.step2.title": "Plak een vacature-URL",
    "resumatch.landing.how.step2.body":
      "De ene vacature die je echt wilt. Rechtstreeks opgehaald — geen licenties van jobsites, geen massaal scrapen.",
    "resumatch.landing.how.download": "Downloaden",
    "resumatch.landing.how.step3.title": "Download de afgestemde pdf",
    "resumatch.landing.how.step3.body":
      "AI herformuleert en herschikt je bevestigde profiel richting die vacature. Klaar om te printen.",

    "resumatch.landing.rewrite.kicker": "Wat afstemmen doet",
    "resumatch.landing.rewrite.title": "Herschikt en geherformuleerd. Nooit verzonnen.",
    "resumatch.landing.rewrite.lead": "Volg de lijnen: elk punt rechts komt van een punt links.",
    "resumatch.landing.zone.can": "AI mag herformuleren",
    "resumatch.landing.zone.locked": "Vergrendeld — nooit gewijzigd",
    "resumatch.landing.zone.none": "Er bestaat geen veld voor",
    "resumatch.landing.zone.noneNote": "Niets om op te slaan, dus niets om af te leiden.",
    "resumatch.landing.pill.summary": "Samenvatting",
    "resumatch.landing.pill.headline": "Titel",
    "resumatch.landing.pill.bullets": "Ervaringspunten",
    "resumatch.landing.pill.order": "Volgorde van de punten",
    "resumatch.landing.pill.employers": "Werkgevers",
    "resumatch.landing.pill.dates": "Datums",
    "resumatch.landing.pill.degrees": "Diploma’s",
    "resumatch.landing.pill.unlistedSkills": "Vaardigheden die je niet opgaf",
    "resumatch.landing.pill.age": "Leeftijd",
    "resumatch.landing.pill.nationality": "Nationaliteit",
    "resumatch.landing.pill.gender": "Gender",

    "resumatch.landing.journey.kicker": "De reis van je cv",
    "resumatch.landing.journey.title": "Van upload tot verwijderd: elke halte is zichtbaar.",
    "resumatch.landing.journey.upload": "Upload",
    "resumatch.landing.journey.uploadSub": "PDF, DOCX of TXT",
    "resumatch.landing.journey.scan": "Malwarescan",
    "resumatch.landing.journey.scanSub": "Niets opent het eerst",
    "resumatch.landing.journey.scanBranch": "Geen antwoord? → quarantaine, nooit verwerkt",
    "resumatch.landing.journey.confirm": "Jij bevestigt",
    "resumatch.landing.journey.confirmSub": "Je profiel, geen gok van een parser",
    "resumatch.landing.journey.tailored": "Afgestemd",
    "resumatch.landing.journey.tailoredSub": "Op één vacature",
    "resumatch.landing.journey.pdf": "Jouw pdf",
    "resumatch.landing.journey.pdfSub": "Nalezen, dan gebruiken",
    "resumatch.landing.retention.aria":
      "Bewaartermijn: originelen worden na 90 dagen automatisch verwijderd, en je kunt alles op elk moment daarvoor verwijderen.",
    "resumatch.landing.retention.marker": "Alles verwijderen — één klik, op elke dag",
    "resumatch.landing.retention.day0": "Dag 0 · upload",
    "resumatch.landing.retention.day": "Dag {n}",
    "resumatch.landing.retention.day90": "Dag 90 · automatisch gewist",
    "resumatch.landing.retention.note":
      "Eén klik verwijdert je bestand, elke profielversie, elke opgehaalde vacaturepagina en elk afgestemd cv.",

    "resumatch.landing.security.kicker": "Gebouwd om te vertrouwen",
    "resumatch.landing.security.title": "Vier muren rond je cv.",
    "resumatch.landing.security.lead":
      "Een verzoek passeert elke ring voordat het je gegevens bereikt. Kies een laag om te zien wat ze doet.",
    "resumatch.landing.layer1.title": "Standaard alles geweigerd",
    "resumatch.landing.layer1.body":
      "Alleen de startpagina en de juridische pagina’s zijn openbaar. Al het andere vereist een sessie, die opnieuw gecontroleerd wordt bij de toegang tot de gegevens.",
    "resumatch.landing.layer2.title": "Gedeelde aanmelding",
    "resumatch.landing.layer2.body":
      "Hub geeft de sessie uit, ResuMatch leest ze alleen. Er is geen tweede wachtwoord om te beheren of te lekken.",
    "resumatch.landing.layer3.title": "Geredigeerde logging",
    "resumatch.landing.layer3.body":
      "Elke logregel en auditrij passeert een toelatingslijst. Cv-tekst en inhoud van vacaturepagina’s kunnen niet per ongeluk in een log belanden.",
    "resumatch.landing.layer4.title": "Afgezonderde database",
    "resumatch.landing.layer4.body":
      "Een eigen PostgreSQL-instantie met eigen inloggegevens. Ze bewaart een ondoorzichtige platformgebruikers-id en kopieert nooit de gebruikerstabel van het platform.",

    "resumatch.landing.final.title": "Klaar om je eerste cv af te stemmen?",
    "resumatch.landing.final.body": "Upload één keer, bevestig je profiel en richt het op de vacature die je wilt.",

    "resumatch.landing.diff.before": "Je bevestigde profiel",
    "resumatch.landing.diff.after": "Afgestemd op “{role}”",
    "resumatch.landing.diff.role": "Frontend Engineer",
    "resumatch.landing.diff.b1": "Leidde de migratie van de facturatieservice naar Go",
    "resumatch.landing.diff.b2": "Coachte vier junior engineers",
    "resumatch.landing.diff.b3": "Bouwde de checkout-UI opnieuw in React + TypeScript",
    "resumatch.landing.diff.b4": "Verkortte de laadtijd van pagina’s met 40%",
    "resumatch.landing.diff.b5": "Voerde een toegankelijkheidsaudit volgens WCAG 2.1 AA uit",
    "resumatch.landing.diff.r3": "Bouwde de checkout-ervaring opnieuw in React en TypeScript",
    "resumatch.landing.diff.r5": "Toetste het product aan WCAG 2.1 AA en loste de tekortkomingen op",
    "resumatch.landing.diff.wasN": "▲ was #{n}",
    "resumatch.landing.diff.reworded": "geherformuleerd",
    "resumatch.landing.diff.caption":
      "Illustratief voorbeeld. Dezelfde vijf feiten aan beide kanten — herschikt richting de vacature, twee geherformuleerd, geen enkele toegevoegd.",

    "resumatch.landing.art.jobPosting": "VACATURE",
    "resumatch.landing.art.experience": "ERVARING",
    "resumatch.landing.art.skills": "VAARDIGHEDEN",
    "resumatch.landing.art.match": "MATCH",
    "resumatch.landing.art.accessibility": "Toegankelijkheid",
    "resumatch.landing.art.scanned": "Gescand",
    "resumatch.landing.art.scannedSub": "vóór het lezen",
    "resumatch.landing.art.noInvented": "Niets verzonnen",

    "resumatch.roadmap.kicker": "Richting van het project",
    "resumatch.roadmap.title": "De reis van ResuMatch",
    "resumatch.roadmap.description":
      "Een resultaatgericht overzicht van wat er af is, wat onderweg is en waar de AI-afstemtool naartoe gaat. ResuMatch is een experimentele portfolio-showcase — een mijlpaal is pas af wanneer het bewijs ervoor aangetoond is, niet wanneer de code gemerged is.",
    "resumatch.roadmap.history": "Geschiedenis",
    "resumatch.roadmap.roadmap": "Roadmap",
    "resumatch.roadmap.all": "Alles",
    "resumatch.roadmap.progress": "{done} van {total} opgeleverd",
    "resumatch.roadmap.toggle": "Weergave van de tijdlijn",
    "resumatch.roadmap.changelogTitle": "Opgeleverd & in uitvoering",
    "resumatch.roadmap.changelogSubtitle": "M1–M5 · docs/business-plan.md",
    "resumatch.roadmap.roadmapTitle": "Wat volgt",
    "resumatch.roadmap.roadmapSubtitle": "Meer lay-outs, echte modelproviders, klaar voor productie",
    "resumatch.roadmap.status.shipped": "Opgeleverd",
    "resumatch.roadmap.status.in-progress": "In uitvoering",
    "resumatch.roadmap.status.planned": "Gepland",
    "resumatch.roadmap.status.exploring": "Verkennend",
    "resumatch.roadmap.timeframe.next": "Hierna",
    "resumatch.roadmap.timeframe.later": "Later",
    "resumatch.roadmap.M1.title": "Platform- en opleveringsbasis",
    "resumatch.roadmap.M1.summary":
      "Een inzetbare Next.js-app op het platform: Hub-SSO, een eigen PostgreSQL met een ondoorzichtige platformgebruikers-id, een gevalideerd env-contract, logging die standaard redigeert, een audittabel waarin alleen toegevoegd wordt, en CI. Ongewijzigd overgenomen van het product van vóór de koerswijziging.",
    "resumatch.roadmap.M2.title": "Kandidaatprofiel & cv-pipeline",
    "resumatch.roadmap.M2.summary":
      "Privé documentopslag met typecontrole op byteniveau en een limiet van 10 MB, malwarescanning als harde poort (een ClamAV-sidecar in productie), deterministische extractie uit pdf/Word/tekst met een optionele AI-stap die daarop terugvalt, volledige CRUD per onderdeel met inline bewerken en handmatige invoer, een AI-herschrijving van de toon voor de samenvatting, een onveranderlijk profiel met versie-afstamming en zonder veld voor beschermde kenmerken, en AVG-inzage + -verwijdering met één klik.",
    "resumatch.roadmap.M3.title": "Vacaturegegevens, vijf manieren",
    "resumatch.roadmap.M3.summary":
      "De koerswijziging verving het inlezen uit geautoriseerde bronnen (waarvoor per jobsite een licentieovereenkomst nodig was) door vacatures die de kandidaat zelf aanlevert: plak een URL — opgehaald met SSRF-bescherming, of door het model doorzocht wanneer een echte provider ingesteld is — plak de vacaturetekst, plak een uitnodigingsmail, upload de vacature als pdf/DOCX of vul een formulier in. Elke weg komt uit bij dezelfde geëxtraheerde bevestiging voordat er iets anders gebeurt.",
    "resumatch.roadmap.M4.title": "Cv-afstemming met AI",
    "resumatch.roadmap.M4.summary":
      "Een afstempipeline rond één harde garantie: AI herformuleert en herschikt de samenvatting, titel en ervaringspunten van een kandidaat — ze verzint nooit een werkgever, datum, diploma of vaardigheid die de kandidaat niet al opgaf. Structureel afgedwongen: de uitvoer van de provider wordt in code samengevoegd met het bronprofiel en niet letterlijk vertrouwd. Voorstel-en-nakijken, geen eenmalige stap — generate-preview geeft een concept om te bewerken en goed te keuren voordat generate-confirm het bewaart — met vrije instructies per run als derde afgeschermde invoer, een deterministisch rapport over de trefwoorddekking en een kwaliteitschecklist bij elk voorbeeld.",
    "resumatch.roadmap.M5.title": "Export, historiek & vergelijking",
    "resumatch.roadmap.M5.summary":
      "Een strakke lay-out geoptimaliseerd voor printen (pdf downloaden via het printvenster van de browser) plus echte DOCX-downloads voor cv en brief, beide uit dezelfde inhoudsbron zodat de twee exports nooit uiteenlopen. De historiek toont elke afstemming en vergelijkt er twee naast elkaar. `templateKey` bestaat al als veld, zodat extra lay-outs gewoon toegevoegd kunnen worden.",
    "resumatch.roadmap.M6.title": "Motivatiebrieven met AI",
    "resumatch.roadmap.M6.summary":
      "Een tweede afgeschermde provider-aanroep stelt een motivatiebrief op uit dezelfde bevestigde invoer, onder hetzelfde contract van niets verzinnen en dezelfde samenvoegdiscipline — met toon- en lengte-instellingen, dezelfde voorbeeld-en-bevestigstap voordat er iets bewaard wordt, eigen deterministische kwaliteitscontroles en dezelfde print- en DOCX-exports als het cv.",
    "resumatch.roadmap.M7.title": "Sollicitaties opvolgen",
    "resumatch.roadmap.M7.summary":
      "Een lijst per sollicitatie die elke vacature volgt van bewaard → gesolliciteerd → gesprekken → aanbod/afgewezen, met een stapsgewijze statusindicator, optionele notities, een opvolgdatum en een link naar het gebruikte afgestemde cv — de lichte vervanging van de verwijderde opgevolgde-vacatures-flow, zonder licentierisico omdat elke rij door de kandidaat aangeleverd of goedgekeurd is.",
    "resumatch.roadmap.M8.title": "Echte modelproviders",
    "resumatch.roadmap.M8.summary":
      "OpenAI- en Anthropic-adapters voor de afstem- en brief-aanroepen, plus OpenAI voor extractie, herschrijven van de samenvatting en het doorzoeken van vacature-URL’s — in een uitgerolde omgeving pas kiesbaar zodra de JM-005-classificatie afgetekend is en er een sleutel is. De fixture-provider blijft de enige die CI ooit gebruikt. Bekend gat: de Anthropic-adapters voor extractie/herschrijven/vacature ophalen zijn nog stubs, opgevolgd in docs/megaplan.md (F2).",
    "resumatch.roadmap.M9.title": "Meer lay-outs & marktfit",
    "resumatch.roadmap.M9.summary":
      "Een tweede en derde visueel sjabloon om uit te kiezen — de nakijkstap laat een kandidaat de inhoud al met de hand aanpassen voor het bewaren — plus de trust-and-safety-backlog die echte gebruikers nodig hebben: verwijderen per item, rate limiting, opvolgherinneringen en NL/FR-dekking voor het Belgische publiek. De volledige audit en geprioriteerde lijst staan in docs/megaplan.md.",
    "resumatch.roadmap.M10.title": "Klaar voor productie & privacybeheer",
    "resumatch.roadmap.M10.summary":
      "Een DPIA-beslissing specifiek voor de AI-afstemflow (de tekst van een vacaturepagina en het herschreven cv van een kandidaat gaan allebei door een modelaanroep), een uitgerolde asynchrone worker die scannen/extraheren/afstemmen van het request-pad haalt, een incidentrunbook en bewijs van belasting en herstel — de lat om op pilotschaal te draaien.",

    "resumatch.workspace.kicker": "Werkruimte",
    "resumatch.workspace.inactiveBody":
      "Je platformaccount is niet actief, dus ResuMatch maakt of opent er geen werkruimte voor. Neem contact op met de platformbeheerder als dit onverwacht is.",
    "resumatch.workspace.title": "Je ResuMatch-werkruimte bestaat.",
    "resumatch.workspace.description":
      "Een afgezonderde container per gebruiker in de eigen database van ResuMatch. Je profiel en elk afgestemd cv dat je maakt, hangen aan deze ene rij.",
    "resumatch.workspace.card": "Werkruimte",
    "resumatch.workspace.created":
      "Aangemaakt op {date}. Gekoppeld aan je platformaccount via een ondoorzichtige id — je naam en e-mail blijven in de platformdatabase.",
    "resumatch.workspace.profileCard": "Je profiel",
    "resumatch.workspace.profileBody":
      "Upload een cv, verbeter wat eruit gelezen is en bevestig het. Afstemmen leest altijd uit je bevestigde versie.",
    "resumatch.workspace.tailorCard": "Een cv afstemmen",
    "resumatch.workspace.tailorBody":
      "Plak de URL van een vacature, laat AI je bevestigde profiel erop afstemmen en download het als pdf.",

    "resumatch.error.kicker": "Fout",
    "resumatch.error.title": "Er ging iets mis aan onze kant.",
    "resumatch.error.strong": "Dit verzoek kon niet worden voltooid.",
    "resumatch.error.body": "De fout is gelogd. Vermeld bij het melden deze referentie:",
    "resumatch.error.unavailable": "niet beschikbaar",
    "resumatch.error.retry": "Opnieuw proberen",
    "resumatch.loadingApp": "ResuMatch laden…",
    "resumatch.notFound.title": "Die pagina bestaat niet.",
    "resumatch.notFound.back": "Terug naar het overzicht →",
  },
  fr: {
    "resumatch.meta.tagline": "CV adaptés par l’IA",
    "resumatch.meta.description":
      "CV adaptés par l’IA : collez l’URL d’une offre, adaptez-y votre CV, puis téléchargez-le en PDF.",

    "resumatch.landing.eyebrow": "Développé en toute transparence",
    "resumatch.landing.hero.before": "Votre CV, ",
    "resumatch.landing.hero.accent": "adapté",
    "resumatch.landing.hero.after": " à une offre.",
    "resumatch.landing.hero.lead":
      "Collez l’URL d’une offre qui vous intéresse. ResuMatch la lit, réécrit votre profil confirmé en conséquence avec l’IA et vous remet un PDF à télécharger — sans jamais inventer un fait à votre sujet.",
    "resumatch.landing.cta.build": "Créer votre profil",
    "resumatch.landing.cta.how": "Voir comment ça marche",
    "resumatch.landing.hero.note": "Connectez-vous avec votre compte de la plateforme — pas de nouveau mot de passe.",
    "resumatch.landing.stats.aria": "ResuMatch en trois chiffres",
    "resumatch.landing.stat1.label": "fait inventé",
    "resumatch.landing.stat1.sub": "Chaque ligne remonte à votre profil confirmé.",
    "resumatch.landing.stat2.label": "offre à la fois",
    "resumatch.landing.stat2.sub": "Volontairement — pas de candidatures en masse, pas de scraping à grande échelle.",
    "resumatch.landing.stat3.num": "90 jours",
    "resumatch.landing.stat3.viz": "90 j",
    "resumatch.landing.stat3.label": "puis suppression automatique",
    "resumatch.landing.stat3.sub": "Les originaux disparaissent automatiquement — ou plus tôt, en un clic.",

    "resumatch.landing.how.kicker": "Comment ça marche",
    "resumatch.landing.how.title": "Trois étapes. Rien de caché entre les deux.",
    "resumatch.landing.how.scanPassed": "✓ Analyse antivirus réussie",
    "resumatch.landing.how.step1.title": "Importez votre CV",
    "resumatch.landing.how.step1.body":
      "Analysé d’abord, puis lu dans un profil que vous corrigez avant que quoi que ce soit d’autre n’y touche.",
    "resumatch.landing.how.step2.title": "Collez l’URL d’une offre",
    "resumatch.landing.how.step2.body":
      "La seule offre qui vous intéresse vraiment. Récupérée directement — pas de licence de sites d’emploi, pas de scraping en masse.",
    "resumatch.landing.how.download": "Télécharger",
    "resumatch.landing.how.step3.title": "Téléchargez le PDF adapté",
    "resumatch.landing.how.step3.body":
      "L’IA reformule et réordonne votre profil confirmé en fonction de cette offre. Prêt à imprimer.",

    "resumatch.landing.rewrite.kicker": "Ce que fait l’adaptation",
    "resumatch.landing.rewrite.title": "Réordonné et reformulé. Jamais inventé.",
    "resumatch.landing.rewrite.lead": "Suivez les lignes : chaque point de droite vient d’un point de gauche.",
    "resumatch.landing.zone.can": "L’IA peut reformuler",
    "resumatch.landing.zone.locked": "Verrouillé — jamais modifié",
    "resumatch.landing.zone.none": "Aucun champ n’existe",
    "resumatch.landing.zone.noneNote": "Rien à stocker, donc rien à déduire.",
    "resumatch.landing.pill.summary": "Résumé",
    "resumatch.landing.pill.headline": "Titre",
    "resumatch.landing.pill.bullets": "Points d’expérience",
    "resumatch.landing.pill.order": "Ordre des points",
    "resumatch.landing.pill.employers": "Employeurs",
    "resumatch.landing.pill.dates": "Dates",
    "resumatch.landing.pill.degrees": "Diplômes",
    "resumatch.landing.pill.unlistedSkills": "Compétences non indiquées",
    "resumatch.landing.pill.age": "Âge",
    "resumatch.landing.pill.nationality": "Nationalité",
    "resumatch.landing.pill.gender": "Genre",

    "resumatch.landing.journey.kicker": "Le parcours de votre CV",
    "resumatch.landing.journey.title": "De l’import à la suppression, chaque étape est visible.",
    "resumatch.landing.journey.upload": "Import",
    "resumatch.landing.journey.uploadSub": "PDF, DOCX ou TXT",
    "resumatch.landing.journey.scan": "Analyse antivirus",
    "resumatch.landing.journey.scanSub": "Rien ne l’ouvre avant",
    "resumatch.landing.journey.scanBranch": "Pas de réponse ? → quarantaine, jamais traité",
    "resumatch.landing.journey.confirm": "Vous confirmez",
    "resumatch.landing.journey.confirmSub": "Votre profil, pas la supposition d’un parseur",
    "resumatch.landing.journey.tailored": "Adapté",
    "resumatch.landing.journey.tailoredSub": "À une seule offre",
    "resumatch.landing.journey.pdf": "Votre PDF",
    "resumatch.landing.journey.pdfSub": "À relire, puis à utiliser",
    "resumatch.landing.retention.aria":
      "Conservation : les originaux sont supprimés automatiquement après 90 jours, et vous pouvez tout supprimer à tout moment avant.",
    "resumatch.landing.retention.marker": "Tout supprimer — un clic, n’importe quel jour",
    "resumatch.landing.retention.day0": "Jour 0 · import",
    "resumatch.landing.retention.day": "Jour {n}",
    "resumatch.landing.retention.day90": "Jour 90 · suppression auto",
    "resumatch.landing.retention.note":
      "Un clic supprime votre fichier, chaque version du profil, chaque page d’offre récupérée et chaque CV adapté.",

    "resumatch.landing.security.kicker": "Conçu pour inspirer confiance",
    "resumatch.landing.security.title": "Quatre murs autour de votre CV.",
    "resumatch.landing.security.lead":
      "Une requête franchit chaque anneau avant d’atteindre vos données. Choisissez une couche pour voir ce qu’elle fait.",
    "resumatch.landing.layer1.title": "Tout refusé par défaut",
    "resumatch.landing.layer1.body":
      "Seules la page d’accueil et les pages légales sont publiques. Tout le reste exige une session, vérifiée à nouveau à l’accès aux données.",
    "resumatch.landing.layer2.title": "Connexion partagée",
    "resumatch.landing.layer2.body":
      "Hub émet la session, ResuMatch se contente de la lire. Pas de second mot de passe à gérer ni à divulguer.",
    "resumatch.landing.layer3.title": "Journalisation expurgée",
    "resumatch.landing.layer3.body":
      "Chaque ligne de journal et d’audit passe par une liste d’autorisation. Le texte du CV et le contenu des offres ne peuvent pas atterrir dans un journal par accident.",
    "resumatch.landing.layer4.title": "Base de données isolée",
    "resumatch.landing.layer4.body":
      "Sa propre instance PostgreSQL et ses propres identifiants. Elle stocke un identifiant d’utilisateur opaque et ne copie jamais la table des utilisateurs de la plateforme.",

    "resumatch.landing.final.title": "Prêt à adapter votre premier CV ?",
    "resumatch.landing.final.body": "Importez une fois, confirmez votre profil et visez l’offre qui vous intéresse.",

    "resumatch.landing.diff.before": "Votre profil confirmé",
    "resumatch.landing.diff.after": "Adapté pour « {role} »",
    "resumatch.landing.diff.role": "Frontend Engineer",
    "resumatch.landing.diff.b1": "A dirigé la migration du service de facturation vers Go",
    "resumatch.landing.diff.b2": "A encadré quatre ingénieurs juniors",
    "resumatch.landing.diff.b3": "A reconstruit l’interface de paiement en React + TypeScript",
    "resumatch.landing.diff.b4": "A réduit le temps de chargement des pages de 40 %",
    "resumatch.landing.diff.b5": "A mené un audit d’accessibilité WCAG 2.1 AA",
    "resumatch.landing.diff.r3": "A reconstruit l’expérience de paiement en React et TypeScript",
    "resumatch.landing.diff.r5": "A audité le produit selon WCAG 2.1 AA et corrigé les lacunes",
    "resumatch.landing.diff.wasN": "▲ était n° {n}",
    "resumatch.landing.diff.reworded": "reformulé",
    "resumatch.landing.diff.caption":
      "Exemple illustratif. Les cinq mêmes faits des deux côtés — réordonnés en fonction de l’offre, deux reformulés, aucun ajouté.",

    "resumatch.landing.art.jobPosting": "OFFRE D’EMPLOI",
    "resumatch.landing.art.experience": "EXPÉRIENCE",
    "resumatch.landing.art.skills": "COMPÉTENCES",
    "resumatch.landing.art.match": "CORRESP.",
    "resumatch.landing.art.accessibility": "Accessibilité",
    "resumatch.landing.art.scanned": "Analysé",
    "resumatch.landing.art.scannedSub": "avant d’être lu",
    "resumatch.landing.art.noInvented": "0 fait inventé",

    "resumatch.roadmap.kicker": "Orientation du projet",
    "resumatch.roadmap.title": "Le parcours de ResuMatch",
    "resumatch.roadmap.description":
      "Une vue centrée sur les résultats : ce qui est livré, ce qui est en cours et la direction que prend l’outil d’adaptation par IA. ResuMatch est une vitrine de portfolio expérimentale — un jalon n’est terminé que lorsque ses preuves de sortie sont démontrées, pas quand son code est fusionné.",
    "resumatch.roadmap.history": "Historique",
    "resumatch.roadmap.roadmap": "Feuille de route",
    "resumatch.roadmap.all": "Tout",
    "resumatch.roadmap.progress": "{done} sur {total} livrés",
    "resumatch.roadmap.toggle": "Vue de la chronologie",
    "resumatch.roadmap.changelogTitle": "Livré & en cours",
    "resumatch.roadmap.changelogSubtitle": "M1–M5 · docs/business-plan.md",
    "resumatch.roadmap.roadmapTitle": "La suite",
    "resumatch.roadmap.roadmapSubtitle": "Plus de mises en page, de vrais fournisseurs de modèles, prêt pour la production",
    "resumatch.roadmap.status.shipped": "Livré",
    "resumatch.roadmap.status.in-progress": "En cours",
    "resumatch.roadmap.status.planned": "Prévu",
    "resumatch.roadmap.status.exploring": "À l’étude",
    "resumatch.roadmap.timeframe.next": "Ensuite",
    "resumatch.roadmap.timeframe.later": "Plus tard",
    "resumatch.roadmap.M1.title": "Socle de plateforme & de livraison",
    "resumatch.roadmap.M1.summary":
      "Une app Next.js déployable sur la plateforme : SSO via Hub, sa propre base PostgreSQL avec un identifiant d’utilisateur opaque, un contrat d’environnement validé, une journalisation expurgée par construction, une table d’audit en ajout seul, et la CI. Reprise telle quelle du produit d’avant le pivot.",
    "resumatch.roadmap.M2.title": "Profil candidat & pipeline de CV",
    "resumatch.roadmap.M2.summary":
      "Stockage privé des documents avec détection du type au niveau des octets et une limite de 10 Mo, analyse antivirus comme barrière stricte (un sidecar ClamAV en production), extraction déterministe PDF/Word/texte avec une passe IA optionnelle qui s’y replie, CRUD complet par section avec édition en ligne et saisie manuelle, réécriture du ton du résumé par IA, un profil immuable relié à ses versions et sans champ pour un attribut protégé, et accès + effacement RGPD en un clic.",
    "resumatch.roadmap.M3.title": "Détails de l’offre, cinq entrées",
    "resumatch.roadmap.M3.summary":
      "Le pivot a remplacé l’ingestion depuis des sources autorisées (qui exigeait un accord de licence par site d’emploi) par des offres fournies par le candidat : coller une URL — récupérée avec une protection contre les SSRF, ou parcourue par le modèle quand un vrai fournisseur est configuré —, coller le texte de l’offre, coller un e-mail d’invitation, importer l’offre en PDF/DOCX ou remplir un formulaire. Chaque chemin aboutit à la même confirmation extraite avant toute autre chose.",
    "resumatch.roadmap.M4.title": "Adaptation de CV par IA",
    "resumatch.roadmap.M4.summary":
      "Un pipeline d’adaptation construit autour d’une garantie stricte : l’IA reformule et réordonne le résumé, le titre et les points d’expérience d’un candidat — elle n’invente jamais un employeur, une date, un diplôme ou une compétence qu’il n’a pas déjà indiqués. Imposé structurellement : la sortie du fournisseur est fusionnée en code avec le profil source, pas reprise telle quelle. Proposition puis relecture, pas en un seul coup — generate-preview renvoie un brouillon à modifier et approuver avant que generate-confirm ne l’enregistre —, avec des consignes libres par exécution comme troisième entrée cloisonnée, un rapport déterministe de couverture des mots-clés et une liste de contrôle qualité sur chaque aperçu.",
    "resumatch.roadmap.M5.title": "Export, historique & comparaison",
    "resumatch.roadmap.M5.summary":
      "Une mise en page épurée optimisée pour l’impression (PDF via la boîte d’impression du navigateur) et de vrais téléchargements DOCX pour le CV et la lettre, générés à partir de la même source pour que les deux exports ne divergent jamais. L’historique liste chaque adaptation et en compare deux côte à côte. `templateKey` existe déjà comme champ, pour que d’autres mises en page restent un simple ajout.",
    "resumatch.roadmap.M6.title": "Lettres de motivation par IA",
    "resumatch.roadmap.M6.summary":
      "Un second appel cloisonné au fournisseur rédige une lettre de motivation à partir des mêmes entrées confirmées, sous le même contrat de non-invention et la même discipline de fusion — avec réglage du ton et de la longueur, la même relecture aperçu/confirmation avant tout enregistrement, ses propres contrôles qualité déterministes et les mêmes exports impression + DOCX que le CV.",
    "resumatch.roadmap.M7.title": "Suivi des candidatures",
    "resumatch.roadmap.M7.summary":
      "Une liste par candidature qui suit chaque offre de enregistrée → envoyée → entretiens → offre/refus, avec un indicateur d’état en plusieurs étapes, des notes facultatives, une date de relance et un lien vers le CV adapté utilisé — le remplaçant léger du suivi d’offres supprimé lors du pivot, sans aucune exposition aux licences puisque chaque ligne est fournie ou approuvée par le candidat.",
    "resumatch.roadmap.M8.title": "Vrais fournisseurs de modèles",
    "resumatch.roadmap.M8.summary":
      "Des adaptateurs OpenAI et Anthropic pour l’adaptation et les lettres, plus OpenAI pour l’extraction, la réécriture du résumé et la navigation vers les URL d’offres — jamais sélectionnables dans un environnement déployé tant que la validation de classification JM-005 n’est pas enregistrée et qu’une clé n’est pas présente. Le fournisseur fixture reste le seul que la CI utilise. Lacune connue : les adaptateurs Anthropic d’extraction/réécriture/récupération d’offres sont encore des ébauches, suivies dans docs/megaplan.md (F2).",
    "resumatch.roadmap.M9.title": "Plus de mises en page & adéquation au marché",
    "resumatch.roadmap.M9.summary":
      "Un deuxième et un troisième modèle visuel au choix — l’étape de relecture permet déjà d’ajuster le contenu à la main avant d’enregistrer — plus le backlog de confiance et sécurité dont les vrais utilisateurs ont besoin : suppression élément par élément, limitation de débit, rappels de relance et couverture NL/FR pour le public belge. L’audit complet et la liste priorisée se trouvent dans docs/megaplan.md.",
    "resumatch.roadmap.M10.title": "Mise en production & opérations de confidentialité",
    "resumatch.roadmap.M10.summary":
      "Une décision AIPD spécifique au flux d’adaptation par IA (le texte d’une page d’offre et le CV réécrit d’un candidat passent tous deux par un appel au modèle), un worker asynchrone déployé qui sort l’analyse/l’extraction/l’adaptation du chemin des requêtes, un runbook d’incident et des preuves de charge et de reprise — le niveau requis pour fonctionner à l’échelle d’un pilote.",

    "resumatch.workspace.kicker": "Espace",
    "resumatch.workspace.inactiveBody":
      "Votre compte plateforme n’est pas actif, ResuMatch ne créera ni n’ouvrira donc d’espace de travail pour celui-ci. Contactez l’administrateur de la plateforme si c’est inattendu.",
    "resumatch.workspace.title": "Votre espace ResuMatch existe.",
    "resumatch.workspace.description":
      "Un conteneur isolé par utilisateur dans la base de données propre à ResuMatch. Votre profil et chaque CV adapté que vous générez sont rattachés à cette seule ligne.",
    "resumatch.workspace.card": "Espace de travail",
    "resumatch.workspace.created":
      "Créé le {date}. Relié à votre compte plateforme par un identifiant opaque — votre nom et votre e-mail restent dans la base de la plateforme.",
    "resumatch.workspace.profileCard": "Votre profil",
    "resumatch.workspace.profileBody":
      "Importez un CV, corrigez ce qui en a été lu et confirmez-le. L’adaptation part toujours de votre version confirmée.",
    "resumatch.workspace.tailorCard": "Adapter un CV",
    "resumatch.workspace.tailorBody":
      "Collez l’URL d’une offre, laissez l’IA y adapter votre profil confirmé, puis téléchargez-le en PDF.",

    "resumatch.error.kicker": "Erreur",
    "resumatch.error.title": "Un problème est survenu de notre côté.",
    "resumatch.error.strong": "Cette requête n’a pas pu aboutir.",
    "resumatch.error.body": "L’erreur a été consignée. Si vous la signalez, indiquez la référence",
    "resumatch.error.unavailable": "indisponible",
    "resumatch.error.retry": "Réessayer",
    "resumatch.loadingApp": "Chargement de ResuMatch…",
    "resumatch.notFound.title": "Cette page n’existe pas.",
    "resumatch.notFound.back": "Retour à l’aperçu →",
  },
  de: {
    "resumatch.meta.tagline": "Mit KI angepasste Lebensläufe",
    "resumatch.meta.description":
      "Mit KI angepasste Lebensläufe: Füge die URL einer Stellenanzeige ein, lass deinen Lebenslauf darauf zuschneiden und lade ihn als PDF herunter.",

    "resumatch.landing.eyebrow": "Offen in Entwicklung",
    "resumatch.landing.hero.before": "Dein Lebenslauf, ",
    "resumatch.landing.hero.accent": "zugeschnitten",
    "resumatch.landing.hero.after": " auf eine Stelle.",
    "resumatch.landing.hero.lead":
      "Füge die URL einer Stelle ein, die du willst. ResuMatch liest sie, schreibt dein bestätigtes Profil mit KI darauf hin um und gibt dir ein PDF zum Herunterladen — ohne je eine Tatsache über dich zu erfinden.",
    "resumatch.landing.cta.build": "Profil anlegen",
    "resumatch.landing.cta.how": "So funktioniert es",
    "resumatch.landing.hero.note": "Melde dich mit deinem Plattformkonto an — kein neues Passwort.",
    "resumatch.landing.stats.aria": "ResuMatch in drei Zahlen",
    "resumatch.landing.stat1.label": "erfundene Fakten",
    "resumatch.landing.stat1.sub": "Jede Zeile geht auf dein bestätigtes Profil zurück.",
    "resumatch.landing.stat2.label": "Stelle auf einmal",
    "resumatch.landing.stat2.sub": "Mit Absicht — keine Massenbewerbungen, kein Scraping im großen Stil.",
    "resumatch.landing.stat3.num": "90 Tage",
    "resumatch.landing.stat3.viz": "90 T",
    "resumatch.landing.stat3.label": "danach automatisch gelöscht",
    "resumatch.landing.stat3.sub": "Originale verschwinden automatisch — oder früher, mit einem Klick.",

    "resumatch.landing.how.kicker": "So funktioniert es",
    "resumatch.landing.how.title": "Drei Schritte. Nichts dazwischen versteckt.",
    "resumatch.landing.how.scanPassed": "✓ Malware-Prüfung bestanden",
    "resumatch.landing.how.step1.title": "Lade deinen Lebenslauf hoch",
    "resumatch.landing.how.step1.body":
      "Zuerst geprüft, dann in ein Profil eingelesen, das du korrigierst, bevor irgendetwas anderes damit passiert.",
    "resumatch.landing.how.step2.title": "Füge eine Stellen-URL ein",
    "resumatch.landing.how.step2.body":
      "Die eine Stelle, die du wirklich willst. Direkt abgerufen — keine Jobbörsen-Lizenzen, kein Massen-Scraping.",
    "resumatch.landing.how.download": "Herunterladen",
    "resumatch.landing.how.step3.title": "Lade das angepasste PDF herunter",
    "resumatch.landing.how.step3.body":
      "Die KI formuliert dein bestätigtes Profil auf diese Stelle hin um und gewichtet es neu. Druckfertig.",

    "resumatch.landing.rewrite.kicker": "Was das Anpassen macht",
    "resumatch.landing.rewrite.title": "Neu geordnet und umformuliert. Nie erfunden.",
    "resumatch.landing.rewrite.lead": "Folge den Linien: Jeder Punkt rechts stammt von einem Punkt links.",
    "resumatch.landing.zone.can": "Die KI darf umformulieren",
    "resumatch.landing.zone.locked": "Gesperrt — nie geändert",
    "resumatch.landing.zone.none": "Kein Feld vorhanden",
    "resumatch.landing.zone.noneNote": "Nichts zu speichern, also nichts abzuleiten.",
    "resumatch.landing.pill.summary": "Zusammenfassung",
    "resumatch.landing.pill.headline": "Überschrift",
    "resumatch.landing.pill.bullets": "Erfahrungspunkte",
    "resumatch.landing.pill.order": "Reihenfolge der Punkte",
    "resumatch.landing.pill.employers": "Arbeitgeber",
    "resumatch.landing.pill.dates": "Daten",
    "resumatch.landing.pill.degrees": "Abschlüsse",
    "resumatch.landing.pill.unlistedSkills": "Nicht angegebene Fähigkeiten",
    "resumatch.landing.pill.age": "Alter",
    "resumatch.landing.pill.nationality": "Nationalität",
    "resumatch.landing.pill.gender": "Geschlecht",

    "resumatch.landing.journey.kicker": "Der Weg deines Lebenslaufs",
    "resumatch.landing.journey.title": "Vom Hochladen bis zum Löschen ist jede Station sichtbar.",
    "resumatch.landing.journey.upload": "Hochladen",
    "resumatch.landing.journey.uploadSub": "PDF, DOCX oder TXT",
    "resumatch.landing.journey.scan": "Malware-Prüfung",
    "resumatch.landing.journey.scanSub": "Vorher öffnet ihn nichts",
    "resumatch.landing.journey.scanBranch": "Keine Antwort? → Quarantäne, nie verarbeitet",
    "resumatch.landing.journey.confirm": "Du bestätigst",
    "resumatch.landing.journey.confirmSub": "Dein Profil, nicht die Vermutung eines Parsers",
    "resumatch.landing.journey.tailored": "Angepasst",
    "resumatch.landing.journey.tailoredSub": "Auf eine Stelle",
    "resumatch.landing.journey.pdf": "Dein PDF",
    "resumatch.landing.journey.pdfSub": "Prüfen, dann verwenden",
    "resumatch.landing.retention.aria":
      "Aufbewahrung: Originale werden nach 90 Tagen automatisch gelöscht, und du kannst vorher jederzeit alles löschen.",
    "resumatch.landing.retention.marker": "Alles löschen — ein Klick, an jedem Tag",
    "resumatch.landing.retention.day0": "Tag 0 · Upload",
    "resumatch.landing.retention.day": "Tag {n}",
    "resumatch.landing.retention.day90": "Tag 90 · automatisch gelöscht",
    "resumatch.landing.retention.note":
      "Ein Klick entfernt deine Datei, jede Profilversion, jede abgerufene Stellenseite und jeden angepassten Lebenslauf.",

    "resumatch.landing.security.kicker": "Gebaut, um Vertrauen zu verdienen",
    "resumatch.landing.security.title": "Vier Mauern um deinen Lebenslauf.",
    "resumatch.landing.security.lead":
      "Eine Anfrage passiert jeden Ring, bevor sie deine Daten erreicht. Wähle eine Schicht, um zu sehen, was sie tut.",
    "resumatch.landing.layer1.title": "Standardmäßig alles verweigert",
    "resumatch.landing.layer1.body":
      "Nur die Startseite und die rechtlichen Seiten sind öffentlich. Alles andere erfordert eine Sitzung, die an der Datengrenze erneut geprüft wird.",
    "resumatch.landing.layer2.title": "Gemeinsame Anmeldung",
    "resumatch.landing.layer2.body":
      "Hub stellt die Sitzung aus, ResuMatch liest sie nur. Es gibt kein zweites Passwort, das verwaltet werden oder durchsickern könnte.",
    "resumatch.landing.layer3.title": "Geschwärzte Protokollierung",
    "resumatch.landing.layer3.body":
      "Jede Logzeile und jeder Audit-Eintrag passiert eine Positivliste. Lebenslauftext und Inhalte von Stellenseiten können nicht versehentlich in ein Log gelangen.",
    "resumatch.landing.layer4.title": "Isolierte Datenbank",
    "resumatch.landing.layer4.body":
      "Eine eigene PostgreSQL-Instanz mit eigenen Zugangsdaten. Sie speichert eine undurchsichtige Plattform-Benutzer-ID und kopiert nie die Benutzertabelle der Plattform.",

    "resumatch.landing.final.title": "Bereit, deinen ersten Lebenslauf anzupassen?",
    "resumatch.landing.final.body": "Einmal hochladen, Profil bestätigen und auf die Stelle ausrichten, die du willst.",

    "resumatch.landing.diff.before": "Dein bestätigtes Profil",
    "resumatch.landing.diff.after": "Angepasst für „{role}“",
    "resumatch.landing.diff.role": "Frontend Engineer",
    "resumatch.landing.diff.b1": "Leitete die Migration des Abrechnungsdienstes nach Go",
    "resumatch.landing.diff.b2": "Betreute vier Junior-Entwickler",
    "resumatch.landing.diff.b3": "Baute die Checkout-UI in React + TypeScript neu",
    "resumatch.landing.diff.b4": "Verkürzte die Ladezeit der Seiten um 40 %",
    "resumatch.landing.diff.b5": "Führte ein Barrierefreiheits-Audit nach WCAG 2.1 AA durch",
    "resumatch.landing.diff.r3": "Baute das Checkout-Erlebnis in React und TypeScript neu",
    "resumatch.landing.diff.r5": "Prüfte das Produkt nach WCAG 2.1 AA und schloss die Lücken",
    "resumatch.landing.diff.wasN": "▲ war Nr. {n}",
    "resumatch.landing.diff.reworded": "umformuliert",
    "resumatch.landing.diff.caption":
      "Illustratives Beispiel. Dieselben fünf Fakten auf beiden Seiten — auf die Stelle hin neu geordnet, zwei umformuliert, keiner hinzugefügt.",

    "resumatch.landing.art.jobPosting": "STELLENANZEIGE",
    "resumatch.landing.art.experience": "ERFAHRUNG",
    "resumatch.landing.art.skills": "FÄHIGKEITEN",
    "resumatch.landing.art.match": "TREFFER",
    "resumatch.landing.art.accessibility": "Barrierefreiheit",
    "resumatch.landing.art.scanned": "Geprüft",
    "resumatch.landing.art.scannedSub": "vor dem Lesen",
    "resumatch.landing.art.noInvented": "Nichts erfunden",

    "resumatch.roadmap.kicker": "Projektausrichtung",
    "resumatch.roadmap.title": "Der Weg von ResuMatch",
    "resumatch.roadmap.description":
      "Ein ergebnisorientierter Überblick darüber, was ausgeliefert ist, was gerade läuft und wohin sich das KI-Anpassungswerkzeug entwickelt. ResuMatch ist ein experimentelles Portfolio-Showcase — ein Meilenstein ist erst abgeschlossen, wenn sein Abschlussnachweis erbracht ist, nicht wenn sein Code gemergt wird.",
    "resumatch.roadmap.history": "Verlauf",
    "resumatch.roadmap.roadmap": "Roadmap",
    "resumatch.roadmap.all": "Alle",
    "resumatch.roadmap.progress": "{done} von {total} ausgeliefert",
    "resumatch.roadmap.toggle": "Zeitleisten-Ansicht",
    "resumatch.roadmap.changelogTitle": "Ausgeliefert & in Arbeit",
    "resumatch.roadmap.changelogSubtitle": "M1–M5 · docs/business-plan.md",
    "resumatch.roadmap.roadmapTitle": "Was als Nächstes kommt",
    "resumatch.roadmap.roadmapSubtitle": "Mehr Layouts, echte Modellanbieter, Produktionsreife",
    "resumatch.roadmap.status.shipped": "Ausgeliefert",
    "resumatch.roadmap.status.in-progress": "In Arbeit",
    "resumatch.roadmap.status.planned": "Geplant",
    "resumatch.roadmap.status.exploring": "In Prüfung",
    "resumatch.roadmap.timeframe.next": "Als Nächstes",
    "resumatch.roadmap.timeframe.later": "Später",
    "resumatch.roadmap.M1.title": "Plattform- & Auslieferungsbasis",
    "resumatch.roadmap.M1.summary":
      "Eine auslieferbare Next.js-App auf der Plattform: Hub-SSO, eine eigene PostgreSQL mit undurchsichtiger Plattform-Benutzer-ID, ein validierter Env-Vertrag, von Grund auf geschwärzte Protokollierung, eine Audit-Tabelle, in die nur angefügt wird, und CI. Unverändert aus dem Produkt vor dem Kurswechsel übernommen.",
    "resumatch.roadmap.M2.title": "Kandidatenprofil & Lebenslauf-Pipeline",
    "resumatch.roadmap.M2.summary":
      "Private Dokumentenablage mit Typerkennung auf Byte-Ebene und 10-MB-Limit, Malware-Prüfung als harte Schranke (ein ClamAV-Sidecar in Produktion), deterministische PDF/Word/Text-Extraktion mit optionalem KI-Durchlauf, der darauf zurückfällt, vollständiges CRUD pro Abschnitt mit Inline-Bearbeitung und manueller Eingabe, eine KI-Umformulierung des Tons für die Zusammenfassung, ein unveränderliches, versionsverknüpftes Profil ohne Feld für geschützte Merkmale sowie DSGVO-Auskunft und -Löschung mit einem Klick.",
    "resumatch.roadmap.M3.title": "Stellendetails, fünf Wege hinein",
    "resumatch.roadmap.M3.summary":
      "Der Kurswechsel ersetzte das Einlesen aus autorisierten Quellen (das pro Jobbörse eine Lizenzvereinbarung erforderte) durch Stellenanzeigen, die die Kandidatin oder der Kandidat selbst liefert: eine URL einfügen — mit SSRF-Schutz abgerufen oder vom Modell durchsucht, wenn ein echter Anbieter eingerichtet ist —, den Anzeigentext einfügen, eine Einladungs-E-Mail einfügen, die Anzeige als PDF/DOCX hochladen oder ein Formular ausfüllen. Jeder Weg endet bei derselben extrahierten Bestätigung, bevor irgendetwas anderes passiert.",
    "resumatch.roadmap.M4.title": "Lebenslauf-Anpassung mit KI",
    "resumatch.roadmap.M4.summary":
      "Eine Anpassungs-Pipeline rund um eine harte Garantie: Die KI formuliert Zusammenfassung, Überschrift und Erfahrungspunkte um und gewichtet sie neu — sie erfindet nie einen Arbeitgeber, ein Datum, einen Abschluss oder eine Fähigkeit, die nicht schon angegeben war. Strukturell durchgesetzt: Die Ausgabe des Anbieters wird im Code mit dem Quellprofil zusammengeführt, nicht wörtlich übernommen. Vorschlag und Prüfung statt eines einzigen Schritts — generate-preview liefert einen Entwurf zum Bearbeiten und Freigeben, bevor generate-confirm ihn speichert —, mit freien Anweisungen pro Lauf als dritter abgeschotteter Eingabe, einem deterministischen Bericht zur Schlüsselwortabdeckung und einer Qualitäts-Checkliste bei jeder Vorschau.",
    "resumatch.roadmap.M5.title": "Export, Verlauf & Vergleich",
    "resumatch.roadmap.M5.summary":
      "Ein schlichtes, druckoptimiertes Layout (PDF über den Druckdialog des Browsers) plus echte DOCX-Downloads für Lebenslauf und Anschreiben, beide aus derselben Inhaltsquelle, damit die zwei Exporte nie auseinanderlaufen. Der Verlauf listet jeden Anpassungslauf und vergleicht zwei nebeneinander. `templateKey` existiert bereits als Feld, damit weitere Layouts einfach hinzukommen können.",
    "resumatch.roadmap.M6.title": "Anschreiben mit KI",
    "resumatch.roadmap.M6.summary":
      "Ein zweiter abgeschotteter Anbieter-Aufruf entwirft ein Anschreiben aus denselben bestätigten Eingaben, unter demselben Vertrag gegen Erfundenes und derselben Zusammenführungsdisziplin — mit Einstellungen für Ton und Länge, derselben Vorschau-/Bestätigungsprüfung vor dem Speichern, eigenen deterministischen Qualitätsprüfungen und denselben Druck- und DOCX-Exporten wie der Lebenslauf.",
    "resumatch.roadmap.M7.title": "Bewerbungen verfolgen",
    "resumatch.roadmap.M7.summary":
      "Eine Liste pro Bewerbung, die jede Stelle von gespeichert → beworben → Gespräche → Angebot/Absage verfolgt, mit mehrstufiger Statusanzeige, optionalen Notizen, einem Nachfassdatum und einem Link zum verwendeten angepassten Lebenslauf — der schlanke Ersatz für den beim Kurswechsel entfernten Ablauf zum Verfolgen von Stellen, ohne Lizenzrisiko, da jede Zeile selbst geliefert oder freigegeben ist.",
    "resumatch.roadmap.M8.title": "Echte Modellanbieter",
    "resumatch.roadmap.M8.summary":
      "OpenAI- und Anthropic-Adapter für die Anpassungs- und Anschreiben-Aufrufe, dazu OpenAI für Extraktion, Umformulierung der Zusammenfassung und das Durchsuchen von Stellen-URLs — in einer ausgerollten Umgebung erst auswählbar, wenn die JM-005-Klassifizierung abgezeichnet ist und ein Schlüssel vorhanden ist. Der Fixture-Anbieter bleibt der einzige, den die CI je verwendet. Bekannte Lücke: Die Anthropic-Adapter für Extraktion/Umformulierung/Stellenabruf sind noch Platzhalter, erfasst in docs/megaplan.md (F2).",
    "resumatch.roadmap.M9.title": "Mehr Layouts & Marktreife",
    "resumatch.roadmap.M9.summary":
      "Eine zweite und dritte visuelle Vorlage zur Auswahl — im Prüfschritt lassen sich Inhalte vor dem Speichern bereits von Hand anpassen — plus der Trust-and-Safety-Backlog, den echte Nutzer brauchen: Löschen einzelner Einträge, Rate Limiting, Nachfass-Erinnerungen und NL/FR-Abdeckung für das belgische Publikum. Das vollständige Audit und die priorisierte Liste stehen in docs/megaplan.md.",
    "resumatch.roadmap.M10.title": "Produktionsreife & Datenschutzbetrieb",
    "resumatch.roadmap.M10.summary":
      "Eine DSFA-Entscheidung speziell für den KI-Anpassungsablauf (der Text einer Stellenseite und der umgeschriebene Lebenslauf gehen beide durch einen Modellaufruf), ein ausgerollter asynchroner Worker, der Prüfen/Extrahieren/Anpassen aus dem Anfragepfad nimmt, ein Incident-Runbook sowie Last- und Wiederherstellungsnachweise — die Messlatte für den Betrieb im Pilotmaßstab.",

    "resumatch.workspace.kicker": "Arbeitsbereich",
    "resumatch.workspace.inactiveBody":
      "Dein Plattformkonto ist nicht aktiv, daher legt ResuMatch keinen Arbeitsbereich dafür an und öffnet auch keinen. Wende dich an die Plattformverwaltung, wenn das unerwartet ist.",
    "resumatch.workspace.title": "Dein ResuMatch-Arbeitsbereich existiert.",
    "resumatch.workspace.description":
      "Ein isolierter Container pro Nutzer in der eigenen Datenbank von ResuMatch. Dein Profil und jeder angepasste Lebenslauf, den du erzeugst, hängen an dieser einen Zeile.",
    "resumatch.workspace.card": "Arbeitsbereich",
    "resumatch.workspace.created":
      "Angelegt am {date}. Über eine undurchsichtige ID mit deinem Plattformkonto verknüpft — Name und E-Mail bleiben in der Plattformdatenbank.",
    "resumatch.workspace.profileCard": "Dein Profil",
    "resumatch.workspace.profileBody":
      "Lade einen Lebenslauf hoch, korrigiere, was daraus gelesen wurde, und bestätige ihn. Beim Anpassen wird immer deine bestätigte Version verwendet.",
    "resumatch.workspace.tailorCard": "Lebenslauf anpassen",
    "resumatch.workspace.tailorBody":
      "Füge die URL einer Stellenanzeige ein, lass die KI dein bestätigtes Profil darauf hin umformulieren und lade es als PDF herunter.",

    "resumatch.error.kicker": "Fehler",
    "resumatch.error.title": "Bei uns ist etwas schiefgelaufen.",
    "resumatch.error.strong": "Diese Anfrage konnte nicht abgeschlossen werden.",
    "resumatch.error.body": "Der Fehler wurde protokolliert. Wenn du ihn meldest, nenne die Referenz",
    "resumatch.error.unavailable": "nicht verfügbar",
    "resumatch.error.retry": "Erneut versuchen",
    "resumatch.loadingApp": "ResuMatch wird geladen…",
    "resumatch.notFound.title": "Diese Seite gibt es nicht.",
    "resumatch.notFound.back": "Zurück zur Übersicht →",
  },
};
