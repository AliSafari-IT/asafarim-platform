# @asafarim/vionto-schemas

Shared Zod validation schemas for Vionto — the AI photo-to-story video
app. Imported by `apps/vionto` for both client-side and server-side
validation of project, album, and video configuration.

## What's here

- **Enums and constants** — `ProjectMode` (story, slideshow,
  documentary), `StoryMode` (memory_film, travel_recap, family_archive,
  event_recap, social_reel, documentary), `EmotionalTone`,
  `AspectRatio`, `Resolution`, `OutputFormat`, `VideoCodec`,
  `AudioCodec`, `projectStatus`, `renderJobState`,
  `albumLifecycleStage`, `videoTemplateId`.
- **File constraints** — `MAX_IMAGE_BYTES`, `MAX_VIDEO_BYTES`, and
  related upload limits.
- **Project/album/video schemas** — Zod objects for creating and
  updating Vionto projects, albums, and video versions, including
  AI generation settings (provider, model, tone, narration options).
- **Render job schemas** — validation for render job creation and
  status transitions.

## Usage

```ts
import { ProjectMode, StoryMode, AspectRatio, projectStatus } from "@asafarim/vionto-schemas";
```

## Dependencies

- `zod` for schema definition and validation.
