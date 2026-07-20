import type { Dictionaries } from "@asafarim/shared-i18n";

const viontoDictionaries: Dictionaries = {
  en: {
    "showcase.vionto.overview.hero.kicker": "Exhibit № 05 · Benchmark",
    "showcase.vionto.overview.hero.title":
      "Vionto Studio — an AI pipeline you can trust to fail honestly.",
    "showcase.vionto.overview.hero.lede":
      "A schema-validated brief-to-render pipeline with explicit human approval gates and idempotent retry. Two stages are seeded to fail — and the benchmark proves the pipeline recovers, truthfully, every time.",
    "showcase.vionto.overview.hero.ctaPrimary": "Run the pipeline",
    "showcase.vionto.overview.hero.ctaSecondary": "Read the case study",
    "showcase.vionto.overview.headline.kicker": "Headline",
    "showcase.vionto.overview.headline.title": "How the reference run scored",
    "showcase.vionto.overview.metrics.structuredOutputValidity.label":
      "Structured-output validity",
    "showcase.vionto.overview.metrics.structuredOutputValidity.hint":
      "schema-valid generation attempts",
    "showcase.vionto.overview.metrics.retryIdempotency.label":
      "Retry idempotency",
    "showcase.vionto.overview.metrics.retryIdempotency.hint":
      "new job, never a mutation",
    "showcase.vionto.overview.metrics.completionTime.label": "Completion time",
    "showcase.vionto.overview.metrics.completionTime.hint":
      "reference, per successful run",
    "showcase.vionto.overview.metrics.costDelta.label": "Cost delta",
    "showcase.vionto.overview.metrics.costDelta.hint":
      "estimated vs. observed",
    "showcase.vionto.overview.metrics.seededFailureRecovery.label":
      "Seeded-failure recovery",
    "showcase.vionto.overview.metrics.seededFailureRecovery.hint":
      "reaches succeeded via retry",
    "showcase.vionto.overview.dimensions.kicker": "What it measures",
    "showcase.vionto.overview.dimensions.title": "Five benchmark dimensions",
    "showcase.vionto.overview.dimensions.structuredOutputValidity.name":
      "Structured-output validity",
    "showcase.vionto.overview.dimensions.structuredOutputValidity.question":
      "Does every stage produce output that satisfies its schema?",
    "showcase.vionto.overview.dimensions.retryIdempotencyCorrectness.name":
      "Retry & idempotency correctness",
    "showcase.vionto.overview.dimensions.retryIdempotencyCorrectness.question":
      "Can a failed or cancelled run be retried without corrupting history?",
    "showcase.vionto.overview.dimensions.endToEndCompletionTime.name":
      "End-to-end completion time",
    "showcase.vionto.overview.dimensions.endToEndCompletionTime.question":
      "How long does a full brief-to-render run take?",
    "showcase.vionto.overview.dimensions.estimatedVsObservedCost.name":
      "Estimated vs. observed cost",
    "showcase.vionto.overview.dimensions.estimatedVsObservedCost.question":
      "Does the pre-run cost estimate match what actually happened?",
    "showcase.vionto.overview.dimensions.seededFailureRecovery.name":
      "Recovery from seeded failures",
    "showcase.vionto.overview.dimensions.seededFailureRecovery.question":
      "Does a deliberately broken stage recover cleanly via retry?",
    "showcase.vionto.overview.scores.structuredOutputValidity.method":
      "Every stage output is validated against a JSON schema before the next stage can run. 100% means no stage advanced with invalid data.",
    "showcase.vionto.overview.scores.retryIdempotencyCorrectness.method":
      "A failed or cancelled run is retried and a new job is returned; the original job is never mutated and the new job resumes at the correct stage.",
    "showcase.vionto.overview.scores.endToEndCompletionTime.method":
      "Total wall-clock time from brief acceptance to final render report for successful reference runs, using representative fixture timings.",
    "showcase.vionto.overview.scores.estimatedVsObservedCost.method":
      "Pre-run cost estimate is computed from the same fixture used at generation time, so delta is zero by construction in this offline benchmark.",
    "showcase.vionto.overview.scores.seededFailureRecovery.method":
      "A brief with a deliberately invalid script or transient render failure is retried and reaches succeeded with the same fixture data.",
    "showcase.vionto.overview.method.kicker": "Method",
    "showcase.vionto.overview.method.title": "Why the pipeline is trustworthy",
    "showcase.vionto.overview.method.approvalGates.title": "Approval gates",
    "showcase.vionto.overview.method.approvalGates.body":
      "The pipeline will not proceed past script generation or past asset-plan generation without an explicit approve() call. A human can also reject at either gate, which ends the run at 'cancelled' — a legitimate terminal state, not a failure — without losing anything: retrying a cancelled run regenerates only the rejected stage.",
    "showcase.vionto.overview.method.idempotentRetry.title": "Idempotent retry",
    "showcase.vionto.overview.method.idempotentRetry.body":
      "Retry is legal only from 'failed' or 'cancelled' — the engine throws otherwise. Retrying never mutates the original job; it returns a brand-new job with retryCount+1 that resumes at the stage that failed or was rejected, mirroring the legacy render-job retry route's idempotency rule.",
    "showcase.vionto.overview.method.providers.title": "Providers",
    "showcase.vionto.overview.method.providers.body":
      "Only a FixtureProvider is wired up — every script, storyboard, and asset plan is a deterministic lookup into a brief's committed fixture. A LiveProviderStub documents the interface a real adapter would implement, but always throws, even with explicit confirmation: no live provider integration exists in this repo.",
    "showcase.vionto.overview.honesty.kicker": "Honesty",
    "showcase.vionto.overview.honesty.title": "Limitations",
    "showcase.vionto.overview.honesty.panelTitle":
      "what this benchmark does not prove",
    "showcase.vionto.overview.honesty.limitations.p1":
      "Five hand-authored briefs demonstrate the method — a happy path, a seeded schema failure, a seeded transient render failure, and two human-rejection paths — not statistical significance at scale.",
    "showcase.vionto.overview.honesty.limitations.p2":
      '"Estimated vs. observed" cost is zero-delta by construction in fixture mode: nothing about a brief varies between estimate-time and generation-time without a live provider. Real variance would only appear once a live adapter is connected.',
    "showcase.vionto.overview.honesty.limitations.p3":
      "The fixture renderer produces a structured report and an SVG storyboard strip, not actual video or image encoding — there is no media pipeline behind this benchmark, synthetic or otherwise.",
    "showcase.vionto.overview.honesty.limitations.p4":
      "Completion-time and cost figures are representative reference numbers, not live measurements — the engine itself is a pure in-memory reducer and runs in sub-millisecond time.",
    "showcase.vionto.caseStudy.pageHeader.kicker": "Case study",
    "showcase.vionto.caseStudy.pageHeader.title":
      "Building reliable AI workflows, not generating content",
    "showcase.vionto.caseStudy.pageHeader.description":
      "The part of Vionto worth showing publicly was never the video output — it was how the pipeline handles failure.",
    "showcase.vionto.caseStudy.section.evolution.kicker": "Evolution",
    "showcase.vionto.caseStudy.section.evolution.title":
      "What was ported, what wasn't",
    "showcase.vionto.caseStudy.table.stage": "Stage",
    "showcase.vionto.caseStudy.table.stack": "Stack",
    "showcase.vionto.caseStudy.table.idea": "Core idea",
    "showcase.vionto.caseStudy.table.limit": "Where it hit a wall",
    "showcase.vionto.caseStudy.evolution.personalProject.stage":
      "Personal project",
    "showcase.vionto.caseStudy.evolution.personalProject.stack":
      "Next.js · Prisma/Postgres · BullMQ/Redis · FFmpeg · OpenAI/Anthropic",
    "showcase.vionto.caseStudy.evolution.personalProject.idea":
      "Turn a brief into a rendered photo/video story: LLM script generation, a render-worker queue, subtitle burn-in, audio mixing.",
    "showcase.vionto.caseStudy.evolution.personalProject.limit":
      "The interesting engineering — a job state machine, idempotent retry, schema-validated manifests — was entangled with live provider calls, real media, and infrastructure that can't be shown publicly as-is.",
    "showcase.vionto.caseStudy.evolution.benchmark.stage": "This benchmark",
    "showcase.vionto.caseStudy.evolution.benchmark.stack":
      "Pure state machine · fixture providers · structured render reports · no live calls",
    "showcase.vionto.caseStudy.evolution.benchmark.idea":
      "Extract the orchestration discipline — approval gates, idempotent retry, seeded-failure recovery, cost estimation — and prove it deterministically, without a queue, a render farm, or a single API key.",
    "showcase.vionto.caseStudy.evolution.benchmark.limit":
      "Deliberately no live provider adapters, no real media encoding, no worker infrastructure. The public benchmark demonstrates reliability discipline, not content generation.",
    "showcase.vionto.caseStudy.section.architecture.kicker": "Architecture",
    "showcase.vionto.caseStudy.section.architecture.title":
      "How the benchmark is built",
    "showcase.vionto.caseStudy.architecture.constraintsFirst.title":
      "Constraints before spend",
    "showcase.vionto.caseStudy.architecture.constraintsFirst.body":
      "Every stage's output is schema-validated before the pipeline advances. A malformed asset plan is caught immediately — never silently passed to a render stage that would waste the expensive step.",
    "showcase.vionto.caseStudy.architecture.approval.title":
      "Explicit approval, not implicit trust",
    "showcase.vionto.caseStudy.architecture.approval.body":
      "The state machine will not proceed past script generation or asset planning without an explicit approve() call. A human can reject at either gate and the run ends cleanly at cancelled — never silently continuing with rejected output.",
    "showcase.vionto.caseStudy.architecture.retry.title":
      "Idempotent retry, not blind resubmission",
    "showcase.vionto.caseStudy.architecture.retry.body":
      "Retry is legal only from failed or cancelled, and always returns a new job rather than mutating history — the same rule the legacy render-job retry route enforced, generalized to every stage.",
    "showcase.vionto.caseStudy.architecture.oneEngine.title":
      "One engine, three consumers",
    "showcase.vionto.caseStudy.architecture.oneEngine.body":
      "The state machine, providers, and renderer are one ESM module imported by the Node test suite, the fixture generator, and the Showcase's client-side Pipeline Explorer — no second implementation to drift.",
    "showcase.vionto.caseStudy.section.tradeoffs.kicker": "Tradeoffs",
    "showcase.vionto.caseStudy.section.tradeoffs.title":
      "What we gave up, and why",
    "showcase.vionto.caseStudy.tradeoffs.noLiveGeneration.title":
      "No live generation in public",
    "showcase.vionto.caseStudy.tradeoffs.noLiveGeneration.body":
      "The public surface cannot call a real LLM or render worker. That rules out 'generate my own video' demos, but it's the only way to publish a pipeline benchmark with zero API keys and zero cost risk.",
    "showcase.vionto.caseStudy.tradeoffs.structuredReports.title":
      "Structured reports, not real media",
    "showcase.vionto.caseStudy.tradeoffs.structuredReports.body":
      "The fixture renderer produces a JSON report and an SVG storyboard strip, not an actual encoded video — there is no media pipeline dependency in this benchmark, synthetic or otherwise.",
    "showcase.vionto.caseStudy.section.lessons.kicker": "Lessons",
    "showcase.vionto.caseStudy.section.lessons.title":
      "Lessons from the legacy system",
    "showcase.vionto.caseStudy.lessons.stateMachine.title":
      "Reliability is a state machine, not a try/catch",
    "showcase.vionto.caseStudy.lessons.stateMachine.body":
      "The legacy retry route got idempotency right in one place. Making it a first-class, tested state machine — rather than logic embedded in one API route — is what let this benchmark prove the rule holds for every stage, not just render.",
    "showcase.vionto.caseStudy.lessons.costEstimate.title":
      "A cost estimate is only honest if it's falsifiable",
    "showcase.vionto.caseStudy.lessons.costEstimate.body":
      "An estimate nobody checks against reality isn't a benchmark dimension, it's a guess. Recomputing 'observed' cost from the actual artifacts — and reporting the delta as zero in fixture mode, honestly — sets up the exact comparison a live adapter would need to earn trust.",
    "showcase.vionto.caseStudy.lessons.production.title":
      "Toward a real production version",
    "showcase.vionto.caseStudy.lessons.production.badge": "evidence-first",
    "showcase.vionto.caseStudy.towardProduction.0":
      "Real provider adapters (an LLM for scripts, a render worker for video) implementing the same ScriptProvider/RenderProvider interface, gated behind explicit flags and a cost confirmation step.",
    "showcase.vionto.caseStudy.towardProduction.1":
      "Real asset storage, licensing, and rights verification for any non-synthetic media.",
    "showcase.vionto.caseStudy.towardProduction.2":
      "Durable queue/worker infrastructure so a job survives a process restart, with the same state machine and idempotent-retry semantics enforced server-side.",
    "showcase.vionto.caseStudy.towardProduction.3":
      "Audit logging and access control around who can approve or reject a run at each gate.",
    "showcase.vionto.cost.pageHeader.kicker": "Cost",
    "showcase.vionto.cost.pageHeader.title":
      "Cost & latency, estimated before you spend it",
    "showcase.vionto.cost.pageHeader.description":
      "Every run is estimated before any expensive stage executes. The acceptance criterion is that this benchmark reports cost/latency without fabricating live numbers — every figure below is either a fixed reference rate or recomputed from the same fixtures.",
    "showcase.vionto.cost.section.why.kicker": "Why zero delta",
    "showcase.vionto.cost.section.why.title": "Estimated vs. observed",
    "showcase.vionto.cost.panel.title": "fixture mode has no live variance",
    "showcase.vionto.cost.section.perRun.kicker": "Per run",
    "showcase.vionto.cost.section.perRun.title":
      "Estimate vs. observed, per reference run",
    "showcase.vionto.cost.table.run": "Run",
    "showcase.vionto.cost.table.outcome": "Outcome",
    "showcase.vionto.cost.table.estTokens": "Est. tokens",
    "showcase.vionto.cost.table.estRenderSeconds": "Est. render seconds",
    "showcase.vionto.cost.table.estUsd": "Estimated $",
    "showcase.vionto.cost.table.obsUsd": "Observed $",
    "showcase.vionto.cost.table.refCompletion": "Reference completion",
    "showcase.vionto.state.succeeded": "Succeeded",
    "showcase.vionto.state.failed": "Failed",
    "showcase.vionto.state.cancelled": "Cancelled",
    "showcase.vionto.state.awaiting-approval": "Awaiting approval",
    "showcase.vionto.state.running": "Running",
    "showcase.vionto.state.queued": "Queued",
    "showcase.vionto.manifests.pageHeader.kicker": "Manifests",
    "showcase.vionto.manifests.pageHeader.title":
      "Versioned artifact inspector",
    "showcase.vionto.manifests.pageHeader.description":
      "Every artifact a run produces records its configuration version and an inputs fingerprint — the acceptance criterion that every generated artifact records its inputs and configuration version, made concrete.",
    "showcase.vionto.manifests.section.runs.kicker": "Runs",
    "showcase.vionto.manifests.section.runs.title": "Every reference run",
    "showcase.vionto.manifests.table.stage": "Stage",
    "showcase.vionto.manifests.table.configVersion": "Config version",
    "showcase.vionto.manifests.table.inputsFingerprint": "Inputs fingerprint",
    "showcase.vionto.manifests.table.value": "Value",
    "showcase.vionto.manifests.stage.script": "Script",
    "showcase.vionto.manifests.stage.storyboard": "Storyboard",
    "showcase.vionto.manifests.stage.assetPlan": "Asset plan",
    "showcase.vionto.manifests.stage.renderReport": "Render report",
    "showcase.vionto.pipeline.pageHeader.kicker": "Pipeline",
    "showcase.vionto.pipeline.pageHeader.title": "Pipeline explorer",
    "showcase.vionto.pipeline.pageHeader.description":
      "Runs the real state machine client-side against a committed synthetic brief. Approval gates cannot be skipped; retry is only possible from failed or cancelled — exactly the rules the engine enforces server-side in a real deployment.",
    "showcase.vionto.pipeline.section.live.kicker": "Live",
    "showcase.vionto.pipeline.section.live.title":
      "Step the pipeline yourself",
    "showcase.vionto.pipeline.panel.title": "pipeline explorer",
    "showcase.vionto.pipeline.section.try.kicker": "Try this",
    "showcase.vionto.pipeline.section.try.title":
      "Three things worth clicking through",
    "showcase.vionto.pipeline.try.b02.title": "B-02 — seeded schema failure",
    "showcase.vionto.pipeline.try.b02.body":
      "Start, then Approve. The asset plan fails schema validation on the first attempt — watch it land in failed, then hit Retry to see the regenerated plan pass and the run continue.",
    "showcase.vionto.pipeline.try.b03.title": "B-03 — seeded transient render failure",
    "showcase.vionto.pipeline.try.b03.body":
      "Start, Approve, Approve. The render stage fails once (a simulated transient encode error), then Retry succeeds without regenerating anything upstream.",
    "showcase.vionto.pipeline.try.b05.title": "B-05 — reject with no retry",
    "showcase.vionto.pipeline.try.b05.body":
      "Start, then Reject. The run ends at cancelled — a legitimate stop, not a failure, and nothing forces you to retry it.",
    "showcase.vionto.pipelineExplorer.brief": "Brief",
    "showcase.vionto.pipelineExplorer.start": "Start",
    "showcase.vionto.pipelineExplorer.approve": "Approve",
    "showcase.vionto.pipelineExplorer.reject": "Reject",
    "showcase.vionto.pipelineExplorer.retry": "Retry",
    "showcase.vionto.pipelineExplorer.reset": "Reset",
    "showcase.vionto.pipelineExplorer.retryLabel": "retry",
    "showcase.vionto.pipelineExplorer.stage.script": "Script",
    "showcase.vionto.pipelineExplorer.stage.storyboard": "Storyboard",
    "showcase.vionto.pipelineExplorer.stage.asset-plan": "Asset plan",
    "showcase.vionto.pipelineExplorer.stage.render": "Render",
    "showcase.vionto.pipelineExplorer.stage.done": "Done",
    "showcase.vionto.pipelineExplorer.aria.stage": "Pipeline stage",
  },
  nl: {
    "showcase.vionto.overview.hero.kicker": "Tentoonstelling nr. 05 · Benchmark",
    "showcase.vionto.overview.hero.title":
      "Vionto Studio — een AI-pipeline die je kunt vertrouwen om eerlijk te falen.",
    "showcase.vionto.overview.hero.lede":
      "Een schema-gevalideerde brief-to-render-pipeline met expliciete menselijke goedkeuringspoorten en idempotente retry. Twee stages zijn bewust ingesteld om te falen — en de benchmark bewijst dat de pipeline elke keer eerlijk herstelt.",
    "showcase.vionto.overview.hero.ctaPrimary": "Pipeline starten",
    "showcase.vionto.overview.hero.ctaSecondary": "Case study lezen",
    "showcase.vionto.overview.headline.kicker": "Kerngegevens",
    "showcase.vionto.overview.headline.title": "Hoe de referencerun scoorde",
    "showcase.vionto.overview.metrics.structuredOutputValidity.label": "Structured-output-validiteit",
    "showcase.vionto.overview.metrics.structuredOutputValidity.hint": "schema-valide generatiepogingen",
    "showcase.vionto.overview.metrics.retryIdempotency.label": "Retry-idempotency",
    "showcase.vionto.overview.metrics.retryIdempotency.hint": "nieuwe job, nooit mutatie",
    "showcase.vionto.overview.metrics.completionTime.label": "Doorlooptijd",
    "showcase.vionto.overview.metrics.completionTime.hint": "referentie, per succesvolle run",
    "showcase.vionto.overview.metrics.costDelta.label": "Kostendelta",
    "showcase.vionto.overview.metrics.costDelta.hint": "geschat vs. waargenomen",
    "showcase.vionto.overview.metrics.seededFailureRecovery.label": "Herstel van opzettelijke failures",
    "showcase.vionto.overview.metrics.seededFailureRecovery.hint": "bereikt succeeded via retry",
    "showcase.vionto.overview.dimensions.kicker": "Wat het meet",
    "showcase.vionto.overview.dimensions.title": "Vijf benchmarkdimensies",
    "showcase.vionto.overview.dimensions.structuredOutputValidity.name": "Structured-output-validiteit",
    "showcase.vionto.overview.dimensions.structuredOutputValidity.question": "Produceert elke stage output die aan zijn schema voldoet?",
    "showcase.vionto.overview.dimensions.retryIdempotencyCorrectness.name": "Retry- en idempotency-correctheid",
    "showcase.vionto.overview.dimensions.retryIdempotencyCorrectness.question": "Kan een failed of cancelled run opnieuw worden gestart zonder de geschiedenis te corrupten?",
    "showcase.vionto.overview.dimensions.endToEndCompletionTime.name": "End-to-end doorlooptijd",
    "showcase.vionto.overview.dimensions.endToEndCompletionTime.question": "Hoe lang duurt een volledige brief-to-render-run?",
    "showcase.vionto.overview.dimensions.estimatedVsObservedCost.name": "Geschatte vs. waargenomen kosten",
    "showcase.vionto.overview.dimensions.estimatedVsObservedCost.question": "Komt de vooraf geschatte kost overeen met wat er werkelijk gebeurde?",
    "showcase.vionto.overview.dimensions.seededFailureRecovery.name": "Herstel van opzettelijke failures",
    "showcase.vionto.overview.dimensions.seededFailureRecovery.question": "Herstelt een bewust kapotte stage schoon via retry?",
    "showcase.vionto.overview.scores.structuredOutputValidity.method": "Elke stage-output wordt gevalideerd tegen een JSON schema voordat de volgende stage kan draaien. 100% betekent dat geen stage verderging met ongeldige data.",
    "showcase.vionto.overview.scores.retryIdempotencyCorrectness.method": "Een failed of cancelled run wordt opnieuw gestart en er wordt een nieuwe job geretourneerd; de oorspronkelijke job wordt nooit gemuteerd en de nieuwe job hervat op de juiste stage.",
    "showcase.vionto.overview.scores.endToEndCompletionTime.method": "Totale wandkloktijd van brief-acceptatie tot het finale render-rapport voor succesvolle referenceruns, met representatieve fixture-tijden.",
    "showcase.vionto.overview.scores.estimatedVsObservedCost.method": "De kostenraming vooraf wordt berekend op basis van dezelfde fixture die bij generatie wordt gebruikt, dus de delta is nul by construction in deze offline benchmark.",
    "showcase.vionto.overview.scores.seededFailureRecovery.method": "Een brief met een bewust ongeldig script of een transient render-failure wordt opnieuw gestart en bereikt succeeded met dezelfde fixture-data.",
    "showcase.vionto.overview.method.kicker": "Methode",
    "showcase.vionto.overview.method.title": "Waarom de pipeline betrouwbaar is",
    "showcase.vionto.overview.method.approvalGates.title": "Goedkeuringspoorten",
    "showcase.vionto.overview.method.approvalGates.body": "De pipeline gaat niet verder dan scriptgeneratie of asset-plan-generatie zonder een expliciete approve()-call. Een mens kan ook bij elke poort afwijzen, waardoor de run eindigt in 'cancelled' — een legitieme eindstatus, geen failure — zonder iets te verliezen: het opnieuw starten van een cancelled run genereert alleen de afgewezen stage opnieuw.",
    "showcase.vionto.overview.method.idempotentRetry.title": "Idempotente retry",
    "showcase.vionto.overview.method.idempotentRetry.body": "Retry is alleen toegestaan vanuit 'failed' of 'cancelled' — anders gooit de engine een error. Retry muteert nooit de oorspronkelijke job; het retourneert een gloednieuwe job met retryCount+1 die hervat op de stage die faalde of werd afgewezen, in lijn met de idempotency-regel van de legacy render-job retry route.",
    "showcase.vionto.overview.method.providers.title": "Providers",
    "showcase.vionto.overview.method.providers.body": "Er is alleen een FixtureProvider aangesloten — elk script, storyboard en asset plan is een deterministische lookup in de committed fixture van een brief. Een LiveProviderStub documenteert de interface die een echte adapter zou implementeren, maar gooit altijd een error, zelfs met expliciete bevestiging: er is geen live provider-integratie in deze repo.",
    "showcase.vionto.overview.honesty.kicker": "Eerlijkheid",
    "showcase.vionto.overview.honesty.title": "Beperkingen",
    "showcase.vionto.overview.honesty.panelTitle": "wat deze benchmark niet bewijst",
    "showcase.vionto.overview.honesty.limitations.p1": "Vijf handgeschreven briefs demonstreren de methode — een happy path, een opzettelijke schema-failure, een opzettelijke transient render-failure en twee human-rejection-paden — geen statistische significantie op schaal.",
    "showcase.vionto.overview.honesty.limitations.p2": "'Geschat vs. waargenomen' kosten zijn zero-delta by construction in fixture-mode: niets aan een brief verschilt tussen schattijd en generatietijd zonder live provider. Echte variantie verschijnt pas zodra een live adapter is aangesloten.",
    "showcase.vionto.overview.honesty.limitations.p3": "De fixture-renderer produceert een gestructureerd rapport en een SVG storyboard-strip, geen echte video- of image-encoding — er is geen media-pipeline achter deze benchmark, synthetisch of anders.",
    "showcase.vionto.overview.honesty.limitations.p4": "Doorlooptijd- en kostencijfers zijn representatieve referentiegetallen, geen live metingen — de engine zelf is een pure in-memory reducer en draait in sub-millisecond-tijd.",
  },
  fr: {
    "showcase.vionto.overview.hero.kicker": "Exposition n° 05 · Benchmark",
    "showcase.vionto.overview.hero.title":
      "Vionto Studio — un pipeline IA qui sait échouer honnêtement.",
    "showcase.vionto.overview.hero.lede":
      "Un pipeline brief-to-render validé par schéma, avec des portes d'approbation humaines explicites et un retry idempotent. Deux stages sont volontairement amenés à échouer — et le benchmark prouve que le pipeline récupère honnêtement, à chaque fois.",
    "showcase.vionto.overview.hero.ctaPrimary": "Exécuter le pipeline",
    "showcase.vionto.overview.hero.ctaSecondary": "Lire la case study",
    "showcase.vionto.overview.headline.kicker": "Points clés",
    "showcase.vionto.overview.headline.title": "Comment le run de référence a été noté",
    "showcase.vionto.overview.metrics.structuredOutputValidity.label": "Validité de la sortie structurée",
    "showcase.vionto.overview.metrics.structuredOutputValidity.hint": "tentatives de génération valides par schéma",
    "showcase.vionto.overview.metrics.retryIdempotency.label": "Idempotence du retry",
    "showcase.vionto.overview.metrics.retryIdempotency.hint": "nouveau job, jamais de mutation",
    "showcase.vionto.overview.metrics.completionTime.label": "Temps de traitement",
    "showcase.vionto.overview.metrics.completionTime.hint": "référence, par run réussi",
    "showcase.vionto.overview.metrics.costDelta.label": "Delta de coût",
    "showcase.vionto.overview.metrics.costDelta.hint": "estimé vs. observé",
    "showcase.vionto.overview.metrics.seededFailureRecovery.label": "Récupération d'échecs provoqués",
    "showcase.vionto.overview.metrics.seededFailureRecovery.hint": "atteint succeeded via retry",
    "showcase.vionto.overview.dimensions.kicker": "Ce qu'il mesure",
    "showcase.vionto.overview.dimensions.title": "Cinq dimensions du benchmark",
    "showcase.vionto.overview.dimensions.structuredOutputValidity.name": "Validité de la sortie structurée",
    "showcase.vionto.overview.dimensions.structuredOutputValidity.question": "Chaque stage produit-il une sortie conforme à son schéma ?",
    "showcase.vionto.overview.dimensions.retryIdempotencyCorrectness.name": "Correctness du retry et de l'idempotence",
    "showcase.vionto.overview.dimensions.retryIdempotencyCorrectness.question": "Un run failed ou cancelled peut-il être relancé sans corrompre l'historique ?",
    "showcase.vionto.overview.dimensions.endToEndCompletionTime.name": "Temps de traitement end-to-end",
    "showcase.vionto.overview.dimensions.endToEndCompletionTime.question": "Combien de temps dure un run brief-to-render complet ?",
    "showcase.vionto.overview.dimensions.estimatedVsObservedCost.name": "Coût estimé vs. observé",
    "showcase.vionto.overview.dimensions.estimatedVsObservedCost.question": "L'estimation de coût pré-run correspond-elle à ce qui s'est réellement passé ?",
    "showcase.vionto.overview.dimensions.seededFailureRecovery.name": "Récupération d'échecs provoqués",
    "showcase.vionto.overview.dimensions.seededFailureRecovery.question": "Un stage délibérément cassé se rétablit-il proprement via retry ?",
    "showcase.vionto.overview.scores.structuredOutputValidity.method": "Chaque sortie de stage est validée contre un schéma JSON avant que le stage suivant ne puisse s'exécuter. 100 % signifie qu'aucun stage n'a avancé avec des données invalides.",
    "showcase.vionto.overview.scores.retryIdempotencyCorrectness.method": "Un run failed ou cancelled est relancé et un nouveau job est retourné ; le job original n'est jamais muté et le nouveau job reprend au bon stage.",
    "showcase.vionto.overview.scores.endToEndCompletionTime.method": "Temps total d'horloge depuis l'acceptation du brief jusqu'au rapport de rendu final pour les runs de référence réussis, avec des timings de fixtures représentatifs.",
    "showcase.vionto.overview.scores.estimatedVsObservedCost.method": "L'estimation de coût pré-run est calculée à partir de la même fixture utilisée au moment de la génération, donc le delta est zéro by construction dans ce benchmark hors ligne.",
    "showcase.vionto.overview.scores.seededFailureRecovery.method": "Un brief avec un script volontairement invalide ou un échec de rendu transient est relancé et atteint succeeded avec les mêmes données de fixture.",
    "showcase.vionto.overview.method.kicker": "Méthode",
    "showcase.vionto.overview.method.title": "Pourquoi le pipeline est digne de confiance",
    "showcase.vionto.overview.method.approvalGates.title": "Portes d'approbation",
    "showcase.vionto.overview.method.approvalGates.body": "Le pipeline ne dépasse pas la génération de script ni la génération de plan d'assets sans un appel approve() explicite. Un humain peut aussi rejeter à chaque porte, ce qui termine le run en 'cancelled' — un état terminal légitime, pas un échec — sans rien perdre : relancer un run cancelled ne régénère que le stage rejeté.",
    "showcase.vionto.overview.method.idempotentRetry.title": "Retry idempotent",
    "showcase.vionto.overview.method.idempotentRetry.body": "Le retry n'est autorisé que depuis 'failed' ou 'cancelled' — sinon le moteur lève une erreur. Le retry ne mute jamais le job original ; il retourne un nouveau job avec retryCount+1 qui reprend au stage qui a échoué ou été rejeté, reflétant la règle d'idempotence de l'ancienne route de retry de render-job.",
    "showcase.vionto.overview.method.providers.title": "Providers",
    "showcase.vionto.overview.method.providers.body": "Seul un FixtureProvider est câblé — chaque script, storyboard et plan d'assets est une recherche déterministe dans la fixture commitée d'un brief. Un LiveProviderStub documente l'interface qu'un vrai adaptateur implémenterait, mais lève toujours une erreur, même avec confirmation explicite : aucune intégration de provider live n'existe dans ce repo.",
    "showcase.vionto.overview.honesty.kicker": "Honnêteté",
    "showcase.vionto.overview.honesty.title": "Limites",
    "showcase.vionto.overview.honesty.panelTitle": "ce que ce benchmark ne prouve pas",
    "showcase.vionto.overview.honesty.limitations.p1": "Cinq briefs rédigés à la main démontrent la méthode — un happy path, un échec de schéma provoqué, un échec de rendu transient provoqué et deux chemins de rejet humain — pas une signification statistique à grande échelle.",
    "showcase.vionto.overview.honesty.limitations.p2": "Le coût 'estimé vs. observé' est un delta nul by construction en mode fixture : rien dans un brief ne varie entre l'estimation et la génération sans provider live. Une variance réelle n'apparaîtrait qu'une fois un adaptateur live connecté.",
    "showcase.vionto.overview.honesty.limitations.p3": "Le renderer de fixtures produit un rapport structuré et une bande de storyboard SVG, pas un vrai encodage vidéo ou image — il n'y a pas de pipeline média derrière ce benchmark, synthétique ou autre.",
    "showcase.vionto.overview.honesty.limitations.p4": "Les chiffres de temps de traitement et de coût sont des nombres de référence représentatifs, pas des mesures live — le moteur lui-même est un reducer pure en mémoire et s'exécute en moins d'une milliseconde.",
  },
  de: {},
  lb: {},
};

export default viontoDictionaries;
