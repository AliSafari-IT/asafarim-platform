import { describe, expect, it } from "vitest";
import { MAX_MENTIONS, parseMentions, stripMentions } from "./mentions";

describe("parseMentions", () => {
  it("extracts distinct membership ids", () => {
    const body = "hey @[Ana](abcdefgh1234) and @[Bo](zzzz99001122), see @[Ana](abcdefgh1234)";
    expect(parseMentions(body)).toEqual(["abcdefgh1234", "zzzz99001122"]);
  });

  it("caps the number of distinct mentions", () => {
    const body = Array.from({ length: 40 }, (_, i) => `@[U${i}](member00000${i.toString().padStart(2, "0")})`).join(" ");
    expect(parseMentions(body).length).toBe(MAX_MENTIONS);
  });

  it("ignores plain @handles and malformed tokens", () => {
    expect(parseMentions("@notamention @[x](short) hello")).toEqual([]);
  });
});

describe("stripMentions", () => {
  it("renders mentions as @Name", () => {
    expect(stripMentions("ping @[Ana Díaz](abcdefgh1234) now")).toBe("ping @Ana Díaz now");
  });
});
