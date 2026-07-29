import { describe, expect, it } from "vitest";
import { emptySpecification } from "@asafarim/appbuilder-schema";
import { buildSpecIndex } from "./specIndex";
import {
  MEMORY_LIMITS,
  describeReference,
  emptyMemoryFacts,
  forgetSourceMessages,
  rememberAssumption,
  rememberPreference,
  rememberReference,
  type MemoryReference,
} from "./memory";

const index = buildSpecIndex(
  {
    ...emptySpecification({ name: "Eval App", slug: "eval-app" }),
    pages: [{ id: "home", name: "Home", path: "home", components: [], archived: false }],
  },
  1,
);

function reference(overrides: Partial<MemoryReference> = {}): MemoryReference {
  return {
    phrase: "the title",
    targetId: "pages.home.name",
    property: "name",
    recordedValue: "Home",
    pageId: "home",
    sourceMessageIds: ["msg_1"],
    specificationVersionNumber: 1,
    recordedAt: "2026-07-29T10:00:00.000Z",
    ...overrides,
  };
}

describe("rememberReference", () => {
  it("keeps one entry per phrase+target, refreshed to the latest value", () => {
    let facts = rememberReference(emptyMemoryFacts(), reference({ recordedValue: "Home" }));
    facts = rememberReference(facts, reference({ recordedValue: "Experiences" }));

    expect(facts.references).toHaveLength(1);
    expect(facts.references[0].recordedValue).toBe("Experiences");
  });

  it("matches phrases case- and whitespace-insensitively when de-duplicating", () => {
    let facts = rememberReference(emptyMemoryFacts(), reference({ phrase: "the title" }));
    facts = rememberReference(facts, reference({ phrase: "  The   Title " }));
    expect(facts.references).toHaveLength(1);
  });

  it("keeps distinct phrases pointing at the same target", () => {
    let facts = rememberReference(emptyMemoryFacts(), reference({ phrase: "the title" }));
    facts = rememberReference(facts, reference({ phrase: "Home" }));
    expect(facts.references).toHaveLength(2);
  });

  it("stays bounded, evicting the oldest reference", () => {
    let facts = emptyMemoryFacts();
    for (let i = 0; i < MEMORY_LIMITS.MAX_REFERENCES + 5; i += 1) {
      facts = rememberReference(facts, reference({ phrase: `phrase ${i}` }));
    }
    expect(facts.references).toHaveLength(MEMORY_LIMITS.MAX_REFERENCES);
    expect(facts.references[0].phrase).toBe(`phrase ${MEMORY_LIMITS.MAX_REFERENCES + 4}`);
  });

  it("truncates an over-long phrase and its source-id list rather than storing them whole", () => {
    const facts = rememberReference(
      emptyMemoryFacts(),
      reference({ phrase: "x".repeat(500), sourceMessageIds: Array.from({ length: 20 }, (_, i) => `m${i}`) }),
    );
    expect(facts.references[0].phrase).toHaveLength(MEMORY_LIMITS.MAX_PHRASE_CHARS);
    expect(facts.references[0].sourceMessageIds).toHaveLength(MEMORY_LIMITS.MAX_SOURCE_MESSAGE_IDS);
  });
});

describe("assumptions and preferences", () => {
  it("keeps one entry per assumption statement and per preference key", () => {
    let facts = rememberAssumption(emptyMemoryFacts(), {
      statement: "Mapped 'blue' to the app palette.",
      sourceMessageIds: ["msg_1"],
      specificationVersionNumber: 1,
      recordedAt: "2026-07-29T10:00:00.000Z",
    });
    facts = rememberAssumption(facts, {
      statement: "Mapped 'blue' to the app palette.",
      sourceMessageIds: ["msg_2"],
      specificationVersionNumber: 2,
      recordedAt: "2026-07-29T11:00:00.000Z",
    });
    expect(facts.assumptions).toHaveLength(1);
    expect(facts.assumptions[0].sourceMessageIds).toEqual(["msg_2"]);

    facts = rememberPreference(facts, {
      key: "palette",
      value: "brand",
      sourceMessageIds: ["msg_3"],
      specificationVersionNumber: 2,
      recordedAt: "2026-07-29T11:00:00.000Z",
    });
    expect(facts.preferences).toHaveLength(1);
  });
});

describe("forgetSourceMessages", () => {
  it("removes a fact whose only citation was deleted", () => {
    const facts = rememberReference(emptyMemoryFacts(), reference({ sourceMessageIds: ["msg_1"] }));
    expect(forgetSourceMessages(facts, ["msg_1"]).references).toHaveLength(0);
  });

  it("keeps a fact that still has a surviving citation, dropping only the deleted id", () => {
    const facts = rememberReference(emptyMemoryFacts(), reference({ sourceMessageIds: ["msg_1", "msg_2"] }));
    const kept = forgetSourceMessages(facts, ["msg_1"]);
    expect(kept.references).toHaveLength(1);
    expect(kept.references[0].sourceMessageIds).toEqual(["msg_2"]);
  });

  it("does not mutate the facts it was given", () => {
    const facts = rememberReference(emptyMemoryFacts(), reference({ sourceMessageIds: ["msg_1", "msg_2"] }));
    forgetSourceMessages(facts, ["msg_1"]);
    expect(facts.references[0].sourceMessageIds).toEqual(["msg_1", "msg_2"]);
  });
});

describe("describeReference", () => {
  it("renders a checkable statement naming the target and its current value", () => {
    const statement = describeReference(reference(), index.byTargetId.get("pages.home.name"));
    expect(statement).toBe('"the title" refers to the "Home" page\'s title (currently "Home")');
  });

  it("falls back to the raw target id when the target is gone", () => {
    expect(describeReference(reference({ targetId: "pages.gone.name" }), undefined)).toContain("pages.gone.name");
  });
});
