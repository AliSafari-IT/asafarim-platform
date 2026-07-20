import type { Dictionaries } from "@asafarim/shared-i18n";

const testoraDictionaries: Dictionaries = {
  en: {
    "showcase.testora.overview.hero.kicker": "Exhibit № 03 · Benchmark",
    "showcase.testora.overview.hero.title":
      "Testora — an observable test-automation benchmark.",
    "showcase.testora.overview.hero.lede":
      "A fixed, offline sample application carries intentional, seeded defects. Testora proves a good suite catches every one of them — deterministically, with complete artifacts — and shows the evidence.",
    "showcase.testora.overview.hero.ctaPrimary": "See the latest run",
    "showcase.testora.overview.hero.ctaSecondary": "Read the case study",
    "showcase.testora.overview.headline.kicker": "Headline",
    "showcase.testora.overview.headline.title": "How the reference run scored",
    "showcase.testora.overview.metrics.detectionRate.label": "Detection rate",
    "showcase.testora.overview.metrics.detectionRate.hint":
      "{{detected}}/{{total}} seeded regressions",
    "showcase.testora.overview.metrics.flakyIdentified.label": "Flaky identified",
    "showcase.testora.overview.metrics.flakyIdentified.hint":
      "fail-then-pass told apart from a regression",
    "showcase.testora.overview.metrics.timeToDiagnosis.label": "Time to diagnosis",
    "showcase.testora.overview.metrics.timeToDiagnosis.hint":
      "mean across failing scenarios",
    "showcase.testora.overview.metrics.artifactCompleteness.label":
      "Artifact completeness",
    "showcase.testora.overview.metrics.artifactCompleteness.hint":
      "trace · screenshot · video",
    "showcase.testora.overview.metrics.ciReproducibility.label":
      "CI reproducibility",
    "showcase.testora.overview.metrics.ciReproducibility.hint":
      "byte-stable across runs",
    "showcase.testora.overview.metrics.passRate.label": "Pass rate",
    "showcase.testora.overview.metrics.passRate.hint":
      "{{passed}}/{{total}} cases green",
    "showcase.testora.overview.dimensions.kicker": "What it measures",
    "showcase.testora.overview.dimensions.title": "Five benchmark dimensions",
    "showcase.testora.overview.dimensions.table.dimension": "Dimension",
    "showcase.testora.overview.dimensions.table.question": "Question",
    "showcase.testora.overview.dimensions.table.measured": "How it's measured",
    "showcase.testora.overview.dimensions.detection.name": "Detection rate",
    "showcase.testora.overview.dimensions.detection.question":
      "Does the suite catch every known seeded regression?",
    "showcase.testora.overview.dimensions.detection.method":
      "Two product defects are seeded into the sample app (un-trimmed email, tax dropped from a total). Detection = share of seeded regressions that end the run failed.",
    "showcase.testora.overview.dimensions.flaky.name": "Flaky-test identification",
    "showcase.testora.overview.dimensions.flaky.question":
      "Can a genuine flake be told apart from a stable regression?",
    "showcase.testora.overview.dimensions.flaky.method":
      "One scenario is engineered to fail-then-pass across a retry. It must be reported as flaky, not as a passing or a hard-failing test.",
    "showcase.testora.overview.dimensions.diagnosis.name":
      "Time to useful diagnosis",
    "showcase.testora.overview.dimensions.diagnosis.question":
      "How quickly does a failure become an actionable message?",
    "showcase.testora.overview.dimensions.diagnosis.method":
      "Mean wall-time across failing scenarios from start to a concise, cause-level diagnostic summary attached to the result.",
    "showcase.testora.overview.dimensions.artifacts.name": "Artifact completeness",
    "showcase.testora.overview.dimensions.artifacts.question":
      "Is every failure backed by trace, screenshot, and video?",
    "showcase.testora.overview.dimensions.artifacts.method":
      "For each non-passing scenario the run must retain a Playwright trace, a screenshot, and a video. Completeness = captured / expected.",
    "showcase.testora.overview.dimensions.reproducibility.name": "CI reproducibility",
    "showcase.testora.overview.dimensions.reproducibility.question":
      "Do the same inputs yield the same outcomes every run?",
    "showcase.testora.overview.dimensions.reproducibility.method":
      "The sample app is offline and stateless; outcomes are a pure function of the URL. Re-running the suite — and regenerating these fixtures — is byte-for-byte stable.",
    "showcase.testora.overview.method.kicker": "Method",
    "showcase.testora.overview.method.title": "Why the numbers are trustworthy",
    "showcase.testora.overview.method.determinism.title": "Determinism",
    "showcase.testora.overview.method.determinism.body":
      "Every screen renders purely from the URL query (?screen=, ?attempt=). Seeded regressions assert behaviour the app deliberately violates, so they fail on every attempt; the flake passes testInfo.retry as its attempt, so it fails first and passes on retry.",
    "showcase.testora.overview.method.provenance.title": "Provenance",
    "showcase.testora.overview.method.provenance.body":
      "These pages render committed fixture JSON distilled from a real Playwright run. The public demo never executes any test code. The runnable harness and CI upload the real traces, screenshots, and videos as the citable source.",
    "showcase.common.yes": "Yes",
    "showcase.common.no": "No",
    "showcase.testora.run.pageHeader.title": "Latest benchmark run",
    "showcase.testora.run.summary.kicker": "At a glance",
    "showcase.testora.run.summary.title": "Run summary",
    "showcase.testora.run.metrics.passed.label": "Passed",
    "showcase.testora.run.metrics.passed.hint": "of {{total}}",
    "showcase.testora.run.metrics.failed.label": "Failed",
    "showcase.testora.run.metrics.failed.hint": "seeded regressions",
    "showcase.testora.run.metrics.flaky.label": "Flaky",
    "showcase.testora.run.metrics.flaky.hint": "fail-then-pass",
    "showcase.testora.run.metrics.detection.label": "Detection",
    "showcase.testora.run.metrics.detection.hint": "of seeded regressions",
    "showcase.testora.run.timeline.kicker": "Sequence",
    "showcase.testora.run.timeline.title": "Run timeline",
    "showcase.testora.run.timeline.panelTitle": "event stream",
    "showcase.testora.run.results.kicker": "Results",
    "showcase.testora.run.results.title": "Every case, every dimension",
    "showcase.testora.run.diagnosis.kicker": "Diagnosis",
    "showcase.testora.run.diagnosis.title": "Failure clusters",
    "showcase.testora.run.evidence.kicker": "Evidence",
    "showcase.testora.run.evidence.title": "Artifact viewer",
    "showcase.testora.run.evidence.panelTitle": "recorded artifacts (read-only)",
    "showcase.testora.resultTable.status": "Status",
    "showcase.testora.resultTable.case": "Case",
    "showcase.testora.resultTable.dimension": "Dimension",
    "showcase.testora.resultTable.duration": "Duration",
    "showcase.testora.resultTable.artifacts": "Artifacts",
    "showcase.testora.resultTable.suite": "Suite",
    "showcase.testora.resultTable.artifact.trace": "trace",
    "showcase.testora.resultTable.artifact.screenshot": "shot",
    "showcase.testora.resultTable.artifact.video": "video",
    "showcase.testora.resultTable.artifact.log": "log",
    "showcase.testora.resultTable.artifact.captured": "{{label}} captured",
    "showcase.testora.resultTable.artifact.notCaptured": "{{label}} not captured",
    "showcase.testora.artifactViewer.caseSelect": "Choose a case",
    "showcase.testora.artifactViewer.tabScreenshot": "Screenshot",
    "showcase.testora.artifactViewer.tabLog": "Log",
    "showcase.testora.artifactViewer.tabTrace": "Trace",
    "showcase.testora.artifactViewer.artifactType": "Artifact type",
    "showcase.testora.artifactViewer.reconstructed":
      "Reconstructed from the seeded state · duration {{duration}}",
    "showcase.testora.artifactViewer.logDiagnosis": "diagnosis",
    "showcase.testora.artifactViewer.stepOk": "ok",
    "showcase.testora.artifactViewer.stepFail": "fail",
    "showcase.testora.status.passed": "Passed",
    "showcase.testora.status.failed": "Failed",
    "showcase.testora.status.flaky": "Flaky",
    "showcase.testora.clusterCard.regression": "Regression",
    "showcase.testora.clusterCard.flaky": "Flaky",
    "showcase.testora.trend.pageHeader.kicker": "History",
    "showcase.testora.trend.pageHeader.title": "Benchmark trend",
    "showcase.testora.trend.pageHeader.description":
      "Detection rate and pass rate across recorded fixture runs. Fixture history — not production telemetry.",
    "showcase.testora.trend.chart.kicker": "Over time",
    "showcase.testora.trend.chart.title": "Detection climbs to 100%",
    "showcase.testora.trend.chart.panelTitle": "detection vs. pass rate",
    "showcase.testora.trend.chart.legend.detection":
      "Detection rate (% of seeded regressions caught)",
    "showcase.testora.trend.chart.legend.passRate":
      "Pass rate (% of all cases green)",
    "showcase.testora.trend.chart.aria":
      "Detection rate and pass rate across fixture runs",
    "showcase.testora.trend.runs.kicker": "Runs",
    "showcase.testora.trend.runs.title": "Recorded fixture runs",
    "showcase.testora.trend.table.run": "Run",
    "showcase.testora.trend.table.ref": "Ref",
    "showcase.testora.trend.table.when": "When",
    "showcase.testora.trend.table.detection": "Detection",
    "showcase.testora.trend.table.passRate": "Pass rate",
    "showcase.testora.trend.table.flakyId": "Flaky ID",
    "showcase.testora.trend.table.duration": "Duration",
    "showcase.testora.caseStudy.pageHeader.kicker": "Case study",
    "showcase.testora.caseStudy.pageHeader.title":
      "From a live test console to a deterministic benchmark",
    "showcase.testora.caseStudy.pageHeader.description":
      "Three iterations of the same idea — the last one is the one you can trust in public.",
    "showcase.testora.caseStudy.evolution.kicker": "Evolution",
    "showcase.testora.caseStudy.evolution.title": "Three iterations",
    "showcase.testora.caseStudy.evolution.table.stage": "Stage",
    "showcase.testora.caseStudy.evolution.table.stack": "Stack",
    "showcase.testora.caseStudy.evolution.table.idea": "Core idea",
    "showcase.testora.caseStudy.evolution.table.limit": "Where it hit a wall",
    "showcase.testora.caseStudy.architecture.kicker": "Architecture",
    "showcase.testora.caseStudy.architecture.title": "How the benchmark is built",
    "showcase.testora.caseStudy.architecture.sut": "System under test",
    "showcase.testora.caseStudy.architecture.groundTruth": "Seeded ground truth",
    "showcase.testora.caseStudy.architecture.execution": "Deterministic execution",
    "showcase.testora.caseStudy.architecture.evidence": "Evidence, distilled",
    "showcase.testora.caseStudy.tradeoffs.kicker": "Tradeoffs",
    "showcase.testora.caseStudy.tradeoffs.title": "What we gave up, and why",
    "showcase.testora.caseStudy.tradeoffs.noLiveRunner": "No live runner in public",
    "showcase.testora.caseStudy.tradeoffs.snapshot":
      "Distilled snapshot over raw logs",
    "showcase.testora.caseStudy.lessons.kicker": "Lessons",
    "showcase.testora.caseStudy.lessons.title": "Lessons from the legacy system",
    "showcase.testora.caseStudy.lessons.reproducibility":
      "Reproducibility beats realism",
    "showcase.testora.caseStudy.lessons.detection": "Detection is the real metric",
    "showcase.testora.caseStudy.lessons.citation": "Claims need a citation",
  },
  nl: {
    "showcase.testora.overview.hero.kicker": "Exhibit № 03 · Benchmark",
    "showcase.testora.overview.hero.title":
      "Testora — een observeerbare test-automatisering benchmark.",
    "showcase.testora.overview.hero.lede":
      "Een vaste, offline sample app bevat opzettelijke, gezaaide defects. Testora bewijst dat een goede suite ze allemaal vangt — deterministisch, met complete artifacts — en toont het bewijs.",
    "showcase.testora.overview.hero.ctaPrimary": "Zie de laatste run",
    "showcase.testora.overview.hero.ctaSecondary": "Lees de case study",
    "showcase.testora.overview.headline.kicker": "Headline",
    "showcase.testora.overview.headline.title": "Hoe de referentierun scoorde",
    "showcase.testora.overview.metrics.detectionRate.label": "Detectiepercentage",
    "showcase.testora.overview.metrics.detectionRate.hint":
      "{{detected}}/{{total}} gezaaide regressies",
    "showcase.testora.overview.metrics.flakyIdentified.label": "Flaky herkend",
    "showcase.testora.overview.metrics.flakyIdentified.hint":
      "fail-then-pass onderscheiden van een regressie",
    "showcase.testora.overview.metrics.timeToDiagnosis.label": "Tijd tot diagnose",
    "showcase.testora.overview.metrics.timeToDiagnosis.hint":
      "gemiddelde over falende scenario's",
    "showcase.testora.overview.metrics.artifactCompleteness.label":
      "Artifact-compleetheid",
    "showcase.testora.overview.metrics.artifactCompleteness.hint":
      "trace · screenshot · video",
    "showcase.testora.overview.metrics.ciReproducibility.label":
      "CI-reproduceerbaarheid",
    "showcase.testora.overview.metrics.ciReproducibility.hint":
      "byte-stabiel over runs",
    "showcase.testora.overview.metrics.passRate.label": "Slagingspercentage",
    "showcase.testora.overview.metrics.passRate.hint":
      "{{passed}}/{{total}} cases groen",
    "showcase.testora.overview.dimensions.kicker": "Wat het meet",
    "showcase.testora.overview.dimensions.title": "Vijf benchmark-dimensies",
    "showcase.testora.overview.dimensions.table.dimension": "Dimensie",
    "showcase.testora.overview.dimensions.table.question": "Vraag",
    "showcase.testora.overview.dimensions.table.measured": "Hoe het wordt gemeten",
    "showcase.testora.overview.dimensions.detection.name": "Detectiepercentage",
    "showcase.testora.overview.dimensions.detection.question":
      "Vangt de suite elke bekende gezaaide regressie?",
    "showcase.testora.overview.dimensions.detection.method":
      "Twee productdefecten worden in de sample app gezaaid (niet-afgeknipte e-mail, belasting verwijderd uit totaal). Detectie = aandeel gezaaide regressies dat aan het einde van de run faalt.",
    "showcase.testora.overview.dimensions.flaky.name": "Flaky-testidentificatie",
    "showcase.testora.overview.dimensions.flaky.question":
      "Kan een echte flake worden onderscheiden van een stabiele regressie?",
    "showcase.testora.overview.dimensions.flaky.method":
      "Een scenario is ontworpen om fail-then-pass over een retry te vertonen. Het moet worden gerapporteerd als flaky, niet als slagend of hard-falend.",
    "showcase.testora.overview.dimensions.diagnosis.name":
      "Tijd tot bruikbare diagnose",
    "showcase.testora.overview.dimensions.diagnosis.question":
      "Hoe snel wordt een falen een actionable boodschap?",
    "showcase.testora.overview.dimensions.diagnosis.method":
      "Gemiddelde wall-time over falende scenario's van start tot een beknopte, oorzaak-niveau diagnostische samenvatting aan het resultaat.",
    "showcase.testora.overview.dimensions.artifacts.name": "Artifact-compleetheid",
    "showcase.testora.overview.dimensions.artifacts.question":
      "Wordt elk falen ondersteund door trace, screenshot en video?",
    "showcase.testora.overview.dimensions.artifacts.method":
      "Voor elk niet-slagend scenario moet de run een Playwright-trace, screenshot en video behouden. Compleetheid = vastgelegd / verwacht.",
    "showcase.testora.overview.dimensions.reproducibility.name": "CI-reproduceerbaarheid",
    "showcase.testora.overview.dimensions.reproducibility.question":
      "Leveren dezelfde inputs elke run dezelfde uitkomsten?",
    "showcase.testora.overview.dimensions.reproducibility.method":
      "De sample app is offline en stateless; uitkomsten zijn een pure functie van de URL. Het opnieuw uitvoeren van de suite — en regenereren van deze fixtures — is byte-voor-byte stabiel.",
    "showcase.testora.overview.method.kicker": "Methode",
    "showcase.testora.overview.method.title": "Waarom de cijfers betrouwbaar zijn",
    "showcase.testora.overview.method.determinism.title": "Determinisme",
    "showcase.testora.overview.method.determinism.body":
      "Elk scherm rendert puur vanuit de URL query (?screen=, ?attempt=). Gezaaide regressies asserten gedrag dat de app expres schendt, dus falen ze bij elke poging; de flake passeert testInfo.retry als poging, dus faalt eerst en slaagt bij retry.",
    "showcase.testora.overview.method.provenance.title": "Herkomst",
    "showcase.testora.overview.method.provenance.body":
      "Deze pagina's renderen committed fixture JSON, gedistilleerd uit een echte Playwright-run. De publieke demo voert nooit testcode uit. De runnable harness en CI uploaden de echte traces, screenshots en video's als citable bron.",
    "showcase.common.yes": "Ja",
    "showcase.common.no": "Nee",
    "showcase.testora.run.pageHeader.title": "Laatste benchmark-run",
    "showcase.testora.run.summary.kicker": "In een oogopslag",
    "showcase.testora.run.summary.title": "Run-samenvatting",
    "showcase.testora.run.metrics.passed.label": "Geslaagd",
    "showcase.testora.run.metrics.passed.hint": "van {{total}}",
    "showcase.testora.run.metrics.failed.label": "Gefaald",
    "showcase.testora.run.metrics.failed.hint": "gezaaide regressies",
    "showcase.testora.run.metrics.flaky.label": "Flaky",
    "showcase.testora.run.metrics.flaky.hint": "fail-then-pass",
    "showcase.testora.run.metrics.detection.label": "Detectie",
    "showcase.testora.run.metrics.detection.hint": "van gezaaide regressies",
    "showcase.testora.run.timeline.kicker": "Volgorde",
    "showcase.testora.run.timeline.title": "Run-timeline",
    "showcase.testora.run.timeline.panelTitle": "event stream",
    "showcase.testora.run.results.kicker": "Resultaten",
    "showcase.testora.run.results.title": "Elke case, elke dimensie",
    "showcase.testora.run.diagnosis.kicker": "Diagnose",
    "showcase.testora.run.diagnosis.title": "Faal-clusters",
    "showcase.testora.run.evidence.kicker": "Bewijs",
    "showcase.testora.run.evidence.title": "Artifact-viewer",
    "showcase.testora.run.evidence.panelTitle": "opgenomen artifacts (read-only)",
    "showcase.testora.resultTable.status": "Status",
    "showcase.testora.resultTable.case": "Case",
    "showcase.testora.resultTable.dimension": "Dimensie",
    "showcase.testora.resultTable.duration": "Duur",
    "showcase.testora.resultTable.artifacts": "Artifacts",
    "showcase.testora.resultTable.suite": "Suite",
    "showcase.testora.resultTable.artifact.trace": "trace",
    "showcase.testora.resultTable.artifact.screenshot": "shot",
    "showcase.testora.resultTable.artifact.video": "video",
    "showcase.testora.resultTable.artifact.log": "log",
    "showcase.testora.resultTable.artifact.captured": "{{label}} opgenomen",
    "showcase.testora.resultTable.artifact.notCaptured": "{{label}} niet opgenomen",
    "showcase.testora.artifactViewer.caseSelect": "Kies een case",
    "showcase.testora.artifactViewer.tabScreenshot": "Screenshot",
    "showcase.testora.artifactViewer.tabLog": "Log",
    "showcase.testora.artifactViewer.tabTrace": "Trace",
    "showcase.testora.artifactViewer.artifactType": "Artifact-type",
    "showcase.testora.artifactViewer.reconstructed":
      "Gereconstrueerd vanuit de gezaaide state · duur {{duration}}",
    "showcase.testora.artifactViewer.logDiagnosis": "diagnose",
    "showcase.testora.artifactViewer.stepOk": "ok",
    "showcase.testora.artifactViewer.stepFail": "fail",
    "showcase.testora.artifactViewer.screenshot.login": "Login-scherm bij falen",
    "showcase.testora.artifactViewer.screenshot.checkout": "Checkout-scherm bij falen",
    "showcase.testora.artifactViewer.screenshot.dashboard": "Dashboard-scherm bij falen (poging 0)",
    "showcase.testora.status.passed": "Geslaagd",
    "showcase.testora.status.failed": "Gefaald",
    "showcase.testora.status.flaky": "Flaky",
    "showcase.testora.clusterCard.regression": "Regression",
    "showcase.testora.clusterCard.flaky": "Flaky",
    "showcase.testora.trend.pageHeader.kicker": "Geschiedenis",
    "showcase.testora.trend.pageHeader.title": "Benchmark-trend",
    "showcase.testora.trend.pageHeader.description":
      "Detectiepercentage en slagingspercentage over opgenomen fixture-runs. Fixture-geschiedenis — geen productietelemetry.",
    "showcase.testora.trend.chart.kicker": "In de loop der tijd",
    "showcase.testora.trend.chart.title": "Detectie stijgt naar 100%",
    "showcase.testora.trend.chart.panelTitle": "detectie vs. slagingspercentage",
    "showcase.testora.trend.chart.legend.detection":
      "Detectiepercentage (% gezaaide regressies gevangen)",
    "showcase.testora.trend.chart.legend.passRate":
      "Slagingspercentage (% van alle cases groen)",
    "showcase.testora.trend.chart.aria":
      "Detectiepercentage en slagingspercentage over fixture-runs",
    "showcase.testora.trend.runs.kicker": "Runs",
    "showcase.testora.trend.runs.title": "Opgenomen fixture-runs",
    "showcase.testora.trend.table.run": "Run",
    "showcase.testora.trend.table.ref": "Ref",
    "showcase.testora.trend.table.when": "Wanneer",
    "showcase.testora.trend.table.detection": "Detectie",
    "showcase.testora.trend.table.passRate": "Slagingspercentage",
    "showcase.testora.trend.table.flakyId": "Flaky-ID",
    "showcase.testora.trend.table.duration": "Duur",
    "showcase.testora.caseStudy.pageHeader.kicker": "Case study",
    "showcase.testora.caseStudy.pageHeader.title":
      "Van een live test-console naar een deterministische benchmark",
    "showcase.testora.caseStudy.pageHeader.description":
      "Drie iteraties van hetzelfde idee — de laatste is degene die je publiek kunt vertrouwen.",
    "showcase.testora.caseStudy.evolution.kicker": "Evolutie",
    "showcase.testora.caseStudy.evolution.title": "Drie iteraties",
    "showcase.testora.caseStudy.evolution.table.stage": "Stage",
    "showcase.testora.caseStudy.evolution.table.stack": "Stack",
    "showcase.testora.caseStudy.evolution.table.idea": "Kernidee",
    "showcase.testora.caseStudy.evolution.table.limit": "Waar het vastliep",
    "showcase.testora.caseStudy.architecture.kicker": "Architectuur",
    "showcase.testora.caseStudy.architecture.title": "Hoe de benchmark is gebouwd",
    "showcase.testora.caseStudy.architecture.sut": "System under test",
    "showcase.testora.caseStudy.architecture.groundTruth": "Seeded ground truth",
    "showcase.testora.caseStudy.architecture.execution": "Deterministische uitvoering",
    "showcase.testora.caseStudy.architecture.evidence": "Bewijs, gedistilleerd",
    "showcase.testora.caseStudy.tradeoffs.kicker": "Tradeoffs",
    "showcase.testora.caseStudy.tradeoffs.title": "Wat we opgaven, en waarom",
    "showcase.testora.caseStudy.tradeoffs.noLiveRunner": "Geen live runner in het publiek",
    "showcase.testora.caseStudy.tradeoffs.snapshot":
      "Gedistilleerde snapshot boven ruwe logs",
    "showcase.testora.caseStudy.lessons.kicker": "Lessen",
    "showcase.testora.caseStudy.lessons.title": "Lessen van het legacy-systeem",
    "showcase.testora.caseStudy.lessons.reproducibility":
      "Reproduceerbaarheid wint van realisme",
    "showcase.testora.caseStudy.lessons.detection":
      "Detectie is de echte metric",
    "showcase.testora.caseStudy.lessons.citation":
      "Claims hebben een citation nodig",
  },
  fr: {
    "showcase.testora.overview.hero.kicker": "Exhibit № 03 · Benchmark",
    "showcase.testora.overview.hero.title":
      "Testora — un benchmark observable d'automatisation de tests.",
    "showcase.testora.overview.hero.lede":
      "Une application sample fixe et offline porte des defects semés intentionnels. Testora prouve qu'une bonne suite les attrape tous — de manière déterministe, avec des artifacts complets — et montre les preuves.",
    "showcase.testora.overview.hero.ctaPrimary": "Voir le dernier run",
    "showcase.testora.overview.hero.ctaSecondary": "Lire l'étude de cas",
    "showcase.testora.overview.headline.kicker": "Headline",
    "showcase.testora.overview.headline.title": "Comment le run de référence a noté",
    "showcase.testora.overview.metrics.detectionRate.label": "Taux de détection",
    "showcase.testora.overview.metrics.detectionRate.hint":
      "{{detected}}/{{total}} régressions semées",
    "showcase.testora.overview.metrics.flakyIdentified.label": "Flaky identifié",
    "showcase.testora.overview.metrics.flakyIdentified.hint":
      "fail-then-pass distingué d'une régression",
    "showcase.testora.overview.metrics.timeToDiagnosis.label": "Temps de diagnostic",
    "showcase.testora.overview.metrics.timeToDiagnosis.hint":
      "moyenne sur les scénarios échoués",
    "showcase.testora.overview.metrics.artifactCompleteness.label":
      "Complétude des artifacts",
    "showcase.testora.overview.metrics.artifactCompleteness.hint":
      "trace · screenshot · vidéo",
    "showcase.testora.overview.metrics.ciReproducibility.label":
      "Reproductibilité CI",
    "showcase.testora.overview.metrics.ciReproducibility.hint":
      "byte-stable entre les runs",
    "showcase.testora.overview.metrics.passRate.label": "Taux de réussite",
    "showcase.testora.overview.metrics.passRate.hint":
      "{{passed}}/{{total}} cas verts",
    "showcase.testora.overview.dimensions.kicker": "Ce que ça mesure",
    "showcase.testora.overview.dimensions.title": "Cinq dimensions de benchmark",
    "showcase.testora.overview.dimensions.table.dimension": "Dimension",
    "showcase.testora.overview.dimensions.table.question": "Question",
    "showcase.testora.overview.dimensions.table.measured": "Comment c'est mesuré",
    "showcase.testora.overview.dimensions.detection.name": "Taux de détection",
    "showcase.testora.overview.dimensions.detection.question":
      "La suite attrape-t-elle chaque régression semée connue ?",
    "showcase.testora.overview.dimensions.detection.method":
      "Deux defects produit sont semés dans la sample app (e-mail non rogné, taxe retirée d'un total). Détection = part des régressions semées qui terminent le run en échec.",
    "showcase.testora.overview.dimensions.flaky.name": "Identification de flaky",
    "showcase.testora.overview.dimensions.flaky.question":
      "Un vrai flaky peut-il être distingué d'une régression stable ?",
    "showcase.testora.overview.dimensions.flaky.method":
      "Un scénario est conçu pour échouer-puis-réussir lors d'un retry. Il doit être rapporté comme flaky, ni comme réussi ni comme échec dur.",
    "showcase.testora.overview.dimensions.diagnosis.name":
      "Temps jusqu'au diagnostic utile",
    "showcase.testora.overview.dimensions.diagnosis.question":
      "Un échec devient-il rapidement un message actionnable ?",
    "showcase.testora.overview.dimensions.diagnosis.method":
      "Temps moyen de wall-time sur les scénarios échoués, du départ à un résumé diagnostique concis au niveau de la cause, attaché au résultat.",
    "showcase.testora.overview.dimensions.artifacts.name": "Complétude des artifacts",
    "showcase.testora.overview.dimensions.artifacts.question":
      "Chaque échec est-il accompagné de trace, screenshot et vidéo ?",
    "showcase.testora.overview.dimensions.artifacts.method":
      "Pour chaque scénario non réussi, le run doit conserver une trace Playwright, un screenshot et une vidéo. Complétude = capturé / attendu.",
    "showcase.testora.overview.dimensions.reproducibility.name": "Reproductibilité CI",
    "showcase.testora.overview.dimensions.reproducibility.question":
      "Les mêmes inputs produisent-ils les mêmes résultats à chaque run ?",
    "showcase.testora.overview.dimensions.reproducibility.method":
      "La sample app est offline et stateless ; les résultats sont une pure fonction de l'URL. Relancer la suite — et regénérer ces fixtures — est byte-for-byte stable.",
    "showcase.testora.overview.method.kicker": "Méthode",
    "showcase.testora.overview.method.title": "Pourquoi les chiffres sont fiables",
    "showcase.testora.overview.method.determinism.title": "Déterminisme",
    "showcase.testora.overview.method.determinism.body":
      "Chaque écran rend purement à partir de la query URL (?screen=, ?attempt=). Les régressions semées assertent un comportement que l'app viole délibérément, donc elles échouent à chaque tentative ; le flaky passe testInfo.retry comme tentative, donc il échoue d'abord et réussit au retry.",
    "showcase.testora.overview.method.provenance.title": "Provenance",
    "showcase.testora.overview.method.provenance.body":
      "Ces pages rendent du fixture JSON committed, distillé d'un vrai run Playwright. La démo publique n'exécute jamais de code de test. Le runnable harness et le CI uploadent les vraies traces, screenshots et vidéos comme source citable.",
    "showcase.common.yes": "Oui",
    "showcase.common.no": "Non",
    "showcase.testora.run.pageHeader.title": "Dernier run du benchmark",
    "showcase.testora.run.summary.kicker": "En un coup d'œil",
    "showcase.testora.run.summary.title": "Résumé du run",
    "showcase.testora.run.metrics.passed.label": "Réussi",
    "showcase.testora.run.metrics.passed.hint": "sur {{total}}",
    "showcase.testora.run.metrics.failed.label": "Échoué",
    "showcase.testora.run.metrics.failed.hint": "régressions semées",
    "showcase.testora.run.metrics.flaky.label": "Flaky",
    "showcase.testora.run.metrics.flaky.hint": "fail-then-pass",
    "showcase.testora.run.metrics.detection.label": "Détection",
    "showcase.testora.run.metrics.detection.hint": "des régressions semées",
    "showcase.testora.run.timeline.kicker": "Séquence",
    "showcase.testora.run.timeline.title": "Timeline du run",
    "showcase.testora.run.timeline.panelTitle": "event stream",
    "showcase.testora.run.results.kicker": "Résultats",
    "showcase.testora.run.results.title": "Chaque case, chaque dimension",
    "showcase.testora.run.diagnosis.kicker": "Diagnostic",
    "showcase.testora.run.diagnosis.title": "Clusters d'échec",
    "showcase.testora.run.evidence.kicker": "Preuve",
    "showcase.testora.run.evidence.title": "Visionneuse d'artifacts",
    "showcase.testora.run.evidence.panelTitle": "artifacts enregistrés (read-only)",
    "showcase.testora.resultTable.status": "Statut",
    "showcase.testora.resultTable.case": "Case",
    "showcase.testora.resultTable.dimension": "Dimension",
    "showcase.testora.resultTable.duration": "Durée",
    "showcase.testora.resultTable.artifacts": "Artifacts",
    "showcase.testora.resultTable.suite": "Suite",
    "showcase.testora.resultTable.artifact.trace": "trace",
    "showcase.testora.resultTable.artifact.screenshot": "shot",
    "showcase.testora.resultTable.artifact.video": "video",
    "showcase.testora.resultTable.artifact.log": "log",
    "showcase.testora.resultTable.artifact.captured": "{{label}} capturé",
    "showcase.testora.resultTable.artifact.notCaptured": "{{label}} non capturé",
    "showcase.testora.artifactViewer.caseSelect": "Choisir une case",
    "showcase.testora.artifactViewer.tabScreenshot": "Screenshot",
    "showcase.testora.artifactViewer.tabLog": "Log",
    "showcase.testora.artifactViewer.tabTrace": "Trace",
    "showcase.testora.artifactViewer.artifactType": "Type d'artifact",
    "showcase.testora.artifactViewer.reconstructed":
      "Reconstruit depuis l'état semé · durée {{duration}}",
    "showcase.testora.artifactViewer.logDiagnosis": "diagnostic",
    "showcase.testora.artifactViewer.stepOk": "ok",
    "showcase.testora.artifactViewer.stepFail": "fail",
    "showcase.testora.status.passed": "Réussi",
    "showcase.testora.status.failed": "Échoué",
    "showcase.testora.status.flaky": "Flaky",
    "showcase.testora.clusterCard.regression": "Regression",
    "showcase.testora.clusterCard.flaky": "Flaky",
    "showcase.testora.trend.pageHeader.kicker": "Historique",
    "showcase.testora.trend.pageHeader.title": "Tendance du benchmark",
    "showcase.testora.trend.pageHeader.description":
      "Taux de détection et taux de réussite sur les fixture-runs enregistrés. Historique des fixtures — pas de télémétrie de production.",
    "showcase.testora.trend.chart.kicker": "Dans le temps",
    "showcase.testora.trend.chart.title": "La détection grimpe à 100%",
    "showcase.testora.trend.chart.panelTitle": "détection vs. taux de réussite",
    "showcase.testora.trend.chart.legend.detection":
      "Taux de détection (% des régressions semées capturées)",
    "showcase.testora.trend.chart.legend.passRate":
      "Taux de réussite (% de tous les cases verts)",
    "showcase.testora.trend.chart.aria":
      "Taux de détection et taux de réussite sur les fixture-runs",
    "showcase.testora.trend.runs.kicker": "Runs",
    "showcase.testora.trend.runs.title": "Fixture-runs enregistrés",
    "showcase.testora.trend.table.run": "Run",
    "showcase.testora.trend.table.ref": "Ref",
    "showcase.testora.trend.table.when": "Quand",
    "showcase.testora.trend.table.detection": "Détection",
    "showcase.testora.trend.table.passRate": "Taux de réussite",
    "showcase.testora.trend.table.flakyId": "ID Flaky",
    "showcase.testora.trend.table.duration": "Durée",
    "showcase.testora.caseStudy.pageHeader.kicker": "Étude de cas",
    "showcase.testora.caseStudy.pageHeader.title":
      "D'une console de test live à un benchmark déterministe",
    "showcase.testora.caseStudy.pageHeader.description":
      "Trois itérations de la même idée — la dernière est celle que l'on peut faire confiance publiquement.",
    "showcase.testora.caseStudy.evolution.kicker": "Évolution",
    "showcase.testora.caseStudy.evolution.title": "Trois itérations",
    "showcase.testora.caseStudy.evolution.table.stage": "Étape",
    "showcase.testora.caseStudy.evolution.table.stack": "Stack",
    "showcase.testora.caseStudy.evolution.table.idea": "Idée centrale",
    "showcase.testora.caseStudy.evolution.table.limit": "Où ça a buté",
    "showcase.testora.caseStudy.architecture.kicker": "Architecture",
    "showcase.testora.caseStudy.architecture.title": "Comment le benchmark est construit",
    "showcase.testora.caseStudy.architecture.sut": "Système testé",
    "showcase.testora.caseStudy.architecture.groundTruth": "Ground truth semé",
    "showcase.testora.caseStudy.architecture.execution": "Exécution déterministe",
    "showcase.testora.caseStudy.architecture.evidence": "Preuves, distillées",
    "showcase.testora.caseStudy.tradeoffs.kicker": "Compromis",
    "showcase.testora.caseStudy.tradeoffs.title": "Ce que l'on a sacrifié, et pourquoi",
    "showcase.testora.caseStudy.tradeoffs.noLiveRunner": "Pas de runner live en public",
    "showcase.testora.caseStudy.tradeoffs.snapshot":
      "Snapshot distillé plutôt que logs bruts",
    "showcase.testora.caseStudy.lessons.kicker": "Leçons",
    "showcase.testora.caseStudy.lessons.title": "Leçons du système legacy",
    "showcase.testora.caseStudy.lessons.reproducibility":
      "La reproductibilité bat le réalisme",
    "showcase.testora.caseStudy.lessons.detection":
      "La détection est la vraie métrique",
    "showcase.testora.caseStudy.lessons.citation":
      "Les revendications ont besoin d'une citation",
  },
  de: {
    "showcase.testora.overview.hero.kicker": "Exhibit № 03 · Benchmark",
    "showcase.testora.overview.hero.title":
      "Testora — ein beobachtbarer Test-Automatisierungs-Benchmark.",
    "showcase.testora.overview.hero.lede":
      "Eine feste, offline Sample-App trägt absichtliche, gesäte Defects. Testora beweist, dass eine gute Suite sie alle fängt — deterministisch, mit kompletten Artifacts — und zeigt die Beweise.",
    "showcase.testora.overview.hero.ctaPrimary": "Den letzten Lauf sehen",
    "showcase.testora.overview.hero.ctaSecondary": "Fallstudie lesen",
    "showcase.testora.overview.headline.kicker": "Method",
    "showcase.testora.overview.headline.title": "Wie der Referenzlauf bewertet wurde",
    "showcase.testora.overview.metrics.detectionRate.label": "Erkennungsrate",
    "showcase.testora.overview.metrics.detectionRate.hint":
      "{{detected}}/{{total}} gesäte Regressionen",
    "showcase.testora.overview.metrics.flakyIdentified.label": "Flaky erkannt",
    "showcase.testora.overview.metrics.flakyIdentified.hint":
      "fail-then-pass von einer Regression unterschieden",
    "showcase.testora.overview.metrics.timeToDiagnosis.label": "Zeit bis zur Diagnose",
    "showcase.testora.overview.metrics.timeToDiagnosis.hint":
      "Durchschnitt über fehlschlagende Szenarien",
    "showcase.testora.overview.metrics.artifactCompleteness.label":
      "Artifact-Vollständigkeit",
    "showcase.testora.overview.metrics.artifactCompleteness.hint":
      "trace · screenshot · video",
    "showcase.testora.overview.metrics.ciReproducibility.label":
      "CI-Reproduzierbarkeit",
    "showcase.testora.overview.metrics.ciReproducibility.hint":
      "byte-stabil über Runs",
    "showcase.testora.overview.metrics.passRate.label": "Erfolgsrate",
    "showcase.testora.overview.metrics.passRate.hint":
      "{{passed}}/{{total}} Cases grün",
    "showcase.testora.overview.dimensions.kicker": "Was es misst",
    "showcase.testora.overview.dimensions.title": "Fünf Benchmark-Dimensionen",
    "showcase.testora.overview.dimensions.table.dimension": "Dimension",
    "showcase.testora.overview.dimensions.table.question": "Frage",
    "showcase.testora.overview.dimensions.table.measured": "Wie es gemessen wird",
    "showcase.testora.overview.dimensions.detection.name": "Erkennungsrate",
    "showcase.testora.overview.dimensions.detection.question":
      "Fängt die Suite jede bekannte gesäte Regression?",
    "showcase.testora.overview.dimensions.detection.method":
      "Zwei Produktdefects werden in die Sample-App gesät (nicht getrimmte E-Mail, Steuer aus Summe entfernt). Erkennung = Anteil gesäter Regressionen, die den Run als fehlgeschlagen beenden.",
    "showcase.testora.overview.dimensions.flaky.name": "Flaky-Test-Erkennung",
    "showcase.testora.overview.dimensions.flaky.question":
      "Kann ein echter Flaky von einer stabilen Regression unterschieden werden?",
    "showcase.testora.overview.dimensions.flaky.method":
      "Ein Szenario ist so konstruiert, dass es fail-then-pass über einen Retry zeigt. Es muss als flaky, nicht als bestanden oder hart-failend, gemeldet werden.",
    "showcase.testora.overview.dimensions.diagnosis.name":
      "Zeit bis zur nutzbaren Diagnose",
    "showcase.testora.overview.dimensions.diagnosis.question":
      "Wie schnell wird ein Fehler zu einer handlungsorientierten Nachricht?",
    "showcase.testora.overview.dimensions.diagnosis.method":
      "Mittlere Wall-Time über fehlschlagende Szenarien vom Start bis zu einer knappen, ursachenbezogenen Diagnosezusammenfassung, die am Ergebnis angehängt wird.",
    "showcase.testora.overview.dimensions.artifacts.name": "Artifact-Vollständigkeit",
    "showcase.testora.overview.dimensions.artifacts.question":
      "Ist jedes Versagen durch Trace, Screenshot und Video gesichert?",
    "showcase.testora.overview.dimensions.artifacts.method":
      "Für jedes nicht bestehende Szenario muss der Run eine Playwright-Trace, einen Screenshot und ein Video beibehalten. Vollständigkeit = erfasst / erwartet.",
    "showcase.testora.overview.dimensions.reproducibility.name": "CI-Reproduzierbarkeit",
    "showcase.testora.overview.dimensions.reproducibility.question":
      "Ergeben dieselben Inputs bei jedem Run dieselben Ergebnisse?",
    "showcase.testora.overview.dimensions.reproducibility.method":
      "Die Sample-App ist offline und zustandslos; Ergebnisse sind eine reine Funktion der URL. Das Neu-Ausführen der Suite — und Regenerieren dieser Fixtures — ist byte-für-byte stabil.",
    "showcase.testora.overview.method.kicker": "Methode",
    "showcase.testora.overview.method.title": "Warum die Zahlen vertrauenswürdig sind",
    "showcase.testora.overview.method.determinism.title": "Determinismus",
    "showcase.testora.overview.method.determinism.body":
      "Jeder Screen rendert rein aus der URL-Query (?screen=, ?attempt=). Gesäte Regressionen asserten ein Verhalten, das die App absichtlich verletzt, also scheitern sie bei jedem Versuch; der Flaky übergibt testInfo.retry als Versuch, scheitert also zuerst und besteht beim Retry.",
    "showcase.testora.overview.method.provenance.title": "Herkunft",
    "showcase.testora.overview.method.provenance.body":
      "Diese Seiten rendern committed Fixture-JSON, destilliert aus einem echten Playwright-Lauf. Die öffentliche Demo führt niemals Testcode aus. Der runnable harness und CI laden die echten Traces, Screenshots und Videos als citable Quelle hoch.",
    "showcase.common.yes": "Ja",
    "showcase.common.no": "Nein",
    "showcase.testora.run.pageHeader.title": "Letzter Benchmark-Lauf",
    "showcase.testora.run.summary.kicker": "Auf einen Blick",
    "showcase.testora.run.summary.title": "Run-Zusammenfassung",
    "showcase.testora.run.metrics.passed.label": "Bestanden",
    "showcase.testora.run.metrics.passed.hint": "von {{total}}",
    "showcase.testora.run.metrics.failed.label": "Fehlgeschlagen",
    "showcase.testora.run.metrics.failed.hint": "gesäte Regressionen",
    "showcase.testora.run.metrics.flaky.label": "Flaky",
    "showcase.testora.run.metrics.flaky.hint": "fail-then-pass",
    "showcase.testora.run.metrics.detection.label": "Erkennung",
    "showcase.testora.run.metrics.detection.hint": "von gesäten Regressionen",
    "showcase.testora.run.timeline.kicker": "Sequenz",
    "showcase.testora.run.timeline.title": "Run-Zeitstrahl",
    "showcase.testora.run.timeline.panelTitle": "event stream",
    "showcase.testora.run.results.kicker": "Ergebnisse",
    "showcase.testora.run.results.title": "Jeder Case, jede Dimension",
    "showcase.testora.run.diagnosis.kicker": "Diagnose",
    "showcase.testora.run.diagnosis.title": "Fehler-Cluster",
    "showcase.testora.run.evidence.kicker": "Beweis",
    "showcase.testora.run.evidence.title": "Artifact-Viewer",
    "showcase.testora.run.evidence.panelTitle": "aufgenommene artifacts (read-only)",
    "showcase.testora.resultTable.status": "Status",
    "showcase.testora.resultTable.case": "Case",
    "showcase.testora.resultTable.dimension": "Dimension",
    "showcase.testora.resultTable.duration": "Dauer",
    "showcase.testora.resultTable.artifacts": "Artifacts",
    "showcase.testora.resultTable.suite": "Suite",
    "showcase.testora.resultTable.artifact.trace": "trace",
    "showcase.testora.resultTable.artifact.screenshot": "shot",
    "showcase.testora.resultTable.artifact.video": "video",
    "showcase.testora.resultTable.artifact.log": "log",
    "showcase.testora.resultTable.artifact.captured": "{{label}} aufgenommen",
    "showcase.testora.resultTable.artifact.notCaptured": "{{label}} nicht aufgenommen",
    "showcase.testora.artifactViewer.caseSelect": "Case auswählen",
    "showcase.testora.artifactViewer.tabScreenshot": "Screenshot",
    "showcase.testora.artifactViewer.tabLog": "Log",
    "showcase.testora.artifactViewer.tabTrace": "Trace",
    "showcase.testora.artifactViewer.artifactType": "Artifact-Typ",
    "showcase.testora.artifactViewer.reconstructed":
      "Rekonstruiert aus dem gesäten Zustand · Dauer {{duration}}",
    "showcase.testora.artifactViewer.logDiagnosis": "Diagnose",
    "showcase.testora.artifactViewer.stepOk": "ok",
    "showcase.testora.artifactViewer.stepFail": "fail",
    "showcase.testora.artifactViewer.screenshot.login": "Login-Bildschirm beim Fehler",
    "showcase.testora.artifactViewer.screenshot.checkout": "Checkout-Bildschirm beim Fehler",
    "showcase.testora.artifactViewer.screenshot.dashboard": "Dashboard-Bildschirm beim Fehler (Versuch 0)",
    "showcase.testora.status.passed": "Bestanden",
    "showcase.testora.status.failed": "Fehlgeschlagen",
    "showcase.testora.status.flaky": "Flaky",
    "showcase.testora.clusterCard.regression": "Regression",
    "showcase.testora.clusterCard.flaky": "Flaky",
    "showcase.testora.trend.pageHeader.kicker": "Verlauf",
    "showcase.testora.trend.pageHeader.title": "Benchmark-Trend",
    "showcase.testora.trend.pageHeader.description":
      "Erkennungsrate und Erfolgsrate über aufgezeichnete Fixture-Runs. Fixture-Verlauf — keine Produktionstelemetrie.",
    "showcase.testora.trend.chart.kicker": "Im Laufe der Zeit",
    "showcase.testora.trend.chart.title": "Erkennung steigt auf 100%",
    "showcase.testora.trend.chart.panelTitle": "erkennung vs. erfolgsrate",
    "showcase.testora.trend.chart.legend.detection":
      "Erkennungsrate (% der gesäten Regressionen erfasst)",
    "showcase.testora.trend.chart.legend.passRate":
      "Erfolgsrate (% aller Cases grün)",
    "showcase.testora.trend.chart.aria":
      "Erkennungsrate und Erfolgsrate über Fixture-Runs",
    "showcase.testora.trend.runs.kicker": "Runs",
    "showcase.testora.trend.runs.title": "Aufgezeichnete Fixture-Runs",
    "showcase.testora.trend.table.run": "Run",
    "showcase.testora.trend.table.ref": "Ref",
    "showcase.testora.trend.table.when": "Wann",
    "showcase.testora.trend.table.detection": "Erkennung",
    "showcase.testora.trend.table.passRate": "Erfolgsrate",
    "showcase.testora.trend.table.flakyId": "Flaky-ID",
    "showcase.testora.trend.table.duration": "Dauer",
    "showcase.testora.caseStudy.pageHeader.kicker": "Fallstudie",
    "showcase.testora.caseStudy.pageHeader.title":
      "Von einer Live-Test-Konsole zu einem deterministischen Benchmark",
    "showcase.testora.caseStudy.pageHeader.description":
      "Drei Iterationen derselben Idee — die letzte ist die, der man öffentlich vertrauen kann.",
    "showcase.testora.caseStudy.evolution.kicker": "Evolution",
    "showcase.testora.caseStudy.evolution.title": "Drei Iterationen",
    "showcase.testora.caseStudy.evolution.table.stage": "Stufe",
    "showcase.testora.caseStudy.evolution.table.stack": "Stack",
    "showcase.testora.caseStudy.evolution.table.idea": "Kernidee",
    "showcase.testora.caseStudy.evolution.table.limit": "Wo es scheiterte",
    "showcase.testora.caseStudy.architecture.kicker": "Architektur",
    "showcase.testora.caseStudy.architecture.title": "Wie der Benchmark aufgebaut ist",
    "showcase.testora.caseStudy.architecture.sut": "System under test",
    "showcase.testora.caseStudy.architecture.groundTruth": "Seeded ground truth",
    "showcase.testora.caseStudy.architecture.execution": "Deterministische Ausführung",
    "showcase.testora.caseStudy.architecture.evidence": "Beweise, destilliert",
    "showcase.testora.caseStudy.tradeoffs.kicker": "Tradeoffs",
    "showcase.testora.caseStudy.tradeoffs.title": "Was wir aufgaben, und warum",
    "showcase.testora.caseStudy.tradeoffs.noLiveRunner": "Kein live runner in der Öffentlichkeit",
    "showcase.testora.caseStudy.tradeoffs.snapshot":
      "Destillierte Snapshot statt roher Logs",
    "showcase.testora.caseStudy.lessons.kicker": "Lektionen",
    "showcase.testora.caseStudy.lessons.title": "Lektionen des Legacy-Systems",
    "showcase.testora.caseStudy.lessons.reproducibility":
      "Reproduzierbarkeit schlägt Realismus",
    "showcase.testora.caseStudy.lessons.detection":
      "Erkennung ist die echte Metrik",
    "showcase.testora.caseStudy.lessons.citation":
      "Behauptungen brauchen einen Beleg",
  },
  lb: {
    "showcase.testora.overview.hero.kicker": "Exhibit № 03 · Benchmark",
    "showcase.testora.overview.hero.title":
      "Testora — an observable test-automation benchmark.",
    "showcase.testora.overview.hero.lede":
      "A fixed, offline sample application carries intentional, seeded defects. Testora proves a good suite catches every one of them — deterministically, with complete artifacts — and shows the evidence.",
    "showcase.testora.overview.hero.ctaPrimary": "See the latest run",
    "showcase.testora.overview.hero.ctaSecondary": "Read the case study",
    "showcase.testora.overview.headline.kicker": "Method",
    "showcase.testora.overview.headline.title": "How the reference run scored",
    "showcase.testora.overview.metrics.detectionRate.label": "Detection rate",
    "showcase.testora.overview.metrics.detectionRate.hint":
      "{{detected}}/{{total}} seeded regressions",
    "showcase.testora.overview.metrics.flakyIdentified.label": "Flaky identified",
    "showcase.testora.overview.metrics.flakyIdentified.hint":
      "fail-then-pass told apart from a regression",
    "showcase.testora.overview.metrics.timeToDiagnosis.label": "Time to diagnosis",
    "showcase.testora.overview.metrics.timeToDiagnosis.hint":
      "mean across failing scenarios",
    "showcase.testora.overview.metrics.artifactCompleteness.label":
      "Artifact completeness",
    "showcase.testora.overview.metrics.artifactCompleteness.hint":
      "trace · screenshot · video",
    "showcase.testora.overview.metrics.ciReproducibility.label":
      "CI reproducibility",
    "showcase.testora.overview.metrics.ciReproducibility.hint":
      "byte-stable across runs",
    "showcase.testora.overview.metrics.passRate.label": "Pass rate",
    "showcase.testora.overview.metrics.passRate.hint":
      "{{passed}}/{{total}} cases green",
    "showcase.testora.overview.dimensions.kicker": "What it measures",
    "showcase.testora.overview.dimensions.title": "Five benchmark dimensions",
    "showcase.testora.overview.dimensions.table.dimension": "Dimension",
    "showcase.testora.overview.dimensions.table.question": "Question",
    "showcase.testora.overview.dimensions.table.measured": "How it's measured",
    "showcase.testora.overview.dimensions.detection.name": "Detection rate",
    "showcase.testora.overview.dimensions.detection.question":
      "Does the suite catch every known seeded regression?",
    "showcase.testora.overview.dimensions.detection.method":
      "Two product defects are seeded into the sample app (un-trimmed email, tax dropped from a total). Detection = share of seeded regressions that end the run failed.",
    "showcase.testora.overview.dimensions.flaky.name": "Flaky-test identification",
    "showcase.testora.overview.dimensions.flaky.question":
      "Can a genuine flake be told apart from a stable regression?",
    "showcase.testora.overview.dimensions.flaky.method":
      "One scenario is engineered to fail-then-pass across a retry. It must be reported as flaky, not as a passing or a hard-failing test.",
    "showcase.testora.overview.dimensions.diagnosis.name":
      "Time to useful diagnosis",
    "showcase.testora.overview.dimensions.diagnosis.question":
      "How quickly does a failure become an actionable message?",
    "showcase.testora.overview.dimensions.diagnosis.method":
      "Mean wall-time across failing scenarios from start to a concise, cause-level diagnostic summary attached to the result.",
    "showcase.testora.overview.dimensions.artifacts.name": "Artifact completeness",
    "showcase.testora.overview.dimensions.artifacts.question":
      "Is every failure backed by trace, screenshot, and video?",
    "showcase.testora.overview.dimensions.artifacts.method":
      "For each non-passing scenario the run must retain a Playwright trace, a screenshot, and a video. Completeness = captured / expected.",
    "showcase.testora.overview.dimensions.reproducibility.name": "CI reproducibility",
    "showcase.testora.overview.dimensions.reproducibility.question":
      "Do the same inputs yield the same outcomes every run?",
    "showcase.testora.overview.dimensions.reproducibility.method":
      "The sample app is offline and stateless; outcomes are a pure function of the URL. Re-running the suite — and regenerating these fixtures — is byte-for-byte stable.",
    "showcase.testora.overview.method.kicker": "Method",
    "showcase.testora.overview.method.title": "Why the numbers are trustworthy",
    "showcase.testora.overview.method.determinism.title": "Determinism",
    "showcase.testora.overview.method.determinism.body":
      "Every screen renders purely from the URL query (?screen=, ?attempt=). Seeded regressions assert behaviour the app deliberately violates, so they fail on every attempt; the flake passes testInfo.retry as its attempt, so it fails first and passes on retry.",
    "showcase.testora.overview.method.provenance.title": "Provenance",
    "showcase.testora.overview.method.provenance.body":
      "These pages render committed fixture JSON distilled from a real Playwright run. The public demo never executes any test code. The runnable harness and CI upload the real traces, screenshots, and videos as the citable source.",
    "showcase.common.yes": "Yes",
    "showcase.common.no": "No",
  },
};

export default testoraDictionaries;
