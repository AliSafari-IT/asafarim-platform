import { describe, expect, it } from "vitest";
import { buildLetterLayout, letterDensity, letterWordCount } from "./coverLetterLayout";

const sender = { fullName: "Jane Doe", email: "jane@example.test", phone: null, baseLocation: "Genk, Belgium" };
const date = new Date("2026-11-20T23:30:00Z");

describe("buildLetterLayout", () => {
  it("builds sender, recipient, place and date, and subject from confirmed data", () => {
    const layout = buildLetterLayout(sender, { title: "Backend Engineer", employer: "Acme", structuredFields: null }, date, null);
    expect(layout).toEqual({
      sender: { name: "Jane Doe", lines: ["Genk, Belgium", "jane@example.test"] },
      recipient: ["Acme"],
      dateLine: "Genk, 20 November 2026",
      subject: "Application: Backend Engineer",
    });
  });

  it("uses a hand-typed job's contact and location", () => {
    const layout = buildLetterLayout(sender, { title: null, employer: "Acme", structuredFields: { contactName: "Ms. Smith", location: "Brussels" } }, date, "en");
    expect(layout.recipient).toEqual(["Ms. Smith", "Acme", "Brussels"]);
    expect(layout.subject).toBeNull();
  });

  it("leaves out what isn't known", () => {
    const layout = buildLetterLayout({ fullName: null, email: null, phone: null, baseLocation: null }, { title: "Engineer", employer: null }, date, "en");
    expect(layout.sender).toEqual({ name: null, lines: [] });
    expect(layout.recipient).toEqual([]);
    expect(layout.dateLine).toBe("20 November 2026");
  });

  it("localises the date and subject to the letter's language", () => {
    const job = { title: "Ingenieur", employer: "Acme" };
    expect(buildLetterLayout(sender, job, date, "nl").dateLine).toBe("Genk, 20 november 2026");
    expect(buildLetterLayout(sender, job, date, "nl").subject).toBe("Sollicitatie: Ingenieur");
    expect(buildLetterLayout(sender, job, date, "de").subject).toBe("Bewerbung als Ingenieur");
    expect(buildLetterLayout(sender, job, date, "fr").dateLine).toBe("Genk, 20 novembre 2026");
  });
});

describe("letterDensity", () => {
  it("steps down as the letter grows", () => {
    expect(letterDensity(270)).toBe("regular");
    expect(letterDensity(330)).toBe("compact");
    expect(letterDensity(420)).toBe("tight");
  });

  it("counts greeting, paragraphs and sign-off", () => {
    expect(letterWordCount({ greeting: "Dear Jane,", paragraphs: ["One two three.", "Four"], signOff: "Sincerely," })).toBe(7);
  });
});
