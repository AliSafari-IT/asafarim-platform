import { describe, it, expect } from "vitest";
import {
  DEFAULT_THEME_PRESET,
  LAYOUTS_BY_TYPE,
  THEME_PRESETS,
  getLayoutOptions,
  isLayoutValidForType,
  isWideLayout,
  resolveLayoutForType,
  resolveThemePreset,
} from "../timeline-config";
import {
  TIMELINE_LAYOUTS,
  TIMELINE_TYPES,
  TIMELINE_THEME_PRESETS,
  TimelineInputSchema,
  ThemeSettingsSchema,
} from "../schemas";

describe("layouts per timeline type", () => {
  it("gives every timeline type exactly three layouts", () => {
    for (const type of TIMELINE_TYPES) {
      expect(LAYOUTS_BY_TYPE[type], `type ${type}`).toHaveLength(3);
    }
  });

  it("offers no duplicate layouts within a type", () => {
    for (const type of TIMELINE_TYPES) {
      const layouts = LAYOUTS_BY_TYPE[type];
      expect(new Set(layouts).size, `type ${type}`).toBe(3);
    }
  });

  it("only references layouts the schema actually accepts", () => {
    for (const type of TIMELINE_TYPES) {
      for (const layout of LAYOUTS_BY_TYPE[type]) {
        expect(TIMELINE_LAYOUTS).toContain(layout);
      }
    }
  });

  it("describes each option with a name, description, and icon", () => {
    for (const type of TIMELINE_TYPES) {
      for (const option of getLayoutOptions(type)) {
        expect(option.name.length).toBeGreaterThan(0);
        expect(option.description.length).toBeGreaterThan(0);
        expect(option.icon).toBeTruthy();
      }
    }
  });

  it("renames vertical to 'Vertical agenda' for calendar timelines only", () => {
    const calendar = getLayoutOptions("calendar").find((o) => o.id === "vertical");
    const general = getLayoutOptions("general").find((o) => o.id === "vertical");
    expect(calendar?.name).toBe("Vertical agenda");
    expect(general?.name).toBe("Vertical");
  });

  it("keeps every renderer reachable from at least one type", () => {
    const reachable = new Set(TIMELINE_TYPES.flatMap((type) => [...LAYOUTS_BY_TYPE[type]]));
    for (const layout of TIMELINE_LAYOUTS) {
      expect(reachable, `layout ${layout} is not offered by any type`).toContain(layout);
    }
  });
});

describe("changing the timeline type", () => {
  it("preserves the current layout when it stays valid", () => {
    // horizontal suits both project and gantt.
    expect(resolveLayoutForType("gantt", "horizontal")).toBe("horizontal");
  });

  it("falls back to the type's first layout when the current one no longer fits", () => {
    // radial is not offered for gantt.
    expect(resolveLayoutForType("gantt", "radial")).toBe("gantt");
  });

  it("always resolves to a layout that is valid for the new type", () => {
    for (const type of TIMELINE_TYPES) {
      for (const layout of TIMELINE_LAYOUTS) {
        const resolved = resolveLayoutForType(type, layout);
        expect(isLayoutValidForType(type, resolved), `${type} + ${layout}`).toBe(true);
      }
    }
  });
});

describe("theme presets", () => {
  it("falls back to Canvas when no preset is stored", () => {
    expect(resolveThemePreset(undefined)).toBe("canvas");
    expect(resolveThemePreset(null)).toBe("canvas");
    expect(DEFAULT_THEME_PRESET).toBe("canvas");
  });

  it("falls back to Canvas for an unrecognized preset", () => {
    expect(resolveThemePreset("neon")).toBe("canvas");
  });

  it("keeps a recognized preset", () => {
    expect(resolveThemePreset("midnight")).toBe("midnight");
    expect(resolveThemePreset("editorial")).toBe("editorial");
  });

  it("exposes exactly the three presets the schema allows", () => {
    expect(THEME_PRESETS.map((p) => p.id)).toEqual([...TIMELINE_THEME_PRESETS]);
    expect(THEME_PRESETS).toHaveLength(3);
  });
});

describe("wide layouts", () => {
  it("treats horizontal-hungry layouts as wide", () => {
    for (const layout of ["horizontal", "gantt", "roadmap", "calendar-board", "interactive", "branch"] as const) {
      expect(isWideLayout(layout), layout).toBe(true);
    }
  });

  it("leaves reading-width layouts narrow", () => {
    for (const layout of ["vertical", "zigzag", "radial", "calendar"] as const) {
      expect(isWideLayout(layout), layout).toBe(false);
    }
  });
});

describe("persistence and backward compatibility", () => {
  const baseTimeline = {
    title: "A timeline",
    timelineType: "general" as const,
    layout: "vertical" as const,
    events: [{ title: "An event", sortOrder: 0 }],
  };

  it("accepts a timeline saved before presets existed", () => {
    const parsed = TimelineInputSchema.parse({
      ...baseTimeline,
      theme: { density: "compact", accentColor: "#123456" },
    });
    expect(parsed.theme?.preset).toBeUndefined();
    expect(resolveThemePreset(parsed.theme?.preset)).toBe("canvas");
  });

  it("round-trips layout and theme preset through serialization", () => {
    const input = {
      ...baseTimeline,
      layout: "calendar-board" as const,
      timelineType: "calendar" as const,
      theme: { preset: "editorial" as const, density: "spacious" as const },
    };
    const parsed = TimelineInputSchema.parse(JSON.parse(JSON.stringify(input)));
    expect(parsed.layout).toBe("calendar-board");
    expect(parsed.theme?.preset).toBe("editorial");
    expect(parsed.theme?.density).toBe("spacious");
  });

  it("preserves custom overrides alongside a preset", () => {
    const parsed = ThemeSettingsSchema.parse({
      preset: "midnight",
      accentColor: "#ff8800",
      connectorColor: "#00ffcc",
      cardStyle: "elevated",
      showDates: false,
    });
    expect(parsed).toMatchObject({
      preset: "midnight",
      accentColor: "#ff8800",
      connectorColor: "#00ffcc",
      cardStyle: "elevated",
      showDates: false,
    });
  });

  it("rejects a preset outside the allowed set", () => {
    expect(ThemeSettingsSchema.safeParse({ preset: "neon" }).success).toBe(false);
  });
});
