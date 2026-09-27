import { readDate, UNDATED } from "../../lib/tools/timeline/dates";
import { CITED_TIMELINE_SCHEMA_VERSION, type CitedTimeline, type TimelineInputRaw } from "../../lib/tools/timeline/schema";
import { splitSentences } from "../../lib/tools/timeline/sources";

/**
 * Synthetic example for Text → Cited Timeline, about a fictional library. It
 * deliberately has an exact date (S1), partial dates (season, decade, month),
 * a range (S8), two sources disagreeing (S4), an impossible range (S5), an
 * unreadable date (S6), and one uncited inference — so the example shows
 * precision, conflicts, and review, not just a tidy list. No real history.
 */
export const timelineExampleText = `The Riverside Library was founded on 12 March 1891 by the town council. A reading room opened in the spring of 1893. The library moved to the old grain exchange in the 1920s. According to the council minutes, the move happened in 1924, but a 1950 newsletter says the library moved in 1927. The second floor was added between 1958 and 1956. During the war years the library lent books to the field hospital. A children's wing opened in June 1971. The card catalogue was digitised from 1998 to 2003.`;

export const timelineExampleInput: TimelineInputRaw = {
  text: timelineExampleText,
  title: "The Riverside Library",
  audience: "Local history readers",
  detail: "standard",
};

export const timelineExampleOutput: CitedTimeline = {
  schemaVersion: CITED_TIMELINE_SCHEMA_VERSION,
  title: "The Riverside Library",
  summary:
    "From its founding in 1891 to a digitised catalogue in the early 2000s. Two accounts disagree about when the library moved, one range can't be right as written, and one date is too vague to place.",
  sources: splitSentences(timelineExampleText),
  events: [
    { id: "EV-01", title: "The library is founded by the town council", description: "", when: readDate("12 March 1891"), approximate: false, basis: "cited", sourceIds: ["S1"], confidence: "high" },
    { id: "EV-02", title: "A reading room opens", description: "", when: readDate("the spring of 1893"), approximate: false, basis: "cited", sourceIds: ["S2"], confidence: "high" },
    {
      id: "EV-03",
      title: "The library moves to the old grain exchange",
      description: "The text gives only the decade here; S4 has two more specific, conflicting years.",
      when: readDate("the 1920s"),
      approximate: false,
      basis: "cited",
      sourceIds: ["S3"],
      confidence: "medium",
    },
    {
      id: "EV-04",
      title: "The move, according to the council minutes",
      description: "",
      when: readDate("1924"),
      approximate: false,
      basis: "cited",
      sourceIds: ["S4"],
      confidence: "medium",
      uncertainty: "Contradicted by a 1950 newsletter (see the conflict).",
    },
    {
      id: "EV-05",
      title: "The move, according to a 1950 newsletter",
      description: "",
      when: readDate("1927"),
      approximate: false,
      basis: "cited",
      sourceIds: ["S4"],
      confidence: "low",
      uncertainty: "Contradicted by the council minutes (see the conflict).",
    },
    {
      id: "EV-06",
      title: "A second floor is added",
      description: "",
      when: readDate("between 1958 and 1956"),
      approximate: false,
      basis: "cited",
      sourceIds: ["S5"],
      confidence: "low",
      uncertainty: "The range ends before it starts, so at least one year is wrong.",
    },
    { id: "EV-07", title: "A children's wing opens", description: "", when: readDate("June 1971"), approximate: false, basis: "cited", sourceIds: ["S7"], confidence: "high" },
    { id: "EV-08", title: "The card catalogue is digitised", description: "", when: readDate("from 1998 to 2003"), approximate: false, basis: "cited", sourceIds: ["S8"], confidence: "high" },
    {
      id: "EV-09",
      title: "The library lends books to the field hospital",
      description: "",
      when: readDate("the war years"),
      approximate: false,
      basis: "cited",
      sourceIds: ["S6"],
      confidence: "low",
      uncertainty: "The text doesn't say which war or which years.",
    },
    {
      id: "EV-10",
      title: "The library outgrows its first building",
      description: "Not stated anywhere in the text: it's a reading of why the library moved.",
      when: UNDATED,
      approximate: false,
      basis: "inferred",
      sourceIds: [],
      confidence: "low",
      uncertainty: "Inferred from the move to the grain exchange; the text never says why the library moved or when it ran out of room.",
    },
  ],
  conflicts: [
    {
      id: "CF1",
      kind: "conflicting_dates",
      description: "The council minutes put the move in 1924; a 1950 newsletter says 1927. Both fit \"the 1920s\" in S3, so the text can't settle it.",
      eventIds: ["EV-04", "EV-05", "EV-03"],
      sourceIds: ["S4", "S3"],
    },
    { id: "CF2", kind: "impossible_range", description: "\"between 1958 and 1956\" ends before it starts.", eventIds: ["EV-06"], sourceIds: ["S5"] },
    { id: "CF3", kind: "ambiguous_date", description: "\"the war years\" can't be placed on a timeline without knowing which war.", eventIds: ["EV-09"], sourceIds: ["S6"] },
  ],
};
