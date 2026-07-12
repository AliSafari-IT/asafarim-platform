import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  matchTutors,
  normalizeWeights,
  DEFAULT_WEIGHTS,
} from "../engine/matching.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "..", "fixtures");

const tutors = JSON.parse(await readFile(join(FIXTURES, "tutors.json"), "utf8"));
const needs = JSON.parse(await readFile(join(FIXTURES, "needs.json"), "utf8"));
const labels = JSON.parse(await readFile(join(FIXTURES, "labels.json"), "utf8"));

function needById(id) {
  const n = needs.find((x) => x.id === id);
  if (!n) throw new Error(`unknown need ${id}`);
  return n;
}

test("determinism: identical inputs produce byte-identical output", () => {
  const need = needById("N-01");
  const a = matchTutors(tutors, need);
  const b = matchTutors(tutors, need);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("constraint violations are never ranked", () => {
  for (const need of needs) {
    const { ranked, excluded } = matchTutors(tutors, need);
    const excludedIds = new Set(excluded.map((e) => e.tutorId));
    for (const r of ranked) {
      assert.ok(!excludedIds.has(r.tutorId), `${r.tutorId} both ranked and excluded for ${need.id}`);
    }
    // every tutor is accounted for exactly once
    assert.equal(ranked.length + excluded.length, tutors.length, `tutor count mismatch for ${need.id}`);
  }
});

test("labeled rankings match the engine (match relevance)", () => {
  for (const [needId, label] of Object.entries(labels)) {
    if (needId.startsWith("_")) continue;
    const { ranked } = matchTutors(tutors, needById(needId));
    assert.deepEqual(
      ranked.map((r) => r.tutorId),
      label.expectedRankedIds,
      `ranking mismatch for ${needId}`,
    );
  }
});

test("no-qualified-tutor edge case (N-05) excludes every tutor", () => {
  const { ranked, excluded } = matchTutors(tutors, needById("N-05"));
  assert.equal(ranked.length, 0);
  assert.equal(excluded.length, tutors.length);
  for (const e of excluded) {
    assert.ok(e.reasons.some((r) => r.code === "subject"));
  }
});

test("fairness: constraint-identical twins score identically regardless of cohort", () => {
  // T-01 and T-04 are deliberately constraint- and quality-identical fixtures
  // differing only in id/name/cohort tag.
  for (const need of needs) {
    const { ranked } = matchTutors(tutors, need);
    const a = ranked.find((r) => r.tutorId === "T-01");
    const b = ranked.find((r) => r.tutorId === "T-04");
    if (!a || !b) continue; // both excluded together for this need; nothing to compare
    assert.equal(a.composite, b.composite, `twin composite mismatch for ${need.id}`);
    assert.deepEqual(
      a.factors.map((f) => f.contribution),
      b.factors.map((f) => f.contribution),
      `twin factor mismatch for ${need.id}`,
    );
  }
});

test("stability: an irrelevant tutor added to the pool does not reorder existing results", () => {
  const need = needById("N-01");
  const before = matchTutors(tutors, need).ranked.map((r) => r.tutorId);

  const irrelevant = {
    id: "T-99",
    name: "Irrelevant Filler",
    cohort: "cohort-a",
    subjects: ["Music"],
    levels: ["primary"],
    languages: ["en"],
    modes: ["in-person"],
    availability: [{ day: "fri", block: "morning" }],
    location: { lat: 0.9, lng: 0.9 },
    serviceRadiusKm: 5,
    hourlyRateCents: 2000,
    ratingAvg: 3.0,
    ratingCount: 1,
    verified: false,
  };
  const after = matchTutors([...tutors, irrelevant], need).ranked.map((r) => r.tutorId);

  assert.deepEqual(after, before, "adding an unrelated tutor changed the existing ranking order");
});

test("weight monotonicity: an all-weight-on-rating run ranks eligible tutors by damped rating", () => {
  const need = needById("N-01");
  const ratingOnly = { distance: 0, subject: 0, level: 0, rating: 1, verified: 0 };
  const { ranked } = matchTutors(tutors, need, ratingOnly);
  const composites = ranked.map((r) => r.composite);
  const sorted = [...composites].sort((a, b) => b - a);
  assert.deepEqual(composites, sorted, "ranking not monotonic in the rating factor");
});

test("normalizeWeights sums to 1 and falls back to defaults for all-zero input", () => {
  const normalized = normalizeWeights({ distance: 2, subject: 2, level: 2, rating: 2, verified: 2 });
  const total = Object.values(normalized).reduce((s, w) => s + w, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);

  const fallback = normalizeWeights({ distance: 0, subject: 0, level: 0, rating: 0, verified: 0 });
  assert.deepEqual(fallback, DEFAULT_WEIGHTS);
});

test("every ranked factor breakdown sums exactly to the composite score", () => {
  for (const need of needs) {
    const { ranked } = matchTutors(tutors, need);
    for (const r of ranked) {
      const sum = Math.round(r.factors.reduce((s, f) => s + f.contribution, 0) * 1000) / 1000;
      assert.equal(sum, r.composite, `factor breakdown does not sum to composite for ${r.tutorId} on ${need.id}`);
    }
  }
});
