import { describe, expect, it } from "vitest";
import {
  COPILOT_INTENTS,
  DEFAULT_INTENT_ID,
  FIRST_USE_CALLOUT,
  GENERATE_EXPECTATION,
  LOW_CONFIDENCE,
  MIN_SOURCE_LENGTH,
  TASK_INTENTS,
  aiDisabledState,
  assumptionCount,
  copilotHref,
  copilotSteps,
  defaultAcceptanceNotice,
  defaultAccepted,
  destinationState,
  evidenceFor,
  evidenceText,
  generateBlock,
  impactCounts,
  impactSentence,
  inboxLandingCount,
  inboxLandingSentence,
  intentFor,
  kindForIntent,
  postApplyOutcome,
  providerNotice,
  TARGET_REF,
  unresolvedSentence,
  type CopilotFlowState,
  type WorkflowOperation,
} from "./workflow";

/* ── fixtures ───────────────────────────────────────────────────────── */

const SOURCE =
  "Kickoff call. Ship the marketing site before the trade show. Legal must review the copy first.";

function create(
  title: string,
  patch: Partial<WorkflowOperation> & { parentRef?: string } = {},
): WorkflowOperation {
  const { parentRef, ...rest } = patch;
  return {
    op: "create_task",
    confidence: 0.9,
    citations: [{ span: [0, 13], assumption: false, quote: "Kickoff call." }],
    fields: { title, ...(parentRef ? { parentRef } : {}) },
    ...rest,
  };
}

/** A create with the proposal-local ref later operations point at. */
function created(
  ref: string,
  title: string,
  patch: Partial<WorkflowOperation> & { parentRef?: string } = {},
): WorkflowOperation {
  return { ...create(title, patch), ref };
}

function linkBetween(fromRef: string, toRef: string): WorkflowOperation {
  return { ...link(), fromRef, toRef };
}

function assumed(title: string, confidence = 0.4): WorkflowOperation {
  return {
    op: "create_task",
    confidence,
    citations: [{ span: null, assumption: true }],
    fields: { title },
  };
}

function link(): WorkflowOperation {
  return {
    op: "link_tasks",
    confidence: 0.8,
    citations: [{ span: [14, 60], assumption: false }],
  };
}

function update(): WorkflowOperation {
  return {
    op: "update_task",
    confidence: 0.7,
    citations: [{ span: [0, 13], assumption: false }],
    fields: {},
  };
}

function flow(patch: Partial<CopilotFlowState> = {}): CopilotFlowState {
  return {
    sourceLength: 0,
    projectId: null,
    projectCount: 0,
    hasProposal: false,
    ...patch,
  };
}

/* ── intents ────────────────────────────────────────────────────────── */

describe("intents", () => {
  it("offers the plain-language outcomes from the issue", () => {
    expect(COPILOT_INTENTS.map((i) => i.id)).toEqual([
      "extract_plan",
      "decompose",
      "acceptance_criteria",
      "summarize",
      "risks_open_questions",
      "project_brief",
      "changed_digest",
    ]);
  });

  it("never leaves the page without a workflow for an unknown intent", () => {
    expect(intentFor("nonsense").id).toBe(DEFAULT_INTENT_ID);
    expect(intentFor(null).id).toBe(DEFAULT_INTENT_ID);
    expect(intentFor(undefined).id).toBe(DEFAULT_INTENT_ID);
  });

  it("resolves a known intent and maps it to an AI kind", () => {
    expect(intentFor("decompose").id).toBe("decompose");
    expect(kindForIntent("decompose")).toBe("decompose");
  });

  it("exposes only task-scoped intents as contextual task actions", () => {
    expect(TASK_INTENTS.every((i) => i.aboutATask)).toBe(true);
    expect(TASK_INTENTS.map((i) => i.id)).toContain("decompose");
    expect(TASK_INTENTS.map((i) => i.id)).not.toContain("extract_plan");
  });

  it("gives every intent an entry label, an outcome and real examples", () => {
    for (const intent of COPILOT_INTENTS) {
      expect(intent.entryLabel.length).toBeGreaterThan(0);
      expect(intent.outcome.length).toBeGreaterThan(0);
      expect(intent.sourceHint.length).toBeGreaterThan(0);
      expect(intent.examples.length).toBeGreaterThan(0);
      for (const example of intent.examples) {
        expect(example.trim().length).toBeGreaterThanOrEqual(MIN_SOURCE_LENGTH);
      }
    }
  });

  it("builds contextual entry links carrying intent, task and origin", () => {
    expect(copilotHref("acme")).toBe("/w/acme/copilot");
    expect(copilotHref("acme", { intent: "decompose", taskId: "t1", from: "task_detail" })).toBe(
      "/w/acme/copilot?intent=decompose&task=t1&from=task_detail",
    );
  });
});

/* ── the guided steps ───────────────────────────────────────────────── */

describe("copilotSteps", () => {
  it("starts by pointing at the source on an empty workspace", () => {
    const steps = copilotSteps(flow());
    expect(steps.map((s) => s.id)).toEqual(["source", "outcome", "destination", "review"]);
    expect(steps[0].state).toBe("current");
    expect(steps.filter((s) => s.state === "current")).toHaveLength(1);
  });

  it("moves to the destination once there is usable source text", () => {
    const steps = copilotSteps(flow({ sourceLength: 200 }));
    expect(steps[0].state).toBe("done");
    expect(steps[1].state).toBe("done");
    expect(steps[2].state).toBe("current");
  });

  it("marks review current once a destination is chosen", () => {
    const steps = copilotSteps(flow({ sourceLength: 200, projectId: "p1", projectCount: 1 }));
    expect(steps[3].state).toBe("current");
  });

  it("marks review done once a proposal is on screen", () => {
    const steps = copilotSteps(
      flow({ sourceLength: 200, projectId: "p1", projectCount: 1, hasProposal: true }),
    );
    expect(steps.every((s) => s.state === "done")).toBe(true);
  });
});

/* ── destination: the no-project dead end ───────────────────────────── */

describe("destinationState", () => {
  it("offers creating a project when there are none and the viewer may", () => {
    const state = destinationState({ projectCount: 0, projectId: null, canCreateProject: true });
    expect(state.kind).toBe("no_projects_can_create");
    expect(state.actions).toContain("create_project");
    expect(state.description).toMatch(/create one/i);
  });

  it("tells a viewer who cannot create a project who can", () => {
    const state = destinationState({ projectCount: 0, projectId: null, canCreateProject: false });
    expect(state.kind).toBe("no_projects_read_only");
    expect(state.actions).toEqual(["ask_admin"]);
    expect(state.description).toMatch(/admin/i);
  });

  it("asks a one-project workspace to confirm the destination", () => {
    const state = destinationState({ projectCount: 1, projectId: null, canCreateProject: true });
    expect(state.kind).toBe("choose");
    expect(state.actions).toEqual(["pick_project"]);
  });

  it("is ready once a destination is picked, whatever the project count", () => {
    for (const projectCount of [1, 5]) {
      const state = destinationState({ projectCount, projectId: "p1", canCreateProject: true });
      expect(state.kind).toBe("ready");
      expect(state.actions).toEqual([]);
      expect(state.description).toMatch(/until you approve/i);
    }
  });
});

/* ── why Generate is blocked ────────────────────────────────────────── */

describe("generateBlock", () => {
  it("explains an empty textarea rather than silently disabling", () => {
    const block = generateBlock(flow({ projectId: "p1", projectCount: 1 }));
    expect(block?.code).toBe("no_source");
    expect(block?.message).toMatch(/paste/i);
  });

  it("explains source text that is too short", () => {
    const block = generateBlock(flow({ sourceLength: 3, projectId: "p1", projectCount: 1 }));
    expect(block?.code).toBe("short_source");
  });

  it("names creating a project as the fix in a no-project workspace", () => {
    const block = generateBlock(flow({ sourceLength: 200 }));
    expect(block?.code).toBe("no_destination");
    expect(block?.message).toMatch(/create a project/i);
  });

  it("names picking a project as the fix when projects exist", () => {
    const block = generateBlock(flow({ sourceLength: 200, projectCount: 3 }));
    expect(block?.code).toBe("no_destination");
    expect(block?.message).toMatch(/choose the project/i);
  });

  it("allows generating once source and destination are both there", () => {
    expect(generateBlock(flow({ sourceLength: 200, projectId: "p1", projectCount: 1 }))).toBeNull();
  });

  it("sets the expectation that nothing is created by generating", () => {
    expect(GENERATE_EXPECTATION).toMatch(/nothing is created until you approve/i);
  });
});

/* ── facts vs assumptions ───────────────────────────────────────────── */

describe("evidence", () => {
  it("treats a real cited span as grounded in the source", () => {
    const ev = evidenceFor(create("Brief the designer"));
    expect(ev.grounded).toBe(true);
    expect(ev.label).toBe("From your notes");
    expect(ev.span).toEqual([0, 13]);
  });

  it("labels an uncited operation an assumption regardless of confidence", () => {
    const ev = evidenceFor(assumed("Book the venue", 0.99));
    expect(ev.grounded).toBe(false);
    expect(ev.label).toBe("Assumption");
  });

  it("does not count a citation flagged as an assumption as grounding", () => {
    const op: WorkflowOperation = {
      op: "create_task",
      confidence: 0.9,
      citations: [{ span: [0, 5], assumption: true }],
      fields: { title: "Guessed" },
    };
    expect(evidenceFor(op).grounded).toBe(false);
  });

  it("returns the actual words of the source for a grounded operation", () => {
    expect(evidenceText(SOURCE, create("Brief the designer"))).toBe("Kickoff call.");
  });

  it("refuses a span that points outside the source", () => {
    const op = create("x", { citations: [{ span: [0, 9999], assumption: false }] });
    expect(evidenceText(SOURCE, op)).toBeNull();
  });

  it("falls back to the model's quote when there is no usable span", () => {
    const op: WorkflowOperation = {
      op: "create_task",
      confidence: 0.9,
      citations: [{ span: [5, 2], assumption: false, quote: "call" }],
      fields: { title: "x" },
    };
    expect(evidenceText(SOURCE, op)).toBe("call");
  });

  it("counts the assumptions in a proposal", () => {
    expect(assumptionCount([create("a"), assumed("b"), link()])).toBe(1);
  });
});

/* ── default acceptance ─────────────────────────────────────────────── */

describe("defaultAccepted", () => {
  it("accepts everything grounded in the source", () => {
    const ops = [create("a"), create("b"), link()];
    expect(defaultAccepted(ops)).toEqual([0, 1, 2]);
    expect(defaultAcceptanceNotice(ops)).toBeNull();
  });

  it("holds back low-confidence assumptions rather than pre-approving them", () => {
    const ops = [create("a"), assumed("guess", 0.3)];
    expect(defaultAccepted(ops)).toEqual([0]);
    expect(defaultAcceptanceNotice(ops)).toMatch(/start unticked/i);
  });

  it("still accepts a confident assumption the model stands behind", () => {
    const ops = [assumed("likely", LOW_CONFIDENCE + 0.1)];
    expect(defaultAccepted(ops)).toEqual([0]);
  });
});

/* ── impact of apply ────────────────────────────────────────────────── */

describe("impact", () => {
  const ops = [
    created("r1", "Design"),
    created("r2", "Build"),
    created("r3", "Sub A", { parentRef: "r1" }),
    update(),
    linkBetween("r1", "r2"),
  ];

  it("counts only the accepted subset", () => {
    expect(impactCounts(ops, [0, 1, 2, 3, 4])).toEqual({
      tasks: 2,
      subtasks: 1,
      updates: 1,
      dependencies: 1,
      orphanedChildren: 0,
      skippedLinks: 0,
      total: 5,
    });
    expect(impactCounts(ops, [0])).toEqual({
      tasks: 1,
      subtasks: 0,
      updates: 0,
      dependencies: 0,
      orphanedChildren: 0,
      skippedLinks: 0,
      total: 1,
    });
  });

  // ── what apply will actually do (PR #377 review) ───────────────────────
  // applyProposal resolves refs as the selected creates run: an unselected
  // parent becomes `parentId: null`, an unavailable link endpoint drops the
  // link. The confirmation has to say that, not the naive tick count.

  it("counts a child whose parent is unselected as the top-level task it becomes", () => {
    const counts = impactCounts(ops, [2]);
    expect(counts.subtasks).toBe(0);
    expect(counts.tasks).toBe(1);
    expect(counts.orphanedChildren).toBe(1);
    expect(unresolvedSentence(counts)).toMatch(/top level/i);
  });

  it("does not count a link whose endpoint is unselected", () => {
    const counts = impactCounts(ops, [0, 4]);
    expect(counts.dependencies).toBe(0);
    expect(counts.skippedLinks).toBe(1);
    expect(counts.total).toBe(1);
    expect(impactSentence(counts, "WEB")).toBe("This will create 1 task in WEB.");
    expect(unresolvedSentence(counts)).toMatch(/skipped/i);
  });

  it("only resolves refs created earlier, exactly as apply iterates", () => {
    // The child comes before its parent, so apply creates it top-level.
    const forward = [created("c", "Child", { parentRef: "p" }), created("p", "Parent")];
    expect(impactCounts(forward, [0, 1]).subtasks).toBe(0);
    expect(impactCounts(forward, [0, 1]).orphanedChildren).toBe(1);
  });

  it("resolves the targeted existing task as a real parent", () => {
    const sub = [created("s1", "Step one", { parentRef: TARGET_REF })];
    expect(impactCounts(sub, [0]).tasks).toBe(1);
    expect(impactCounts(sub, [0], { externalRefs: [TARGET_REF] })).toMatchObject({
      tasks: 0,
      subtasks: 1,
      orphanedChildren: 0,
    });
  });

  it("says nothing extra when the selection resolves cleanly", () => {
    expect(unresolvedSentence(impactCounts(ops, [0, 1, 2, 3, 4]))).toBeNull();
  });

  it("summarizes the impact in plain language naming the destination", () => {
    const sentence = impactSentence(impactCounts(ops, [0, 1, 2, 4]), "WEB · Website redesign");
    expect(sentence).toBe(
      "This will create 2 tasks, 1 subtask and 1 dependency in WEB · Website redesign.",
    );
  });

  it("mentions updates to existing tasks separately from creations", () => {
    expect(impactSentence(impactCounts(ops, [0, 3]), "WEB")).toBe(
      "This will create 1 task and update 1 existing task in WEB.",
    );
  });

  it("says plainly that an empty selection would change nothing", () => {
    expect(impactSentence(impactCounts(ops, []), "WEB")).toMatch(/would change nothing/i);
  });

  it("routes every created task into the Inbox, matching the capture rule", () => {
    // AI may not set an assignee or a due date, so an applied proposal never
    // arrives planned — lib/capture/inbox.ts sends it to triage.
    expect(inboxLandingCount(ops, [0, 1, 2, 3, 4])).toBe(3);
    expect(inboxLandingCount(ops, [3, 4])).toBe(0);
    expect(inboxLandingSentence(3)).toMatch(/wait in your Inbox/i);
    expect(inboxLandingSentence(0)).toBeNull();
  });
});

/* ── after the apply ────────────────────────────────────────────────── */

describe("postApplyOutcome", () => {
  it("never leaves the user on a bare status line", () => {
    const out = postApplyOutcome({
      accepted: 7,
      total: 7,
      destinationLabel: "WEB · Website redesign",
      inboxCount: 7,
    });
    expect(out.summary).toMatch(/Applied all 7/);
    expect(out.actions.map((a) => a.id)).toEqual([
      "open_inbox",
      "open_project",
      "my_work",
      "another",
    ]);
    expect(out.needsTriage).toBe(true);
  });

  it("says what was not applied on a partial acceptance", () => {
    const out = postApplyOutcome({
      accepted: 3,
      total: 7,
      destinationLabel: "WEB",
      inboxCount: 3,
    });
    expect(out.summary).toMatch(/Applied 3 of 7/);
    expect(out.summary).toMatch(/changed nothing/i);
  });

  it("drops the triage route when nothing new needs planning", () => {
    const out = postApplyOutcome({
      accepted: 1,
      total: 1,
      destinationLabel: "WEB",
      inboxCount: 0,
    });
    expect(out.needsTriage).toBe(false);
    expect(out.actions.map((a) => a.id)).not.toContain("open_inbox");
    expect(out.actions.map((a) => a.id)).toContain("another");
  });
});

/* ── degraded + disabled ────────────────────────────────────────────── */

describe("provider and kill-switch states", () => {
  it("keeps the degraded warning visible and explains the consequence", () => {
    expect(providerNotice({ degraded: true })).toMatch(/offline model/i);
    expect(providerNotice({ degraded: true })).toMatch(/assumptions/i);
  });

  it("says nothing when the provider was healthy", () => {
    expect(providerNotice({})).toBeNull();
    expect(providerNotice({ degraded: false })).toBeNull();
  });

  it("links an authorized role to settings when AI is off", () => {
    const admin = aiDisabledState(true);
    expect(admin.settingsLink).toBe(true);
    expect(admin.description).toMatch(/AI settings/);
  });

  it("does not dangle a settings link in front of somebody who cannot use it", () => {
    const member = aiDisabledState(false);
    expect(member.settingsLink).toBe(false);
    expect(member.description).toMatch(/admin/i);
  });

  it("insists the rest of the product still works without AI", () => {
    for (const state of [aiDisabledState(true), aiDisabledState(false)]) {
      expect(state.description).toMatch(/works exactly the same/i);
    }
  });
});

/* ── first-use education ────────────────────────────────────────────── */

describe("first-use callout", () => {
  it("says AI proposes and the human approves", () => {
    expect(FIRST_USE_CALLOUT.title).toMatch(/never edits your workspace directly/i);
    expect(FIRST_USE_CALLOUT.body).toMatch(/review/i);
    expect(FIRST_USE_CALLOUT.body).toMatch(/rejecting changes nothing/i);
  });
});
