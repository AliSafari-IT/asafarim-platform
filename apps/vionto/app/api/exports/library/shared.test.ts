import { describe, expect, it } from "vitest";
import {
  ASPECT_RATIOS,
  FORMATS,
  MODES,
  RESOLUTIONS,
  buildLibraryOrderBy,
  buildLibraryWhere,
  parseLibraryFilters,
  parseSort,
} from "./shared";

function params(query: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams(query);
}

describe("parseLibraryFilters", () => {
  it("defaults every filter to empty/undefined when no params are given", () => {
    const filters = parseLibraryFilters(params());

    expect(filters).toEqual({
      mode: null,
      aspectRatio: null,
      projectId: null,
      versionId: null,
      resolution: null,
      format: null,
      visualStyle: null,
      storyMode: null,
      emotionalTone: null,
      renderMode: null,
      durationMin: undefined,
      durationMax: undefined,
      createdFrom: undefined,
      createdTo: undefined,
      search: "",
    });
  });

  it("reads every recognized query param", () => {
    const filters = parseLibraryFilters(
      params({
        mode: "cinematic",
        aspectRatio: "16:9",
        projectId: "p1",
        versionId: "v1",
        resolution: "1080p",
        format: "mp4",
        visualStyle: "film_grain",
        storyMode: "memory_film",
        emotionalTone: "nostalgic",
        renderMode: "social",
        durationMin: "10",
        durationMax: "60",
        createdFrom: "2026-01-01",
        createdTo: "2026-01-31",
        search: "  birthday  ",
      })
    );

    expect(filters.mode).toBe("cinematic");
    expect(filters.projectId).toBe("p1");
    expect(filters.versionId).toBe("v1");
    expect(filters.resolution).toBe("1080p");
    expect(filters.format).toBe("mp4");
    expect(filters.visualStyle).toBe("film_grain");
    expect(filters.storyMode).toBe("memory_film");
    expect(filters.emotionalTone).toBe("nostalgic");
    expect(filters.renderMode).toBe("social");
    expect(filters.durationMin).toBe(10);
    expect(filters.durationMax).toBe(60);
    expect(filters.createdFrom).toEqual(new Date("2026-01-01"));
    expect(filters.createdTo).toEqual(new Date("2026-01-31"));
    // Trimmed, unlike the raw query value.
    expect(filters.search).toBe("birthday");
  });

  it("ignores an invalid date rather than throwing", () => {
    const filters = parseLibraryFilters(params({ createdFrom: "not-a-date" }));
    expect(filters.createdFrom).toBeUndefined();
  });

  it("ignores a negative or non-numeric duration bound", () => {
    expect(parseLibraryFilters(params({ durationMin: "-5" })).durationMin).toBeUndefined();
    expect(parseLibraryFilters(params({ durationMax: "not-a-number" })).durationMax).toBeUndefined();
  });

  it("accepts a duration bound of exactly 0", () => {
    expect(parseLibraryFilters(params({ durationMin: "0" })).durationMin).toBe(0);
  });
});

describe("parseSort", () => {
  it("defaults to newest for null, empty, or unrecognized input", () => {
    expect(parseSort(null)).toBe("newest");
    expect(parseSort("")).toBe("newest");
    expect(parseSort("not-a-real-sort")).toBe("newest");
  });

  it("accepts every declared sort option", () => {
    for (const sort of ["newest", "oldest", "duration_desc", "duration_asc", "size_desc", "size_asc"]) {
      expect(parseSort(sort)).toBe(sort);
    }
  });
});

describe("buildLibraryOrderBy", () => {
  it("always carries id as a deterministic secondary tiebreaker", () => {
    for (const sort of ["newest", "oldest", "duration_desc", "duration_asc", "size_desc", "size_asc"] as const) {
      const orderBy = buildLibraryOrderBy(sort);
      expect(orderBy).toHaveLength(2);
      expect(orderBy[1]).toEqual({ id: "asc" });
    }
  });

  it("maps each sort option to the correct primary column and direction", () => {
    expect(buildLibraryOrderBy("newest")[0]).toEqual({ createdAt: "desc" });
    expect(buildLibraryOrderBy("oldest")[0]).toEqual({ createdAt: "asc" });
    expect(buildLibraryOrderBy("duration_desc")[0]).toEqual({ durationSeconds: "desc" });
    expect(buildLibraryOrderBy("duration_asc")[0]).toEqual({ durationSeconds: "asc" });
    expect(buildLibraryOrderBy("size_desc")[0]).toEqual({ fileSizeBytes: "desc" });
    expect(buildLibraryOrderBy("size_asc")[0]).toEqual({ fileSizeBytes: "asc" });
  });
});

describe("buildLibraryWhere", () => {
  const emptyFilters = parseLibraryFilters(params());

  it("always scopes to the given userId and completed render jobs — never trusts a caller-supplied scope", () => {
    const where = buildLibraryWhere(emptyFilters, "u1");
    expect(where).toMatchObject({ userId: "u1", renderJob: { is: { state: "completed" } } });
  });

  it("applies no extra filters when nothing is set", () => {
    const where = buildLibraryWhere(emptyFilters, "u1");
    expect(Object.keys(where).sort()).toEqual(["renderJob", "userId"]);
  });

  it("passes through project and version filters unconditionally (no validation set to check against)", () => {
    const filters = parseLibraryFilters(params({ projectId: "p1", versionId: "v1" }));
    const where = buildLibraryWhere(filters, "u1");
    expect(where).toMatchObject({ projectId: "p1", versionId: "v1" });
  });

  it("only applies mode/aspectRatio/resolution/format when the value is in the known set", () => {
    const valid = buildLibraryWhere(
      parseLibraryFilters(params({ mode: "cinematic", aspectRatio: "16:9", resolution: "1080p", format: "mp4" })),
      "u1"
    );
    expect(valid).toMatchObject({ userMode: "cinematic", aspectRatio: "16:9", resolution: "1080p", format: "mp4" });

    const invalid = buildLibraryWhere(
      parseLibraryFilters(
        params({ mode: "not-a-mode", aspectRatio: "21:9", resolution: "8k", format: "avi" })
      ),
      "u1"
    );
    expect(invalid).not.toHaveProperty("userMode");
    expect(invalid).not.toHaveProperty("aspectRatio");
    expect(invalid).not.toHaveProperty("resolution");
    expect(invalid).not.toHaveProperty("format");
  });

  it("only applies visualStyle/storyMode/emotionalTone/renderMode when the value is in the known set", () => {
    const valid = buildLibraryWhere(
      parseLibraryFilters(
        params({
          visualStyle: "film_grain",
          storyMode: "memory_film",
          emotionalTone: "nostalgic",
          renderMode: "social",
        })
      ),
      "u1"
    );
    expect(valid).toMatchObject({
      visualStyle: "film_grain",
      storyMode: "memory_film",
      emotionalTone: "nostalgic",
      renderMode: "social",
    });

    const invalid = buildLibraryWhere(
      parseLibraryFilters(
        params({
          visualStyle: "bogus_style",
          storyMode: "bogus_mode",
          emotionalTone: "bogus_tone",
          renderMode: "bogus_render",
        })
      ),
      "u1"
    );
    expect(invalid).not.toHaveProperty("visualStyle");
    expect(invalid).not.toHaveProperty("storyMode");
    expect(invalid).not.toHaveProperty("emotionalTone");
    expect(invalid).not.toHaveProperty("renderMode");
  });

  it("builds an inclusive durationSeconds range from durationMin/durationMax", () => {
    const where = buildLibraryWhere(parseLibraryFilters(params({ durationMin: "10", durationMax: "60" })), "u1");
    expect(where.durationSeconds).toEqual({ gte: 10, lte: 60 });
  });

  it("omits durationSeconds entirely when neither bound is set", () => {
    const where = buildLibraryWhere(emptyFilters, "u1");
    expect(where).not.toHaveProperty("durationSeconds");
  });

  it("builds an inclusive createdAt range from createdFrom/createdTo", () => {
    const where = buildLibraryWhere(
      parseLibraryFilters(params({ createdFrom: "2026-01-01", createdTo: "2026-01-31" })),
      "u1"
    ) as { createdAt: { gte: Date; lte: Date } };
    expect(where.createdAt.gte).toEqual(new Date("2026-01-01"));
    expect(where.createdAt.lte).toEqual(new Date("2026-01-31"));
  });

  it("searches previewTitle, filename, and storyKeywords, scoped case-insensitively", () => {
    const where = buildLibraryWhere(parseLibraryFilters(params({ search: "birthday" })), "u1") as {
      OR: unknown[];
    };
    expect(where.OR).toEqual([
      { previewTitle: { contains: "birthday", mode: "insensitive" } },
      { filename: { contains: "birthday", mode: "insensitive" } },
      { storyKeywords: { array_contains: ["birthday"] } },
    ]);
  });

  it("omits the OR search clause when there is no search term", () => {
    const where = buildLibraryWhere(emptyFilters, "u1");
    expect(where).not.toHaveProperty("OR");
  });
});

describe("known-value sets", () => {
  it("match the sets the render pipeline actually writes", () => {
    expect([...MODES]).toEqual(["cinematic", "slideshow", "social"]);
    expect([...ASPECT_RATIOS]).toEqual(["16:9", "9:16", "1:1", "4:3"]);
    expect([...RESOLUTIONS]).toEqual(["720p", "1080p", "4k"]);
    expect([...FORMATS]).toEqual(["mp4", "mov", "webm"]);
  });
});
