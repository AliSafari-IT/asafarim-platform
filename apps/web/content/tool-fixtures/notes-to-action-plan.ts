import { ACTION_PLAN_SCHEMA_VERSION, type ActionPlan, type ActionPlanInputRaw } from "../../lib/tools/action-plan/schema";
import { splitPlanSources } from "../../lib/tools/action-plan/sources";

/**
 * Synthetic example for Notes → Action Plan. The notes name people (N5, N8)
 * and a fixed date (N2) on purpose: the plan quotes the date as a fact but
 * assigns nobody, adds no other dates, and turns the undecided sign-off and
 * the horizon-vs-date tension into open questions. No real team or data.
 */
export const actionPlanExampleNotes = `Kick-off: moving the help centre to the new docs platform
- Goal: all 140 help articles live on the new platform before the old contract ends on 30 November.
- Decided: we keep the current URL structure so search links don't break.
- Decided: no new articles during the move, fixes only.
- Sam mentioned the export tool from the old platform drops images.
- Need an inventory of articles and which ones are outdated.
- Redirects have to be tested before we switch DNS.
- Priya can review the style guide, but only after the inventory exists.
- Worry: translations (NL, FR) may not export cleanly.
- Who signs off on the switch? Not decided.
- Should we archive articles with no views in the last year?
- Try importing 10 articles first to see what breaks.`;

export const actionPlanExampleInput: ActionPlanInputRaw = {
  notes: actionPlanExampleNotes,
  outcome: "The help centre runs on the new platform with no broken links.",
  horizon: "About 8 weeks",
  participants: "Sam (support lead), Priya (content), Ahmed (web)",
  depth: "standard",
};

const sources = splitPlanSources({
  notes: actionPlanExampleNotes,
  outcome: actionPlanExampleInput.outcome,
  horizon: actionPlanExampleInput.horizon,
  participants: actionPlanExampleInput.participants,
});

export const actionPlanExampleOutput: ActionPlan = {
  schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
  title: "Move the help centre to the new docs platform",
  objective: "All 140 help articles run on the new platform, at their current URLs, before the old contract ends on 30 November.",
  scope:
    "In scope: inventory, a pilot import, fixing image and translation export, the full import, redirects, and the switch. Out of scope, as decided: new articles during the move.",
  sources,
  tasks: [
    {
      id: "T1",
      title: "Build an inventory of the help articles",
      description: "List every article with its views and last-updated date, and mark the outdated ones.",
      effort: { low: 1, high: 2, unit: "days" },
      basis: "fact",
      sourceIds: ["N6"],
    },
    {
      id: "T2",
      title: "Pilot-import 10 articles",
      description: "Import a small batch first to see what breaks, including whether images survive the export.",
      effort: { low: 2, high: 4, unit: "hours" },
      basis: "fact",
      sourceIds: ["N12", "N5"],
    },
    {
      id: "T3",
      title: "Fix or work around the image export problem",
      description: "Find a way to carry images across, or re-attach them after import.",
      effort: { low: 1, high: 3, unit: "days" },
      basis: "inference",
      sourceIds: ["N5"],
      rationale: "The notes say the export tool drops images; assumes they must be restored before the full import.",
    },
    {
      id: "T4",
      title: "Review the style guide for the new platform",
      description: "Check the style guide still fits the new platform's formatting.",
      effort: { low: 4, high: 8, unit: "hours" },
      basis: "fact",
      sourceIds: ["N8"],
    },
    {
      id: "T5",
      title: "Check that NL and FR translations export cleanly",
      description: "Include translated articles in the pilot and compare them with the originals.",
      basis: "inference",
      sourceIds: ["N9"],
      rationale: "The notes raise translations as a worry; assumes this needs checking before the full import.",
    },
    {
      id: "T6",
      title: "Import all help articles",
      description: "Run the full import once images and translations are handled.",
      basis: "fact",
      sourceIds: ["N2"],
    },
    {
      id: "T7",
      title: "Set up redirects that keep the current URL structure",
      description: "Map every old article URL to the same path on the new platform.",
      basis: "fact",
      sourceIds: ["N3", "N7"],
    },
    {
      id: "T8",
      title: "Test the redirects",
      description: "Follow a sample of links from search results and confirm none break.",
      basis: "fact",
      sourceIds: ["N7"],
    },
    {
      id: "T9",
      title: "Switch DNS to the new platform",
      description: "Point the help centre domain at the new platform.",
      basis: "fact",
      sourceIds: ["N7"],
    },
    {
      id: "T10",
      title: "Agree who signs off the switch",
      description: "Decide who approves switching DNS, before it happens.",
      basis: "recommendation",
      sourceIds: ["N10"],
      rationale: "The notes say sign-off isn't decided; a switch like this needs someone to approve it.",
    },
  ],
  dependencies: [
    { id: "E1", from: "T1", to: "T4", reason: "The style guide review waits for the inventory.", basis: "fact", sourceIds: ["N8"] },
    {
      id: "E2",
      from: "T2",
      to: "T3",
      reason: "The pilot shows what the image problem actually is.",
      basis: "inference",
      sourceIds: ["N5", "N12"],
      rationale: "Assumes the pilot is where the image problem gets diagnosed.",
    },
    {
      id: "E3",
      from: "T3",
      to: "T6",
      reason: "Images must work before the full import.",
      basis: "inference",
      sourceIds: ["N5"],
      rationale: "Assumes articles shouldn't go live without their images.",
    },
    {
      id: "E4",
      from: "T5",
      to: "T6",
      reason: "Translations must export cleanly before the full import.",
      basis: "inference",
      sourceIds: ["N9"],
      rationale: "Assumes translated articles move in the same import.",
    },
    {
      id: "E5",
      from: "T1",
      to: "T6",
      reason: "The inventory says which articles to import.",
      basis: "inference",
      sourceIds: ["N6"],
      rationale: "Assumes outdated articles may be left out, depending on Q2.",
    },
    { id: "E6", from: "T7", to: "T8", reason: "Redirects have to exist before they can be tested.", basis: "fact", sourceIds: ["N7"] },
    { id: "E7", from: "T8", to: "T9", reason: "Redirects are tested before switching DNS.", basis: "fact", sourceIds: ["N7"] },
    {
      id: "E8",
      from: "T10",
      to: "T9",
      reason: "Someone approves the switch before it happens.",
      basis: "recommendation",
      sourceIds: ["N10"],
      rationale: "Suggested so the switch isn't made without an agreed sign-off.",
    },
  ],
  risks: [
    { id: "R1", risk: "Translated articles (NL, FR) may not export cleanly.", mitigation: "Include translated articles in the pilot import.", basis: "fact", sourceIds: ["N9"] },
    { id: "R2", risk: "The old platform's export tool drops images.", mitigation: "Check every imported article for missing images.", basis: "fact", sourceIds: ["N5"] },
    {
      id: "R3",
      risk: "The contract end on 30 November is fixed, so a slipped import has no buffer.",
      mitigation: "Run the pilot early so problems surface while there's time.",
      basis: "inference",
      sourceIds: ["N2"],
      rationale: "The date comes from the notes; the lack of slack is an inference.",
    },
  ],
  decisions: [
    { id: "D1", decision: "Keep the current URL structure so search links don't break.", basis: "fact", sourceIds: ["N3"] },
    { id: "D2", decision: "No new articles during the move; fixes only.", basis: "fact", sourceIds: ["N4"] },
  ],
  questions: [
    { id: "Q1", question: "Who signs off on the switch?", sourceIds: ["N10"] },
    { id: "Q2", question: "Should articles with no views in the last year be archived instead of moved?", sourceIds: ["N11"] },
    { id: "Q3", question: "Does a horizon of about 8 weeks leave enough time before 30 November?", sourceIds: ["C2", "N2"] },
  ],
  milestones: [
    {
      id: "M1",
      title: "Content ready to import",
      taskIds: ["T1", "T2", "T3", "T4", "T5"],
      basis: "recommendation",
      sourceIds: [],
      rationale: "A natural checkpoint: everything the full import depends on is done.",
    },
    { id: "M2", title: "Switched with no broken links", taskIds: ["T6", "T7", "T8", "T9", "T10"], basis: "constraint", sourceIds: ["C1"] },
  ],
};
