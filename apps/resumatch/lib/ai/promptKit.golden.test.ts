import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { renderExtractPrompt } from "../extraction/ai/prompts";
import { renderCategorizePrompt } from "../profile/ai/categorize/prompts";
import { renderRewritePrompt } from "../profile/ai/prompts";
import { renderCoverLetterPrompt } from "../tailoring/ai/coverLetter/prompts";
import { renderTailorPrompt } from "../tailoring/ai/prompts";
import { renderJobFetchPrompt } from "../tailoring/jobFetchAi/prompts";
import { renderJobMetaPrompt } from "../tailoring/jobMetaAi/prompts";

/**
 * Golden prompts (#524). sha256 of each domain's rendered system prompt and
 * user prompt, plus its cache key, for fixed inputs.
 *
 * Every value except jobMeta's was captured on `main` before the prompts
 * moved onto lib/ai/promptKit.ts, so this proves the move changed no prompt
 * text and no cache key. jobMeta's values are job_meta@2, which adds the
 * "no tools" rule (its user prompt hash is unchanged).
 *
 * If this fails, a prompt's wording changed. That's allowed, but bump that
 * domain's prompt version (the bump rule is in lib/extraction/versions.ts)
 * and update the value here.
 */

const h = (s: string) => createHash("sha256").update(s).digest("hex");
const long = "y".repeat(20000);
const cases: Record<
  string,
  { system: string; user: string; cacheKey: string }
> = {
  extract: renderExtractPrompt("Jane Doe\nEngineer at Acme"),
  extractLong: renderExtractPrompt(long),
  extractEmpty: renderExtractPrompt(""),
  categorize: renderCategorizePrompt(["TypeScript", "Nursing"]),
  categorizeEmpty: renderCategorizePrompt([]),
  rewriteWrite: renderRewritePrompt({
    currentSummary: "",
    profileText: "Engineer",
    tone: "friendly",
  }),
  rewriteRewrite: renderRewritePrompt({
    currentSummary: "I build <<<RESUMATCH_PROFILE_TEXT things",
    profileText: "Engineer",
    tone: "concise",
    instructions: "focus on backend",
  }),
  coverDefault: renderCoverLetterPrompt("profile", "job"),
  coverNl: renderCoverLetterPrompt("profile", long, "warm", "detailed", "nl"),
  coverInstructions: renderCoverLetterPrompt("profile", "job", "formal", "standard", null, "lead with backend"),
  tailor: renderTailorPrompt("profile", "job"),
  tailorFull: renderTailorPrompt(long, long, "lead with backend", "fr"),
  tailorLowFit: renderTailorPrompt("profile", "job", null, "nl", true),
  jobFetch: renderJobFetchPrompt("https://example.com/job/1"),
  jobMeta: renderJobMetaPrompt("Backend Engineer at Acme"),
};

/** [sha256(system), sha256(user), cacheKey] */
const golden: Record<string, [string, string, string]> = {
  extract: [
    "b1eaa9e95e19a671cebd088772acce11a752e3cd1735989abe4362c562927da4",
    "9f29a449d2c128b85111b85f138e23ae5c7bad06bba36957b664d15c9404b8aa",
    "58f8d65bb810e98c3c4301d9f462244d4b8f1a615063f8f318b259d68343ccb0",
  ],
  extractLong: [
    "b1eaa9e95e19a671cebd088772acce11a752e3cd1735989abe4362c562927da4",
    "5758d8464877ebf7d0a3fdb2d171b8107df4d5e816cb9a63d2d921c96aa44ea5",
    "256a9c2cd15533b7ba029e41a45b7e0a97161ffca76f131187eef84d9078f50a",
  ],
  extractEmpty: [
    "b1eaa9e95e19a671cebd088772acce11a752e3cd1735989abe4362c562927da4",
    "23f5c24adb1feb551d94e7d92058fbb6929ed9a86300869d8d6fd6ab9b027cfd",
    "bf46c741d6a57df8b22feac140f062ce92d6f6757cd70ded01ceed16135d41f6",
  ],
  categorize: [
    "5764cafeac26669802e69549914b2c8b229d9db781fc58d2665630e40d43aa34",
    "72a7e3bd1fa7133e7327d01e44a9ed6cfa0dd734dcc3b737b5da76b424008edf",
    "083f21f357fbfab178231f35ff831108a3f66a1681c402b4f0d3e8db38cd35cd",
  ],
  categorizeEmpty: [
    "5764cafeac26669802e69549914b2c8b229d9db781fc58d2665630e40d43aa34",
    "3d225511759bc55f01fb5020880e2a3bbd52178537114d972619dd2ef3d5e043",
    "4dc6d7298281871eceea3c1a2e7f58e0e160ec15e4142babbab731e364ec57c0",
  ],
  rewriteWrite: [
    "f17ccda9a0bd9d7b9e314f0f013d07735d8c74d78ef163c52352bc8f7573abb3",
    "b8de7e5eb8aa5a55c5ca19dbc33ffacca4c0e589590441ce9ccff455af5b7733",
    "14be03525e0831d41d8ccd4893251718e2f36a083c6fe7ab48a8714651b2f771",
  ],
  rewriteRewrite: [
    "f0df6ec57c3c529d18509af33b85629f1eafa9818b0567cf55a0b50965acebc4",
    "c2cf9f877e584995e62f678028f7034f026e3bf9f32fb26050d32ea0975e7983",
    "f0f2bacdca21b18531c0420e1a2dc4d8af6968065e86627e6229b9874e8707b7",
  ],
  coverDefault: [
    "76aa2c4b5f51d226d837fe3ecdaa7b60ea072ecdfc0c49c4b73595111765d387",
    "0215bacb2ac4f82a00baa48109361f01ffb0ba8f3c60e20a777affabe4e91cef",
    "512238aa7c3544469f13d4c9f9baf53cc0899582595a4c59b1a44a39ced276c6",
  ],
  coverNl: [
    "44053efa1e00cd5ba8001a77aac2cac8a03ca4d374042122779e826ad45701cb",
    "6f88d26d2ac1c04ffb0164325e0714171dc0cb5001e7002273d4856afe038e39",
    "248f6413f0b88b00f454d14b925ffd47f26c8822f0ef91709b0de7a2ec615ecf",
  ],
  // cover_letter@5 (#928): the application note, fenced like the CV's.
  coverInstructions: [
    "76aa2c4b5f51d226d837fe3ecdaa7b60ea072ecdfc0c49c4b73595111765d387",
    "4afa082202c6eeaea2fc2b2bc25abf9dad25fbddd55f8eec455bddbc0edab10d",
    "83a9e572207f8293047a2d4e50b9003b54c764e77835d80539308b267be3bd82",
  ],
  tailor: [
    "c82b677732b69c44335939d19087063c5932c97f6b06ebd0688b1cc097a9f316",
    "8b3173be23606e5fd93af4a88284ced0690430d4fd1ffa62e0e08e190d8996c7",
    "c0a6383be576a3b6166eb5808ea5ec9470437eea7a23017358e4bac700191c78",
  ],
  tailorFull: [
    "a71391cc04388273430d04b9dc29f46cb57db2eed65877d54c4390e3cf8ee058",
    "e7d845365ec6104ed775a3387ebcc6adbbc6cc77477b1205729449a09714be1f",
    "b416ddfdb126686af3a431de545e74dfd0a98c074b83fa637cfe2e20b3d57c10",
  ],
  // tailor_resume@5: the LOW-FIT rule. @6 (#928) relabels the instructions
  // block "for this application", so every tailor user prompt moved; the
  // system prompts did not.
  tailorLowFit: [
    "53b3f7f1e6be50bef5afc7cc533df9242bfb8f19bc420dced58e989a9697b93e",
    "8b3173be23606e5fd93af4a88284ced0690430d4fd1ffa62e0e08e190d8996c7",
    "87cf26d46a9484e44cbb728c12d8cbcbc70ddaa65e0d13816100fb25d31c7139",
  ],
  jobFetch: [
    "c7a6a8bfd85b3d045d680f3445f86ecd315e8a4350e5bf600770baa518599111",
    "1a65083c3319a81fa457d861afcd8313233a750858daa983e47a322e0164551d",
    "d2fa6badcca2f359e3452db0f5249fab3307d65a323dc62b198e843ee0ef9250",
  ],
  jobMeta: [
    "9bddc6abe2d40e6ed7815fd60a1af78ad0c0393e955d1d286b39913af7d5263a",
    "455dce1f99b655e4dc6485c231feb363047964b4446ecd0f79549c3c590cbe7b",
    "bfaf7aecb1930ea668c7b1b1fe3506d556e7671c2888068054e09b7d79a6ded7",
  ],
};

describe("prompt golden values", () => {
  it("covers every case", () => {
    expect(Object.keys(cases).sort()).toEqual(Object.keys(golden).sort());
  });

  for (const [name, rendered] of Object.entries(cases)) {
    it(`${name}: system prompt, user prompt and cache key are unchanged`, () => {
      expect([h(rendered.system), h(rendered.user), rendered.cacheKey]).toEqual(
        golden[name]
      );
    });
  }
});
