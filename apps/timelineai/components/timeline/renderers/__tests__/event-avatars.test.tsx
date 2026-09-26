import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelineRenderer } from "../TimelineRenderer";
import { initialsFor, inkOn } from "../EventAvatar";
import { TIMELINE_LAYOUTS, type ThemeSettings, type TimelineInput } from "@/lib/schemas";
import { resolveImageStyle } from "@/lib/timeline-config";

type Layout = TimelineInput["layout"];

const IMAGE = "https://images.example.com/newton.jpg";

const events = [
  {
    id: "clfoo0000000000000000000",
    title: "Newton splits sunlight",
    description: "A prism.",
    startAt: "2026-01-15T00:00:00.000Z",
    label: "optics",
    imageUrl: IMAGE,
    imageAlt: "Portrait of Isaac Newton",
    accentColor: "#f59e0b",
    sortOrder: 0,
  },
  {
    title: "The first laser shines",
    description: "A ruby crystal.",
    startAt: "2026-02-10T00:00:00.000Z",
    label: "lasers",
    sortOrder: 1,
  },
] as TimelineInput["events"];

function render(layout: Layout, theme: ThemeSettings) {
  return renderToStaticMarkup(
    <TimelineRenderer layout={layout} timeline={{ title: "Light", events, theme }} />
  );
}

describe("resolveImageStyle", () => {
  it("keeps timelines saved before imageStyle existed on their old look", () => {
    expect(resolveImageStyle(null)).toBe("banner");
    expect(resolveImageStyle({})).toBe("banner");
    expect(resolveImageStyle({ showImages: true })).toBe("banner");
    expect(resolveImageStyle({ showImages: false })).toBe("off");
  });

  it("lets an explicit imageStyle win over the legacy flag", () => {
    expect(resolveImageStyle({ imageStyle: "avatar", showImages: false })).toBe("avatar");
    expect(resolveImageStyle({ imageStyle: "off", showImages: true })).toBe("off");
  });
});

describe("avatar fallback helpers", () => {
  it("builds initials from the significant words of a title", () => {
    expect(initialsFor("The first laser shines")).toBe("FL");
    expect(initialsFor("Hubble reaches orbit")).toBe("HR");
    expect(initialsFor("Maxwell: light is an electromagnetic wave")).toBe("ML");
    expect(initialsFor("the")).toBe("T");
    expect(initialsFor("!!!")).toBe("•");
  });

  it("picks readable ink for the avatar's accent", () => {
    expect(inkOn("#14102b")).toBe("#ffffff"); // dark accent → white text
    expect(inkOn("#fbbf24")).toBe("#14102b"); // light amber → dark text
    expect(inkOn("not-a-colour")).toBe("#ffffff");
  });
});

describe("imageStyle: avatar", () => {
  // Layouts that draw an avatar for every event, image or not.
  const ALWAYS = TIMELINE_LAYOUTS.filter((l) => l !== "branch" && l !== "calendar-board");

  it.each(ALWAYS)("%s draws an avatar per event, with the image and an initials fallback", (layout) => {
    const html = render(layout, { imageStyle: "avatar" });
    expect(html).toContain(IMAGE);
    expect(html).toContain("FL"); // the image-less event falls back to its initials
  });

  it.each(["branch", "calendar-board"] as const)(
    "%s shows the image as the avatar but keeps its own icon for events without one",
    (layout) => {
      const html = render(layout, { imageStyle: "avatar" });
      expect(html).toContain(IMAGE);
      expect(html).toContain("tl-avatar");
    }
  );

  it("exposes the author's image description as the avatar's accessible name", () => {
    const html = render("vertical", { imageStyle: "avatar" });
    expect(html).toContain('role="img" aria-label="Portrait of Isaac Newton"');
  });

  it("layers the image over the fallback so a broken image still shows initials", () => {
    const html = render("vertical", { imageStyle: "avatar" });
    // The image event's own initials are still in the markup under its <img>.
    expect(html).toMatch(/tl-avatar__fallback">NS<\/span><img class="tl-avatar__img"/);
  });
});

describe("imageStyle: banner and off", () => {
  it("banner keeps the in-card picture and gives it real alt text", () => {
    const html = render("vertical", { imageStyle: "banner" });
    expect(html).toContain(`alt="Portrait of Isaac Newton"`);
    expect(html).not.toContain("tl-avatar");
  });

  it("banner falls back to the event title as alt text", () => {
    const html = renderToStaticMarkup(
      <TimelineRenderer
        layout="zigzag"
        timeline={{
          title: "Light",
          theme: { imageStyle: "banner" },
          events: [{ ...events[0]!, imageAlt: null }],
        }}
      />
    );
    expect(html).toContain(`alt="Newton splits sunlight"`);
  });

  it.each(TIMELINE_LAYOUTS)("off shows no images or avatars in %s", (layout) => {
    const html = render(layout, { imageStyle: "off" });
    expect(html).not.toContain(IMAGE);
    expect(html).not.toContain("tl-avatar");
  });

  it("a legacy timeline with showImages: false stays image-free", () => {
    const html = render("vertical", { showImages: false });
    expect(html).not.toContain(IMAGE);
  });
});
