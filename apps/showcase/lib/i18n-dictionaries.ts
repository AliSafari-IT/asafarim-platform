import { mergeDictionaries, type Dictionaries } from "@asafarim/shared-i18n";
import testoraDictionaries from "./testora-dictionaries";
import aiEvalDictionaries from "./ai-eval-dictionaries";
import edumatchDictionaries from "./edumatch-dictionaries";
import viontoDictionaries from "./vionto-dictionaries";

const showcaseBaseDictionaries: Dictionaries = {
  en: {
    "showcase.nav.exhibition": "Exhibition",
    "showcase.nav.projects": "Projects",
    "showcase.nav.labs": "Labs",
    "showcase.appSwitcher.asafarimDigital": "ASafarIM Digital",
    "showcase.appSwitcher.hub": "Hub",
    "showcase.appSwitcher.dashboard": "dashboard",
    "showcase.appSwitcher.studio": "studio",
    "showcase.status.live": "live",
    "showcase.status.beta": "beta",
    "showcase.status.planned": "planned",
    "showcase.status.archived": "archived",
    "showcase.home.hero.kicker": "The exhibition",
    "showcase.home.hero.title": "Curated projects from the ASafarIM Digital lab.",
    "showcase.home.hero.lede":
      "Demos, case studies, and experiments — each piece on this wall is real software you can inspect and try.",
    "showcase.home.hero.ctaPrimary": "Walk the gallery",
    "showcase.home.hero.ctaSecondary": "Peek into Labs",
    "showcase.home.featured.kicker": "On display",
    "showcase.home.featured.title": "Featured pieces",
    "showcase.projects.kicker": "Gallery",
    "showcase.projects.title": "Projects",
    "showcase.projects.description":
      "Every piece on the wall — tech stacks, statuses, and case studies.",
    "showcase.labs.kicker": "Experimental shelf",
    "showcase.labs.title": "Labs",
    "showcase.labs.description":
      "Half-built ideas, prototypes, and things that might break.",
    "showcase.labs.empty.title": "The shelf is empty — for now",
    "showcase.labs.empty.description":
      "Experiments from labs.asafarim.be will appear here as they are dusted off and rebuilt on the platform.",
    "showcase.projects.task-management.title": "Task Management",
    "showcase.projects.task-management.summary":
      "End-to-end task management vertical with API and web client, originally built in the asafarim.be ecosystem.",
    "showcase.projects.smart-operations.title": "Smart Operations Dashboard",
    "showcase.projects.smart-operations.summary":
      "Operations KPI dashboard showcase with real-time views and reporting.",
    "showcase.projects.testora.title": "Testora",
    "showcase.projects.testora.summary":
      "A deterministic Playwright benchmark: a seeded sample app with intentional pass/fail/flaky tests, scored on detection, flake identification, and artifact completeness.",
    "showcase.projects.ai-eval.title": "AI Evaluation Lab",
    "showcase.projects.ai-eval.summary":
      "A provider-neutral, fixture-mode AI benchmark: versioned prompts and synthetic datasets scored for correctness, groundedness, format compliance, latency, cost, and safety — reproducibly, with no API keys.",
    "showcase.projects.edumatch.title": "EduMatch",
    "showcase.projects.edumatch.summary":
      "An explainable tutor-matching benchmark: synthetic students and tutors, a transparent weighted-factor engine you can adjust live, and fairness/stability checks.",
    "showcase.projects.vionto.title": "Vionto Studio",
    "showcase.projects.vionto.summary":
      "A transparent AI media-pipeline benchmark: a schema-validated brief-to-render pipeline with approval-gated retry, seeded stage failures, and cost estimation — no live providers, no real media.",
    "showcase.project.back": "← Back to the wall",
    "showcase.project.exhibit": "Exhibit №",
    "showcase.project.specSheet": "Spec sheet",
    "showcase.project.caseStudy": "Case study",
    "showcase.project.caseStudyBody":
      "Full case study, screenshots, and a live demo link will be hung next to this piece when the showcase content is migrated.",
    "showcase.nav.overview": "Overview",
    "showcase.nav.leaderboard": "Leaderboard",
    "showcase.nav.results": "Results",
    "showcase.nav.regression": "Regression",
    "showcase.nav.latestRun": "Latest run",
    "showcase.nav.trend": "Trend",
    "showcase.nav.pipeline": "Pipeline explorer",
    "showcase.nav.manifests": "Manifests",
    "showcase.nav.cost": "Cost",
    "showcase.nav.matchExplorer": "Match explorer",
    "showcase.nav.journey": "Journey",
    "showcase.nav.fairness": "Fairness",
    "showcase.nav.caseStudy": "Case study",
    "showcase.fixtures.testora":
      "<strong>Fixture data, not production.</strong> These pages render a committed, reproducible snapshot distilled from a real Playwright run of a seeded sample app. Nothing here is executed live, and no event on this page is a real user event. The runnable harness lives in <code>benchmarks/testora</code>.",
    "showcase.fixtures.aiEval":
      "<strong>Fixture mode — synthetic data, no live models.</strong> These pages render committed, reproducible results from the runnable harness in <code>benchmarks/ai-eval</code>. Models are provider-neutral aliases; datasets are synthetic and openly licensed. Latency and cost are representative fixtures, never live measurements. No employer or customer data, prompts, or IP appear anywhere.",
    "showcase.fixtures.edumatch":
      "<strong>Synthetic data, safe demo mode.</strong> Every tutor and student here is invented for this benchmark — no real people, no real bookings, no real payments, no external side effects. Ranking runs entirely in your browser against committed fixtures. The runnable harness lives in <code>benchmarks/edumatch</code>.",
    "showcase.fixtures.vionto":
      "<strong>Fixture mode, no live providers.</strong> Every script, storyboard, and asset here is a deterministic, committed fixture — no LLM call, no render worker, no API keys. Assets are synthetic placeholders (CC0, described in <code>fixtures/assets.json</code>). The interactive pipeline below runs the real engine in your browser, with zero network calls. Runnable harness: <code>benchmarks/vionto</code>.",
  },
  nl: {
    "showcase.nav.exhibition": "Tentoonstelling",
    "showcase.nav.projects": "Projecten",
    "showcase.nav.labs": "Labs",
    "showcase.appSwitcher.asafarimDigital": "ASafarIM Digital",
    "showcase.appSwitcher.hub": "Hub",
    "showcase.appSwitcher.dashboard": "dashboard",
    "showcase.appSwitcher.studio": "studio",
    "showcase.status.live": "live",
    "showcase.status.beta": "beta",
    "showcase.status.planned": "gepland",
    "showcase.status.archived": "gearchiveerd",
    "showcase.home.hero.kicker": "De tentoonstelling",
    "showcase.home.hero.title": "Geselecteerde projecten uit het ASafarIM Digital lab.",
    "showcase.home.hero.lede":
      "Demo's, case studies en experimenten — elk stuk op deze muur is echte software die je kunt inspecteren en uitproberen.",
    "showcase.home.hero.ctaPrimary": "Door de galerij lopen",
    "showcase.home.hero.ctaSecondary": "Kijk in Labs",
    "showcase.home.featured.kicker": "Tentoongesteld",
    "showcase.home.featured.title": "Uitgelichte stukken",
    "showcase.projects.kicker": "Galerij",
    "showcase.projects.title": "Projecten",
    "showcase.projects.description":
      "Elk stuk aan de muur — tech stacks, statussen en case studies.",
    "showcase.labs.kicker": "Experimenteel plank",
    "showcase.labs.title": "Labs",
    "showcase.labs.description":
      "Half-afgewerkte ideeën, prototypes en dingen die kunnen breken.",
    "showcase.labs.empty.title": "Het plankje is leeg — voor nu",
    "showcase.labs.empty.description":
      "Experimenten van labs.asafarim.be verschijnen hier zodra ze worden opgepoetst en op het platform herbouwd.",
    "showcase.projects.task-management.title": "Task Management",
    "showcase.projects.task-management.summary":
      "End-to-end task management-verticaal met API en web client, oorspronkelijk gebouwd in het asafarim.be-ecosysteem.",
    "showcase.projects.smart-operations.title": "Smart Operations Dashboard",
    "showcase.projects.smart-operations.summary":
      "Operations KPI dashboard-showcase met real-time views en rapportage.",
    "showcase.projects.testora.title": "Testora",
    "showcase.projects.testora.summary":
      "Een deterministische Playwright-benchmark: een seeded sample app met opzettelijke pass/fail/flaky tests, gescoord op detectie, flake-identificatie en artifact-compleetheid.",
    "showcase.projects.ai-eval.title": "AI Evaluation Lab",
    "showcase.projects.ai-eval.summary":
      "Een provider-neutrale, fixture-mode AI-benchmark: geversioneerde prompts en synthetische datasets gescoord op correctheid, groundedness, format compliance, latency, kosten en veiligheid — reproduceerbaar, zonder API keys.",
    "showcase.projects.edumatch.title": "EduMatch",
    "showcase.projects.edumatch.summary":
      "Een verklarende tutor-matching benchmark: synthetische studenten en tutors, een transparante gewogen-factoren engine die je live kunt aanpassen, en fairness/stability checks.",
    "showcase.projects.vionto.title": "Vionto Studio",
    "showcase.projects.vionto.summary":
      "Een transparante AI media-pipeline benchmark: een schema-gevalideerde brief-to-render pipeline met approval-gated retry, seeded stage failures en kostenraming — geen live providers, geen echte media.",
    "showcase.project.back": "← Terug naar de muur",
    "showcase.project.exhibit": "Exhibit №",
    "showcase.project.specSheet": "Spec sheet",
    "showcase.project.caseStudy": "Case study",
    "showcase.project.caseStudyBody":
      "De volledige case study, screenshots en een live demo-link worden hiernaast opgehangen zodra de showcase-content is gemigreerd.",
    "showcase.nav.overview": "Overzicht",
    "showcase.nav.leaderboard": "Scorebord",
    "showcase.nav.results": "Resultaten",
    "showcase.nav.regression": "Regressie",
    "showcase.nav.latestRun": "Laatste run",
    "showcase.nav.trend": "Trend",
    "showcase.nav.pipeline": "Pipeline-verkenner",
    "showcase.nav.manifests": "Manifesten",
    "showcase.nav.cost": "Kosten",
    "showcase.nav.matchExplorer": "Match-verkenner",
    "showcase.nav.journey": "Reis",
    "showcase.nav.fairness": "Eerlijkheid",
    "showcase.nav.caseStudy": "Case study",
    "showcase.fixtures.testora":
      "<strong>Fixture data, niet productie.</strong> Deze pagina's tonen een committed, reproduceerbare snapshot gedistilleerd uit een echte Playwright-run van een seeded sample app. Hier wordt niets live uitgevoerd en geen enkele gebeurtenis op deze pagina is een echte gebruikersactie. De runnable harness bevindt zich in <code>benchmarks/testora</code>.",
    "showcase.fixtures.aiEval":
      "<strong>Fixture-modus — synthetische data, geen live modellen.</strong> Deze pagina's tonen committed, reproduceerbare resultaten van de runnable harness in <code>benchmarks/ai-eval</code>. Modellen zijn provider-neutrale aliassen; datasets zijn synthetisch en open gelicenseerd. Latency en kosten zijn representatieve fixtures, nooit live metingen. Geen werkgevers- of klantdata, prompts of IP verschijnt ergens.",
    "showcase.fixtures.edumatch":
      "<strong>Synthetische data, veilige demo-modus.</strong> Elke tutor en student hier is verzonnen voor deze benchmark — geen echte mensen, geen echte boekingen, geen echte betalingen, geen externe bijwerkingen. Ranking draait volledig in je browser tegen committed fixtures. De runnable harness bevindt zich in <code>benchmarks/edumatch</code>.",
    "showcase.fixtures.vionto":
      "<strong>Fixture-modus, geen live providers.</strong> Elk script, storyboard en asset hier is een deterministische, committed fixture — geen LLM-call, geen render worker, geen API keys. Assets zijn synthetische placeholders (CC0, beschreven in <code>fixtures/assets.json</code>). De interactieve pipeline hieronder draait de echte engine in je browser, zonder netwerkcalls. Runnable harness: <code>benchmarks/vionto</code>.",
  },
  fr: {
    "showcase.nav.exhibition": "Exposition",
    "showcase.nav.projects": "Projets",
    "showcase.nav.labs": "Labs",
    "showcase.appSwitcher.asafarimDigital": "ASafarIM Digital",
    "showcase.appSwitcher.hub": "Hub",
    "showcase.appSwitcher.dashboard": "dashboard",
    "showcase.appSwitcher.studio": "studio",
    "showcase.status.live": "live",
    "showcase.status.beta": "bêta",
    "showcase.status.planned": "planifié",
    "showcase.status.archived": "archivé",
    "showcase.home.hero.kicker": "L'exposition",
    "showcase.home.hero.title": "Projets sélectionnés du lab ASafarIM Digital.",
    "showcase.home.hero.lede":
      "Démos, études de cas et expériences — chaque pièce sur ce mur est un logiciel réel que vous pouvez inspecter et essayer.",
    "showcase.home.hero.ctaPrimary": "Parcourir la galerie",
    "showcase.home.hero.ctaSecondary": "Coup d'œil dans Labs",
    "showcase.home.featured.kicker": "À l'affiche",
    "showcase.home.featured.title": "Pièces en vedette",
    "showcase.projects.kicker": "Galerie",
    "showcase.projects.title": "Projets",
    "showcase.projects.description":
      "Chaque pièce au mur — stacks tech, statuts et études de cas.",
    "showcase.labs.kicker": "Étagère expérimentale",
    "showcase.labs.title": "Labs",
    "showcase.labs.description":
      "Idées à moitié construites, prototypes et choses qui pourraient casser.",
    "showcase.labs.empty.title": "L'étagère est vide — pour l'instant",
    "showcase.labs.empty.description":
      "Les expériences de labs.asafarim.be apparaîtront ici une fois dépoussiérées et reconstruites sur la plateforme.",
    "showcase.projects.task-management.title": "Task Management",
    "showcase.projects.task-management.summary":
      "Verticale de gestion de tâches end-to-end avec API et client web, initialement construite dans l'écosystème asafarim.be.",
    "showcase.projects.smart-operations.title": "Smart Operations Dashboard",
    "showcase.projects.smart-operations.summary":
      "Showcase de tableau de bord KPI opérationnel avec vues en temps réel et reporting.",
    "showcase.projects.testora.title": "Testora",
    "showcase.projects.testora.summary":
      "Un benchmark Playwright déterministe : une sample app seedée avec des tests pass/fail/flaky intentionnels, notés sur la détection, l'identification de flakes et la complétude des artefacts.",
    "showcase.projects.ai-eval.title": "AI Evaluation Lab",
    "showcase.projects.ai-eval.summary":
      "Un benchmark AI en mode fixture et neutre vis-à-vis des fournisseurs : prompts versionnés et datasets synthétiques notés pour la correction, la groundedness, le format compliance, la latence, le coût et la sécurité — de manière reproductible, sans API keys.",
    "showcase.projects.edumatch.title": "EduMatch",
    "showcase.projects.edumatch.summary":
      "Un benchmark de matching tutor explicable : étudiants et tuteurs synthétiques, un moteur transparent à facteurs pondérés ajustable en live, et des vérifications d'équité/stabilité.",
    "showcase.projects.vionto.title": "Vionto Studio",
    "showcase.projects.vionto.summary":
      "Un benchmark de pipeline média AI transparent : un pipeline brief-to-render validé par schéma avec retry conditionné par approbation, seeded stage failures et estimation des coûts — aucun provider live, aucun média réel.",
    "showcase.project.back": "← Retour au mur",
    "showcase.project.exhibit": "Exhibit №",
    "showcase.project.specSheet": "Fiche technique",
    "showcase.project.caseStudy": "Case study",
    "showcase.project.caseStudyBody":
      "L'étude de cas complète, les captures d'écran et le lien vers une démo en direct seront accrochés à côté de cette pièce une fois le contenu de la showcase migré.",
    "showcase.nav.overview": "Aperçu",
    "showcase.nav.leaderboard": "Classement",
    "showcase.nav.results": "Résultats",
    "showcase.nav.regression": "Régression",
    "showcase.nav.latestRun": "Dernier run",
    "showcase.nav.trend": "Tendance",
    "showcase.nav.pipeline": "Explorateur pipeline",
    "showcase.nav.manifests": "Manifestes",
    "showcase.nav.cost": "Coût",
    "showcase.nav.matchExplorer": "Explorateur de matchs",
    "showcase.nav.journey": "Parcours",
    "showcase.nav.fairness": "Équité",
    "showcase.nav.caseStudy": "Étude de cas",
    "showcase.fixtures.testora":
      "<strong>Données de fixture, pas de production.</strong> Ces pages affichent un instantané committed et reproductible distillé d'une vraie exécution Playwright sur une sample app seedée. Rien n'est exécuté en direct ici, et aucun événement sur cette page n'est un événement réel. Le runnable harness se trouve dans <code>benchmarks/testora</code>.",
    "showcase.fixtures.aiEval":
      "<strong>Mode fixture — données synthétiques, pas de modèles live.</strong> Ces pages affichent des résultats committed et reproductibles du runnable harness dans <code>benchmarks/ai-eval</code>. Les modèles sont des alias neutres vis-à-vis des fournisseurs ; les datasets sont synthétiques et sous licence ouverte. La latence et le coût sont des fixtures représentatives, jamais des mesures live. Aucune donnée employeur, client, prompt ou IP n'apparaît ici.",
    "showcase.fixtures.edumatch":
      "<strong>Données synthétiques, mode démo sécurisé.</strong> Chaque tuteur et étudiant ici est inventé pour ce benchmark — pas de vraies personnes, pas de vraies réservations, pas de vrais paiements, pas d'effets secondaires externes. Le classement s'exécute entièrement dans votre navigateur contre des fixtures committed. Le runnable harness se trouve dans <code>benchmarks/edumatch</code>.",
    "showcase.fixtures.vionto":
      "<strong>Mode fixture, pas de providers live.</strong> Chaque script, storyboard et asset ici est une fixture déterministe et committed — pas d'appel LLM, pas de render worker, pas de clés API. Les assets sont des placeholders synthétiques (CC0, décrits dans <code>fixtures/assets.json</code>). La pipeline interactive ci-dessous exécute le vrai moteur dans votre navigateur, sans aucun appel réseau. Runnable harness : <code>benchmarks/vionto</code>.",
  },
  de: {
    "showcase.nav.exhibition": "Ausstellung",
    "showcase.nav.projects": "Projekte",
    "showcase.nav.labs": "Labs",
    "showcase.appSwitcher.asafarimDigital": "ASafarIM Digital",
    "showcase.appSwitcher.hub": "Hub",
    "showcase.appSwitcher.dashboard": "dashboard",
    "showcase.appSwitcher.studio": "studio",
    "showcase.status.live": "live",
    "showcase.status.beta": "beta",
    "showcase.status.planned": "geplant",
    "showcase.status.archived": "archiviert",
    "showcase.home.hero.kicker": "Die Ausstellung",
    "showcase.home.hero.title": "Kuratierte Projekte aus dem ASafarIM Digital Lab.",
    "showcase.home.hero.lede":
      "Demos, Fallstudien und Experimente — jedes Stück an dieser Wand ist echte Software, die du inspizieren und ausprobieren kannst.",
    "showcase.home.hero.ctaPrimary": "Galerie durchlaufen",
    "showcase.home.hero.ctaSecondary": "Labs erkunden",
    "showcase.home.featured.kicker": "Ausgestellt",
    "showcase.home.featured.title": "Vorgestellte Stücke",
    "showcase.projects.kicker": "Galerie",
    "showcase.projects.title": "Projekte",
    "showcase.projects.description":
      "Jedes Stück an der Wand — Tech Stacks, Status und Fallstudien.",
    "showcase.labs.kicker": "Experimentelles Regal",
    "showcase.labs.title": "Labs",
    "showcase.labs.description":
      "Halb fertige Ideen, Prototypen und Dinge, die brechen könnten.",
    "showcase.labs.empty.title": "Das Regal ist leer — vorerst",
    "showcase.labs.empty.description":
      "Experimente von labs.asafarim.be erscheinen hier, sobald sie aufpoliert und auf der Plattform neu aufgebaut werden.",
    "showcase.projects.task-management.title": "Task Management",
    "showcase.projects.task-management.summary":
      "End-to-end Task-Management-Vertikale mit API und Web-Client, ursprünglich im asafarim.be-Ökosystem gebaut.",
    "showcase.projects.smart-operations.title": "Smart Operations Dashboard",
    "showcase.projects.smart-operations.summary":
      "Operations KPI Dashboard Showcase mit Echtzeit-Ansichten und Reporting.",
    "showcase.projects.testora.title": "Testora",
    "showcase.projects.testora.summary":
      "Ein deterministischer Playwright-Benchmark: eine seeded Sample App mit absichtlichen pass/fail/flaky Tests, bewertet auf Detection, Flake-Identifikation und Artifact-Completeness.",
    "showcase.projects.ai-eval.title": "AI Evaluation Lab",
    "showcase.projects.ai-eval.summary":
      "Ein provider-neutrales AI-Benchmark im Fixture-Modus: versionierte Prompts und synthetische Datensätze, bewertet auf Korrektheit, Groundedness, Format-Compliance, Latenz, Kosten und Sicherheit — reproduzierbar, ohne API Keys.",
    "showcase.projects.edumatch.title": "EduMatch",
    "showcase.projects.edumatch.summary":
      "Ein erklärbarer Tutor-Matching-Benchmark: synthetische Studenten und Tutoren, eine transparente gewichtete Faktoren-Engine, die du live anpassen kannst, sowie Fairness/Stability-Checks.",
    "showcase.projects.vionto.title": "Vionto Studio",
    "showcase.projects.vionto.summary":
      "Ein transparenter AI Media-Pipeline-Benchmark: ein schema-validierter Brief-to-Render-Pipeline mit Approval-gated Retry, seeded Stage Failures und Kostenschätzung — keine Live-Provider, keine echten Medien.",
    "showcase.project.back": "← Zurück zur Wand",
    "showcase.project.exhibit": "Exhibit №",
    "showcase.project.specSheet": "Datenblatt",
    "showcase.project.caseStudy": "Case study",
    "showcase.project.caseStudyBody":
      "Die vollständige Fallstudie, Screenshots und ein Live-Demo-Link werden neben dieses Stück gehängt, sobald der Showcase-Inhalt migriert ist.",
    "showcase.nav.overview": "Übersicht",
    "showcase.nav.leaderboard": "Rangliste",
    "showcase.nav.results": "Ergebnisse",
    "showcase.nav.regression": "Regression",
    "showcase.nav.latestRun": "Letzter Lauf",
    "showcase.nav.trend": "Trend",
    "showcase.nav.pipeline": "Pipeline-Explorer",
    "showcase.nav.manifests": "Manifeste",
    "showcase.nav.cost": "Kosten",
    "showcase.nav.matchExplorer": "Match-Explorer",
    "showcase.nav.journey": "Journey",
    "showcase.nav.fairness": "Fairness",
    "showcase.nav.caseStudy": "Case Study",
    "showcase.fixtures.testora":
      "<strong>Fixture-Daten, keine Produktion.</strong> Diese Seiten rendern einen committed, reproduzierbaren Snapshot, destilliert aus einem echten Playwright-Lauf einer seeded sample app. Hier wird nichts live ausgeführt, und kein Ereignis auf dieser Seite ist ein echtes Benutzerereignis. Der runnable harness befindet sich in <code>benchmarks/testora</code>.",
    "showcase.fixtures.aiEval":
      "<strong>Fixture-Modus — synthetische Daten, keine live-Modelle.</strong> Diese Seiten rendern committed, reproduzierbare Ergebnisse des runnable harness in <code>benchmarks/ai-eval</code>. Modelle sind provider-neutrale Aliase; Datensätze sind synthetisch und offen lizenziert. Latenz und Kosten sind repräsentative Fixtures, niemals live-Messwerte. Keine Arbeitgeber-, Kunden-, Prompt- oder IP-Daten erscheinen hier.",
    "showcase.fixtures.edumatch":
      "<strong>Synthetische Daten, sicherer Demo-Modus.</strong> Jeder Tutor und Schüler hier ist für diesen Benchmark erfunden — keine echten Personen, keine echten Buchungen, keine echten Zahlungen, keine externen Nebeneffekte. Das Ranking läuft komplett in deinem Browser gegen committed fixtures. Der runnable harness befindet sich in <code>benchmarks/edumatch</code>.",
    "showcase.fixtures.vionto":
      "<strong>Fixture-Modus, keine live-Provider.</strong> Jedes Skript, Storyboard und Asset hier ist eine deterministische, committed Fixture — kein LLM-Call, kein Render-Worker, keine API-Keys. Assets sind synthetische Placeholder (CC0, beschrieben in <code>fixtures/assets.json</code>). Die interaktive Pipeline unten führt die echte Engine in deinem Browser aus, ohne Netzwerkaufrufe. Runnable harness: <code>benchmarks/vionto</code>.",
  },
  lb: {
    "showcase.nav.exhibition": "Exhibition",
    "showcase.nav.projects": "Projects",
    "showcase.nav.labs": "Labs",
    "showcase.appSwitcher.asafarimDigital": "ASafarIM Digital",
    "showcase.appSwitcher.hub": "Hub",
    "showcase.appSwitcher.dashboard": "dashboard",
    "showcase.appSwitcher.studio": "studio",
    "showcase.status.live": "live",
    "showcase.status.beta": "beta",
    "showcase.status.planned": "planned",
    "showcase.status.archived": "archived",
    "showcase.home.hero.kicker": "The exhibition",
    "showcase.home.hero.title": "Curated projects from the ASafarIM Digital lab.",
    "showcase.home.hero.lede":
      "Demos, case studies, and experiments — each piece on this wall is real software you can inspect and try.",
    "showcase.home.hero.ctaPrimary": "Walk the gallery",
    "showcase.home.hero.ctaSecondary": "Peek into Labs",
    "showcase.home.featured.kicker": "On display",
    "showcase.home.featured.title": "Featured pieces",
    "showcase.projects.kicker": "Gallery",
    "showcase.projects.title": "Projects",
    "showcase.projects.description":
      "Every piece on the wall — tech stacks, statuses, and case studies.",
    "showcase.labs.kicker": "Experimental shelf",
    "showcase.labs.title": "Labs",
    "showcase.labs.description":
      "Half-built ideas, prototypes, and things that might break.",
    "showcase.labs.empty.title": "The shelf is empty — for now",
    "showcase.labs.empty.description":
      "Experiments from labs.asafarim.be will appear here as they are dusted off and rebuilt on the platform.",
    "showcase.projects.task-management.title": "Task Management",
    "showcase.projects.task-management.summary":
      "End-to-end task management vertical with API and web client, originally built in the asafarim.be ecosystem.",
    "showcase.projects.smart-operations.title": "Smart Operations Dashboard",
    "showcase.projects.smart-operations.summary":
      "Operations KPI dashboard showcase with real-time views and reporting.",
    "showcase.projects.testora.title": "Testora",
    "showcase.projects.testora.summary":
      "A deterministic Playwright benchmark: a seeded sample app with intentional pass/fail/flaky tests, scored on detection, flake identification, and artifact completeness.",
    "showcase.projects.ai-eval.title": "AI Evaluation Lab",
    "showcase.projects.ai-eval.summary":
      "A provider-neutral, fixture-mode AI benchmark: versioned prompts and synthetic datasets scored for correctness, groundedness, format compliance, latency, cost, and safety — reproducibly, with no API keys.",
    "showcase.projects.edumatch.title": "EduMatch",
    "showcase.projects.edumatch.summary":
      "An explainable tutor-matching benchmark: synthetic students and tutors, a transparent weighted-factor engine you can adjust live, and fairness/stability checks.",
    "showcase.projects.vionto.title": "Vionto Studio",
    "showcase.projects.vionto.summary":
      "A transparent AI media-pipeline benchmark: a schema-validated brief-to-render pipeline with approval-gated retry, seeded stage failures, and cost estimation — no live providers, no real media.",
    "showcase.project.back": "← Back to the wall",
    "showcase.project.exhibit": "Exhibit №",
    "showcase.project.specSheet": "Spec sheet",
    "showcase.project.caseStudy": "Case study",
    "showcase.project.caseStudyBody":
      "Full case study, screenshots, and a live demo link will be hung next to this piece when the showcase content is migrated.",
    "showcase.nav.overview": "Overview",
    "showcase.nav.leaderboard": "Leaderboard",
    "showcase.nav.results": "Results",
    "showcase.nav.regression": "Regression",
    "showcase.nav.latestRun": "Latest run",
    "showcase.nav.trend": "Trend",
    "showcase.nav.pipeline": "Pipeline explorer",
    "showcase.nav.manifests": "Manifests",
    "showcase.nav.cost": "Cost",
    "showcase.nav.matchExplorer": "Match explorer",
    "showcase.nav.journey": "Journey",
    "showcase.nav.fairness": "Fairness",
    "showcase.nav.caseStudy": "Case study",
    "showcase.fixtures.testora":
      "<strong>Fixture data, not production.</strong> These pages render a committed, reproducible snapshot distilled from a real Playwright run of a seeded sample app. Nothing here is executed live, and no event on this page is a real user event. The runnable harness lives in <code>benchmarks/testora</code>.",
    "showcase.fixtures.aiEval":
      "<strong>Fixture mode — synthetic data, no live models.</strong> These pages render committed, reproducible results from the runnable harness in <code>benchmarks/ai-eval</code>. Models are provider-neutral aliases; datasets are synthetic and openly licensed. Latency and cost are representative fixtures, never live measurements. No employer or customer data, prompts, or IP appear anywhere.",
    "showcase.fixtures.edumatch":
      "<strong>Synthetic data, safe demo mode.</strong> Every tutor and student here is invented for this benchmark — no real people, no real bookings, no real payments, no external side effects. Ranking runs entirely in your browser against committed fixtures. The runnable harness lives in <code>benchmarks/edumatch</code>.",
    "showcase.fixtures.vionto":
      "<strong>Fixture mode, no live providers.</strong> Every script, storyboard, and asset here is a deterministic, committed fixture — no LLM call, no render worker, no API keys. Assets are synthetic placeholders (CC0, described in <code>fixtures/assets.json</code>). The interactive pipeline below runs the real engine in your browser, with zero network calls. Runnable harness: <code>benchmarks/vionto</code>.",
  },
};

const showcaseDictionaries = mergeDictionaries(
  mergeDictionaries(
    mergeDictionaries(
      mergeDictionaries(showcaseBaseDictionaries, testoraDictionaries),
      aiEvalDictionaries
    ),
    edumatchDictionaries
  ),
  viontoDictionaries
);

export default showcaseDictionaries;
