import type { Dictionaries } from "@asafarim/shared-i18n";

const edumatchDictionaries: Dictionaries = {
  en: {
    "showcase.edumatch.overview.hero.kicker": "Exhibit № 04 · Benchmark",
    "showcase.edumatch.overview.hero.title":
      "EduMatch — matching you can inspect and argue with.",
    "showcase.edumatch.overview.hero.lede":
      "A transparent tutor-matching engine scored on relevance, constraint safety, explainability, fairness, and stability — every recommendation states exactly why it appears, and you can move the weights yourself.",
    "showcase.edumatch.overview.hero.ctaPrimary": "Open the match explorer",
    "showcase.edumatch.overview.hero.ctaSecondary": "Read the case study",
    "showcase.edumatch.overview.headline.kicker": "Headline",
    "showcase.edumatch.overview.headline.title": "How the reference run scored",
    "showcase.edumatch.overview.metrics.matchRelevance.label": "Match relevance",
    "showcase.edumatch.overview.metrics.matchRelevance.hint":
      "vs. labeled fixture set",
    "showcase.edumatch.overview.metrics.constraintSatisfaction.label":
      "Constraint satisfaction",
    "showcase.edumatch.overview.metrics.constraintSatisfaction.hint":
      "hard requirements met",
    "showcase.edumatch.overview.metrics.explainability.label": "Explainability",
    "showcase.edumatch.overview.metrics.explainability.hint":
      "factors sum to composite",
    "showcase.edumatch.overview.metrics.fairness.label": "Fairness",
    "showcase.edumatch.overview.metrics.fairness.hint":
      "max twin-pair score delta",
    "showcase.edumatch.overview.metrics.rankingStability.label":
      "Ranking stability",
    "showcase.edumatch.overview.metrics.rankingStability.hint":
      "order preserved under noise",
    "showcase.edumatch.overview.dimensions.kicker": "What it measures",
    "showcase.edumatch.overview.dimensions.title":
      "Five benchmark dimensions",
    "showcase.edumatch.overview.dimensions.matchRelevance.name":
      "Match relevance",
    "showcase.edumatch.overview.dimensions.matchRelevance.question":
      "Do the top recommendations agree with a labeled ground truth?",
    "showcase.edumatch.overview.dimensions.constraintSatisfaction.name":
      "Constraint satisfaction",
    "showcase.edumatch.overview.dimensions.constraintSatisfaction.question":
      "Does every recommendation actually meet the student's hard requirements?",
    "showcase.edumatch.overview.dimensions.explainability.name":
      "Explainability",
    "showcase.edumatch.overview.dimensions.explainability.question":
      "Does every recommendation state exactly why it appears?",
    "showcase.edumatch.overview.dimensions.fairness.name": "Fairness",
    "showcase.edumatch.overview.dimensions.fairness.question":
      "Do two equally-qualified tutors score identically regardless of an unrelated tag?",
    "showcase.edumatch.overview.dimensions.rankingStability.name":
      "Ranking stability",
    "showcase.edumatch.overview.dimensions.rankingStability.question":
      "Does adding an unrelated candidate leave the existing order unchanged?",
    "showcase.edumatch.overview.method.kicker": "Method",
    "showcase.edumatch.overview.method.title": "Why the ranking is trustworthy",
    "showcase.edumatch.overview.method.determinism.title": "Determinism",
    "showcase.edumatch.overview.method.determinism.body":
      "The engine is pure: no database, no clock, no randomness. Every distance is Haversine over fixed synthetic coordinates, and rating is Bayesian-damped toward a neutral prior so a handful of five-star reviews cannot outrank a long, consistently strong track record.",
    "showcase.edumatch.overview.method.adjustableWeights.title":
      "Adjustable weights",
    "showcase.edumatch.overview.method.adjustableWeights.body":
      "Default weights (distance 30% · subject 25% · level 15% · rating 20% · verification 10%) are a starting point, not a fixed policy — the Match Explorer lets you move them and re-rank live, using this exact engine.",
    "showcase.edumatch.overview.method.sensitiveAttributes.title":
      "Sensitive attributes",
    "showcase.edumatch.overview.method.sensitiveAttributes.body":
      "The engine models qualification and logistics only: subject, level, language, availability, mode/distance, rating, and verification. It has no field for age, gender, ethnicity, disability, religion, or any other protected attribute — there is nothing to weight, by construction, not by a filter bolted on afterward.",
    "showcase.edumatch.overview.honesty.kicker": "Honesty",
    "showcase.edumatch.overview.honesty.title": "Limitations",
    "showcase.edumatch.overview.honesty.panelTitle":
      "what this benchmark does not prove",
    "showcase.edumatch.overview.honesty.limitations.p1":
      "Ground truth (fixtures/labels.json) is hand-reviewed against a small, hand-authored fixture set — it demonstrates the method, not statistical significance at scale.",
    "showcase.edumatch.overview.honesty.limitations.p2":
      'Fairness here means "blind to an attribute the engine was never given" (the cohort tag). It does not certify fairness across attributes a production system might inadvertently correlate with — that requires real-world data audits this benchmark cannot provide.',
    "showcase.edumatch.overview.honesty.limitations.p3":
      "Latency figures are representative reference timings from a fixed run, not live measurements — the engine itself runs in low single-digit milliseconds against this fixture size.",
    "showcase.edumatch.overview.scores.matchRelevance.method":
      "Share of student needs whose full ranked order exactly matches the hand-reviewed label in fixtures/labels.json.",
    "showcase.edumatch.overview.scores.constraintSatisfaction.method":
      "Share of ranked results that satisfy every hard constraint (subject, level, language, availability, mode/distance) — measured across every need, not assumed.",
    "showcase.edumatch.overview.scores.explainabilityCoverage.method":
      "Share of ranked results whose per-factor contributions sum exactly to the displayed composite score.",
    "showcase.edumatch.overview.scores.fairness.method":
      "Maximum composite-score difference between the constraint-identical twin tutors (T-01/T-04) across every need where both are eligible. 0 means the engine is blind to the only attribute that differs between them (cohort tag).",
    "showcase.edumatch.overview.scores.rankingStability.method":
      "Whether adding an unrelated, constraint-failing tutor to the candidate pool leaves the existing ranking order unchanged.",
    "showcase.edumatch.explorer.pageHeader.kicker": "Explorer",
    "showcase.edumatch.explorer.pageHeader.title": "Match explorer",
    "showcase.edumatch.explorer.pageHeader.description":
      "Runs the real matching engine in your browser against synthetic fixtures. Pick a need, inspect why each tutor ranks where they do, and move the weights to see the ranking change live.",
    "showcase.edumatch.explorer.section.kicker": "Live",
    "showcase.edumatch.explorer.section.title": "Rank, inspect, adjust",
    "showcase.edumatch.explorer.panelTitle": "match explorer",
    "showcase.edumatch.matchExplorer.studentNeed": "Student need",
    "showcase.edumatch.matchExplorer.weightsLabel": "Weights (adjust and re-rank)",
    "showcase.edumatch.matchExplorer.weight.distance": "Distance",
    "showcase.edumatch.matchExplorer.weight.subject": "Subject",
    "showcase.edumatch.matchExplorer.weight.level": "Level",
    "showcase.edumatch.matchExplorer.weight.rating": "Rating",
    "showcase.edumatch.matchExplorer.weight.verified": "Verified",
    "showcase.edumatch.matchExplorer.reset": "Reset to defaults",
    "showcase.edumatch.matchExplorer.ranked": "Ranked ({count}) — {needLabel}",
    "showcase.edumatch.matchExplorer.noTutor":
      "No tutor satisfies every requirement for this need — see the excluded list below for why.",
    "showcase.edumatch.matchExplorer.verified": "Verified",
    "showcase.edumatch.matchExplorer.excluded": "Excluded ({count})",
    "showcase.edumatch.journey.pageHeader.kicker": "Journey",
    "showcase.edumatch.journey.pageHeader.title": "Inquiry → proposal → booking",
    "showcase.edumatch.journey.pageHeader.description":
      "The same journey, viewed from three roles. This is where matching output meets trust, permissions, and business workflow — the part a bare ranking algorithm never has to solve.",
    "showcase.edumatch.journey.section.demo.kicker": "Multi-role",
    "showcase.edumatch.journey.section.demo.title": "Walk the journey",
    "showcase.edumatch.journey.panel.demo":
      "safe demo mode — no network calls, nothing stored",
    "showcase.edumatch.journey.section.why.kicker": "Why it matters",
    "showcase.edumatch.journey.section.why.title": "Trust, not just ranking",
    "showcase.edumatch.journey.student.title": "Student",
    "showcase.edumatch.journey.student.body":
      "Trusts that a recommended tutor is genuinely qualified and available — not just highly rated.",
    "showcase.edumatch.journey.tutor.title": "Tutor",
    "showcase.edumatch.journey.tutor.body":
      "Trusts that proposals reach students whose needs they can actually meet, and that ratings reflect real match quality.",
    "showcase.edumatch.journey.moderator.title": "Moderator",
    "showcase.edumatch.journey.moderator.body":
      "Needs visibility into every booking and a way to intervene — the flag action here stands in for a real trust & safety workflow.",
    "showcase.edumatch.journeySim.demoBadge":
      "Safe demo mode — no real booking or payment",
    "showcase.edumatch.journeySim.aria.perspective": "Perspective",
    "showcase.edumatch.journeySim.role.student": "Student",
    "showcase.edumatch.journeySim.role.tutor": "Tutor",
    "showcase.edumatch.journeySim.role.moderator": "Moderator",
    "showcase.edumatch.journeySim.step.inquiry.title": "Inquiry",
    "showcase.edumatch.journeySim.step.inquiry.detail":
      "Student describes their need (subject, level, availability).",
    "showcase.edumatch.journeySim.step.proposal.title": "Proposal",
    "showcase.edumatch.journeySim.step.proposal.detail":
      "A matched tutor sends a proposal: rate, plan, and time slot.",
    "showcase.edumatch.journeySim.step.booking.title": "Booking",
    "showcase.edumatch.journeySim.step.booking.detail":
      "Student accepts the proposal and the session is booked.",
    "showcase.edumatch.journeySim.step.logged.title": "Session logged",
    "showcase.edumatch.journeySim.step.logged.detail":
      "Booking appears on every role's dashboard and in the audit trail.",
    "showcase.edumatch.journeySim.action.sendInquiry": "Send inquiry",
    "showcase.edumatch.journeySim.action.tutorSendsProposal": "Tutor sends proposal",
    "showcase.edumatch.journeySim.action.acceptBook": "Accept & book",
    "showcase.edumatch.journeySim.bookingComplete": "Booking complete",
    "showcase.edumatch.journeySim.reset": "Reset",
    "showcase.edumatch.journeySim.flag.unflag": "Unflag booking",
    "showcase.edumatch.journeySim.flag.flagForReview": "Flag booking for review",
    "showcase.edumatch.journeySim.flaggedNotice":
      "Flagged for review — in production this would pause payout and notify trust & safety. Here it only toggles local demo state.",
    "showcase.edumatch.fairness.pageHeader.kicker": "Fairness",
    "showcase.edumatch.fairness.pageHeader.title":
      "A twin pair, and an edge case with no answer",
    "showcase.edumatch.fairness.pageHeader.description":
      "Fairness here means the engine is provably blind to an attribute it was never given. The no-qualified-tutor case shows the engine can say 'nobody' instead of forcing a bad match.",
    "showcase.edumatch.fairness.section.method.kicker": "Method",
    "showcase.edumatch.fairness.section.method.title":
      "The constraint-identical twin pair",
    "showcase.edumatch.fairness.panel.title":
      "{twinA} · {twinB} — identical qualifications, different cohort tag",
    "showcase.edumatch.fairness.method.intro":
      "Tutors {twinA} and {twinB} are fixture-designed to be identical on every matching attribute (subjects, levels, languages, modes, availability, location, rating, verification) and differ only in a neutral {cohort} tag the engine never reads. Any score difference between them would mean the engine is reacting to something outside its declared factors.",
    "showcase.edumatch.fairness.table.need": "Need",
    "showcase.edumatch.fairness.table.twinA": "{twinA} composite",
    "showcase.edumatch.fairness.table.twinB": "{twinB} composite",
    "showcase.edumatch.fairness.table.delta": "Delta",
    "showcase.edumatch.fairness.table.excluded": "excluded",
    "showcase.edumatch.fairness.table.bothExcluded": "both excluded together",
    "showcase.edumatch.fairness.maxDelta":
      "Measured maximum delta across every need: {value}.",
    "showcase.edumatch.fairness.section.edge.kicker": "Edge case",
    "showcase.edumatch.fairness.section.edge.title": "When nobody qualifies",
    "showcase.edumatch.fairness.edge.body":
      "No fixture tutor teaches {subject}. Every one of the {count} tutors is excluded on the subject constraint, and the engine returns an empty ranked list rather than relaxing a requirement to force a result. Showing 'no match' honestly is part of what constraint satisfaction means here.",
    "showcase.edumatch.fairness.edge.table.tutor": "Tutor",
    "showcase.edumatch.fairness.edge.table.excludedBecause": "Excluded because",
    "showcase.edumatch.caseStudy.pageHeader.kicker": "Case study",
    "showcase.edumatch.caseStudy.pageHeader.title":
      "From a tutoring marketplace to an explainable matching benchmark",
    "showcase.edumatch.caseStudy.pageHeader.description":
      "The insight worth keeping was never the payments stack — it was how the ranking is built and explained.",
    "showcase.edumatch.caseStudy.section.evolution.kicker": "Evolution",
    "showcase.edumatch.caseStudy.section.evolution.title":
      "What was ported, what wasn't",
    "showcase.edumatch.caseStudy.table.stage": "Stage",
    "showcase.edumatch.caseStudy.table.stack": "Stack",
    "showcase.edumatch.caseStudy.table.idea": "Core idea",
    "showcase.edumatch.caseStudy.table.limit": "Where it hit a wall",
    "showcase.edumatch.caseStudy.evolution.personalProject.stage":
      "Personal project",
    "showcase.edumatch.caseStudy.evolution.personalProject.stack":
      "Next.js · Prisma/Postgres · Stripe Connect · geocoding",
    "showcase.edumatch.caseStudy.evolution.personalProject.idea":
      "A full tutoring marketplace: intake, tutor discovery, quotes, Stripe-split payments, disputes, verification, notifications.",
    "showcase.edumatch.caseStudy.evolution.personalProject.limit":
      "The matching algorithm itself — the actual product insight — was buried inside a large, credentialed, stateful app that can't be shown publicly as-is.",
    "showcase.edumatch.caseStudy.evolution.benchmark.stage": "This benchmark",
    "showcase.edumatch.caseStudy.evolution.benchmark.stack":
      "Pure JS engine · synthetic fixtures · client-side demo",
    "showcase.edumatch.caseStudy.evolution.benchmark.idea":
      "Extract just the matching logic, make it explainable and adjustable, and prove it with deterministic tests instead of a live marketplace.",
    "showcase.edumatch.caseStudy.evolution.benchmark.limit":
      "Deliberately no accounts, payments, geocoding, or verification — the Journey page simulates the workflow shape without any of the real infrastructure.",
    "showcase.edumatch.caseStudy.section.architecture.kicker": "Architecture",
    "showcase.edumatch.caseStudy.section.architecture.title":
      "How the benchmark is built",
    "showcase.edumatch.caseStudy.architecture.constraintsFirst.title":
      "Constraints first, scoring second",
    "showcase.edumatch.caseStudy.architecture.constraintsFirst.body":
      "Hard requirements (subject, level, language, availability, mode/distance) are checked before any scoring happens. A tutor who fails one is never ranked — and the reason is recorded, not discarded.",
    "showcase.edumatch.caseStudy.architecture.explainable.title":
      "Explainable by construction",
    "showcase.edumatch.caseStudy.architecture.explainable.body":
      "Every ranked result carries a factor-by-factor breakdown (value × weight = contribution) that sums exactly to its composite score — there is no hidden step between 'why' and 'what.'",
    "showcase.edumatch.caseStudy.architecture.oneEngine.title":
      "One engine, two consumers",
    "showcase.edumatch.caseStudy.architecture.oneEngine.body":
      "The engine is a single ESM module imported by the Node test suite, the fixture generator, and the Showcase's client-side Match Explorer — there is no second implementation to drift out of sync.",
    "showcase.edumatch.caseStudy.architecture.dampedRating.title":
      "Damped rating",
    "showcase.edumatch.caseStudy.architecture.dampedRating.body":
      "The legacy algorithm normalised rating as avg / 5, which let a single five-star review outrank a tutor with forty consistently strong ones. This version damps toward a neutral prior so review count matters.",
    "showcase.edumatch.caseStudy.section.tradeoffs.kicker": "Tradeoffs",
    "showcase.edumatch.caseStudy.section.tradeoffs.title":
      "What we gave up, and why",
    "showcase.edumatch.caseStudy.tradeoffs.noLiveMarketplace.title":
      "No live marketplace in public",
    "showcase.edumatch.caseStudy.tradeoffs.noLiveMarketplace.body":
      "The public surface cannot create a real booking or move real money. That rules out 'try it against real tutors' demos, but it's the only honest way to publish a matching demo without a moderated, credentialed backend.",
    "showcase.edumatch.caseStudy.tradeoffs.smallFixture.title":
      "Small, hand-reviewed fixture set",
    "showcase.edumatch.caseStudy.tradeoffs.smallFixture.body":
      "Twelve tutors and six needs are enough to demonstrate the method precisely — a deliberate twin pair, a tight-availability case, a no-qualified-tutor case — but they are not a statistically representative population.",
    "showcase.edumatch.caseStudy.section.lessons.kicker": "Lessons",
    "showcase.edumatch.caseStudy.section.lessons.title":
      "Lessons from the legacy system",
    "showcase.edumatch.caseStudy.lessons.explainability.title":
      "Explainability is a design decision, not a feature",
    "showcase.edumatch.caseStudy.lessons.explainability.body":
      "The legacy scorer produced a single number. Retrofitting an explanation after the fact is much harder than building the factor breakdown as the primary output from day one, which is what this version does.",
    "showcase.edumatch.caseStudy.lessons.fairness.title":
      "Fairness needs a provable test, not a policy statement",
    "showcase.edumatch.caseStudy.lessons.fairness.body":
      "Saying \"the algorithm doesn't use protected attributes\" is a claim. A constraint-identical twin pair that must score identically is a test. See the Fairness page.",
    "showcase.edumatch.caseStudy.lessons.production.title":
      "Toward a real production version",
    "showcase.edumatch.caseStudy.lessons.production.badge": "evidence-first",
    "showcase.edumatch.caseStudy.towardProduction.0":
      "Real provider adapters (an LLM for scripts, a render worker for video) implementing the same ScriptProvider/RenderProvider interface, gated behind explicit flags and a cost confirmation step.",
    "showcase.edumatch.caseStudy.towardProduction.1":
      "Real asset storage, licensing, and rights verification for any non-synthetic media.",
    "showcase.edumatch.caseStudy.towardProduction.2":
      "Durable queue/worker infrastructure so a job survives a process restart, with the same state machine and idempotent-retry semantics enforced server-side.",
    "showcase.edumatch.caseStudy.towardProduction.3":
      "Audit logging and access control around who can approve or reject a run at each gate.",
  },
  nl: {},
  fr: {},
  de: {},
  lb: {},
};

export default edumatchDictionaries;
