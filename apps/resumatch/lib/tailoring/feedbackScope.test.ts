import { describe, expect, it } from "vitest";
import { EMPTY_WRITING_PREFERENCES } from "../writingPreferences/contract";
import { parsePromotionRequest, preferencePromotionPayload, promotionFailed, resolvePromotions, suggestEvidenceTitle } from "./feedbackScope";

/** #932: the explicit "remember" choices on the Tailor review. */

const roles = [{ title: "Backend developer", employer: "Acme", startedOn: "2021-01" }];
const originalBullets = [["Built payment APIs in Node.js."]];

const resolve = (request: unknown, approved = [["Built payment APIs in Node.js.", "Ran the on-call rota for 6 engineers."]], origins = [[0, null]]) => {
  const parsed = parsePromotionRequest(request);
  if (!parsed.ok) return parsed;
  return resolvePromotions({
    request: parsed.value,
    roles,
    approvedBullets: approved,
    bulletOrigins: origins,
    originalBullets,
    savedPreferences: { ...EMPTY_WRITING_PREFERENCES, coverLetter: { ...EMPTY_WRITING_PREFERENCES.coverLetter, tone: "warm" } },
  });
};

const own = { experienceIndex: 0, bulletIndex: 1, kind: "RESPONSIBILITY", title: "On-call rota", detail: "Ran the on-call rota for 6 engineers." };

describe("promotions (#932)", () => {
  it("defaults to this application only: nothing to promote", () => {
    expect(resolve(undefined)).toEqual({ ok: true, value: { preference: null, background: [] } });
    expect(resolve({ preference: null, background: [] })).toEqual({ ok: true, value: { preference: null, background: [] } });
  });

  it("adds the candidate's own bullet to the background for its role, as reviewed", () => {
    const result = resolve({ background: [own] });
    expect(result).toMatchObject({
      ok: true,
      value: {
        background: [
          {
            feedbackKey: null,
            input: { kind: "RESPONSIBILITY", title: "On-call rota", detail: own.detail, experienceRef: roles[0] },
          },
        ],
      },
    });
  });

  it("names the AI suggestion an edited bullet came from", () => {
    const result = resolve(
      { background: [{ ...own, bulletIndex: 0, detail: "Built payment APIs in Node.js and Go." }] },
      [["Built payment APIs in Node.js and Go."]],
      [[0]],
    );
    expect(result).toMatchObject({ ok: true, value: { background: [{ feedbackKey: "bullet:0:0" }] } });
  });

  it("refuses an AI bullet kept as written, a bullet not on the CV, a foreign role, a repeat and too many", () => {
    expect(resolve({ background: [{ ...own, bulletIndex: 0 }] })).toMatchObject({ ok: false, error: { code: "background_target" } });
    expect(resolve({ background: [{ ...own, bulletIndex: 5 }] })).toMatchObject({ ok: false, error: { code: "background_target" } });
    expect(resolve({ background: [{ ...own, experienceIndex: 3 }] })).toMatchObject({ ok: false, error: { code: "background_target" } });
    expect(resolve({ background: [own, own] })).toMatchObject({ ok: false, error: { code: "background_target" } });
    expect(resolve({ background: [own, own, own, own] })).toMatchObject({ ok: false, error: { code: "too_many_background" } });
  });

  it("refuses motivation, contact details and an empty title, like the evidence form", () => {
    expect(resolve({ background: [{ ...own, kind: "MOTIVATION" }] })).toMatchObject({ error: { code: "background_input", field: "kind" } });
    expect(resolve({ background: [{ ...own, detail: "Call me on +32 470 12 34 56" }] })).toMatchObject({
      error: { code: "background_input", field: "contact_details" },
    });
    expect(resolve({ background: [{ ...own, title: " " }] })).toMatchObject({ error: { code: "background_input", field: "title_missing" } });
  });

  it("changes only the style notes it names, keeping every other saved preference", () => {
    const result = resolve({ preference: { baseRevisionId: "rev_1", cvStyleNote: "Short sentences, lead with results." } });
    expect(result).toMatchObject({
      ok: true,
      value: {
        preference: {
          baseRevisionId: "rev_1",
          prefs: {
            cv: { outputLanguage: null, styleNote: "Short sentences, lead with results." },
            coverLetter: { tone: "warm", styleNote: null },
          },
        },
      },
    });
  });

  it("refuses a style note that reads like a fact", () => {
    expect(resolve({ preference: { baseRevisionId: null, cvStyleNote: "Say I have 10 years of Kubernetes." } })).toMatchObject({
      ok: false,
      error: { code: "preference_input", field: "style_note_factual" },
    });
  });

  it("refuses malformed requests", () => {
    expect(parsePromotionRequest([])).toMatchObject({ ok: false });
    expect(parsePromotionRequest({ background: [{ experienceIndex: "0", bulletIndex: 0 }] })).toMatchObject({ ok: false });
    expect(parsePromotionRequest({ preference: { baseRevisionId: 5, cvStyleNote: "x" } })).toMatchObject({ ok: false });
  });

  it("sends only the style notes the candidate typed in, so a retry after a conflict keeps a newer untouched note", () => {
    const draft = { cvStyleNote: " Lead with results. ", letterStyleNote: "Old letter note", touched: { cv: true } };
    expect(preferencePromotionPayload(draft, "rev_2", true)).toEqual({ baseRevisionId: "rev_2", cvStyleNote: "Lead with results." });
    expect(preferencePromotionPayload({ ...draft, touched: {} }, "rev_2", true)).toBeNull();
    expect(preferencePromotionPayload({ ...draft, touched: { letter: true } }, null, false)).toBeNull();
    expect(preferencePromotionPayload({ ...draft, cvStyleNote: "  ", touched: { cv: true, letter: true } }, null, true)).toEqual({
      baseRevisionId: null,
      cvStyleNote: null,
      letterStyleNote: "Old letter note",
    });
    expect(preferencePromotionPayload(null, null, true)).toBeNull();
  });

  it("says when anything chosen failed", () => {
    expect(promotionFailed({ preference: { status: "saved", revisionNumber: 2 }, background: [] })).toBe(false);
    expect(promotionFailed({ preference: { status: "stale", revisionNumber: 3 }, background: [] })).toBe(true);
    expect(
      promotionFailed({
        preference: null,
        background: [{ experienceIndex: 0, bulletIndex: 0, feedbackKey: null, status: "too_many", evidenceId: null, revisionId: null }],
      }),
    ).toBe(true);
  });

  it("suggests a short title from the bullet's first words", () => {
    expect(suggestEvidenceTitle("Ran the on-call rota.")).toBe("Ran the on-call rota");
    const long = suggestEvidenceTitle("Migrated twelve legacy services from a shared VM to containers with zero downtime for customers");
    expect(long.length).toBeLessThanOrEqual(61);
    expect(long.endsWith("…")).toBe(true);
  });
});
