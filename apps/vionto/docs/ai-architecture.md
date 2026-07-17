# Vionto — AI‑Directed Album‑to‑Story Architecture

> **Principle:** AI *directs* the video; it does not render every frame. AI understands the
> album, organizes photos, writes/improves the story, defines scenes, matches narration to
> images, and decides *where* optional generated footage helps. The final video is rendered
> **deterministically** (Remotion + FFmpeg). Generative video (Kling/fal/Sora/Runway) is an
> **optional, gated premium filler** — never the whole video.

This is the living design deliverable (spec §34). It is delivered incrementally; see
`C:\Users\saal\.claude\plans\resilient-drifting-newt.md` for the phased PR plan of record.

## Module map

```
Auth (platform)      Uploads            Media processing     Album analysis
Story planning       Scene planning     Narration            Captions
Music                Video templates    Preview render       Final render
Generative filler    Usage & credits    Exports              Project versioning
```

Each module depends on **interfaces**, not vendor SDKs. Vendor calls live only in adapters.

## Provider interface layer  (`lib/server/ai/`)

Implemented in Phase A:

| File | Role |
|---|---|
| `types.ts` | Domain types: `AlbumAnalysisResult`, `StoryPlan`/`StoryScene`, `NarrationInput/Result`, `GeneratedClip*`, `RenderResult`, `ProviderContext`, tiers/capabilities. |
| `interfaces.ts` | The five interfaces: `AlbumAnalyzer`, `StoryPlanner`, `NarrationProvider`, `GenerativeVideoProvider`, `VideoRenderer`. |
| `registry.ts` | Single source of truth: providers → capabilities, models, tiers, env-key names, BYOK + `implemented` flags, rough cost. Drives routing, the BYOK UI, and cost estimates. |
| `credentials.ts` | BYOK: encrypt/resolve/mask provider keys. Resolution order **user key → server env fallback → none**. Reuses `google-photos/crypto.ts` (AES‑256‑GCM). |
| `adapters.ts` | Vendor adapters delegating to existing code: OpenAI/Anthropic `StoryPlanner`, OpenAI/ElevenLabs `NarrationProvider`, Kling `GenerativeVideoProvider`. |
| `factory.ts` | `getStoryPlanner` / `getNarrationProvider` / `getGenerativeVideoProvider` — resolve provider id → adapter. |
| `index.ts` | Barrel — the app imports from `@/lib/server/ai`. |

Adding a provider = one registry entry + one adapter + one `factory` case. Nothing else changes.

## Bring‑your‑own‑key (BYOK)

- Model: `ViontoProviderCredential { userId, provider, apiKeyEnc, apiSecretEnc?, label, maskedKey, status }`,
  `@@unique([userId, provider])`. Plaintext keys are **never** stored or returned — only `maskedKey` (`…4f2a`).
- API: `GET/PUT/DELETE /api/integrations/ai-providers` — list (masked, with env-fallback availability), upsert
  (encrypted), remove.
- Resolution: `resolveProviderCredential(userId, provider, { allowEnvFallback })`. Set `allowEnvFallback:false`
  to force BYOK (e.g. "server key = owner only" policy).

## Project state machine  (`lib/server/project-state.ts`)

15 canonical states — `DRAFT → UPLOADING → PROCESSING_IMAGES → READY_FOR_ANALYSIS → ANALYZING →
ANALYSIS_READY → STORY_DRAFT → SCENE_PLAN_READY → GENERATING_NARRATION → READY_FOR_PREVIEW →
RENDERING_PREVIEW → PREVIEW_READY → RENDERING_FINAL → COMPLETED`, plus `FAILED` (reachable from any
live state). Loop-backs allow edits (e.g. `PREVIEW_READY → STORY_DRAFT`). `normalizeStatus()` maps the
legacy `draft/ready/rendering/completed/archived` strings onto canonical states so old rows interoperate.
Persisted on `ViontoProject.status`; the frontend restores the workflow from it.

## Data model

**Reused today:** `ViontoProject`, `ViontoAsset`, `ViontoAlbum(Item)`, `ViontoScript`, `ViontoAudioTrack`,
`ViontoRenderJob`, `ViontoVideoVersion`, `ViontoExport`, `ViontoAiClip`, `ViontoUsageMetric`,
`ViontoPlanQuota`, `ViontoAuditEvent`.

**Added (Phase A):** `ViontoProviderCredential`.

**Planned:** `ViontoAlbumAnalysis`, `ViontoDetectedPerson`, `ViontoAlbumMoment` (Phase B); `ViontoScene`,
`ViontoSceneAsset`, `ViontoNarrationSegment`, `ViontoCaptionSegment` (Phase C/D); `ProviderUsage`,
`CreditTransaction` (Phase F). `ViontoAiClip` already fills the spec's `GeneratedClip` role.

## Scene‑plan schema (target — Phase C)

`StoryScene` (see `types.ts`): `{ id, order, type: opening|story|transition|filler|closing, narration,
assetIds[], estimatedDurationSeconds, visualLayout, motionPreset, transitionIn/Out, caption?, musicMood?,
emotionalTone?, needsGeneratedFiller, generatedFillerReason?, generatedFillerPrompt? }`. Editable, versioned,
small edits touch one scene. Seeded from album analysis + `smart-pacing.ts`.

## Render manifest & renderers

`lib/server/render-manifest.ts` is the shared contract. It already carries assets/motion/subtitles/audio and
(from the Kling work) per-asset `videoStorageKey`. The `VideoRenderer` interface abstracts the renderer:
`ffmpeg` today (`lib/server/ffmpeg.ts` + `worker.ts`); `RemotionVideoRenderer` added in Phase E (Remotion
composes; FFmpeg does pre/post + audio mix + encode). A generated clip is just another timeline asset.

## Cost control (target — Phase F)

`ProviderUsage` (per paid op: provider, model, operation, units, estimated/actual cost, idempotency key,
status) + `CreditTransaction`. Controls: credit reservation before expensive ops, refund on pre-output
failure, idempotency (no double charge on retry), per-project/per-user budget caps, generated-seconds caps
per plan, admin provider routing/disable. Cost optimizations: batch + cache analysis, reuse narration,
render only changed scenes, cache scene renders, deterministic effects over generated video, low-res previews.

## Folder structure (vionto)

```
app/                     # Next.js routes (UI + /api/*)
components/              # React UI (ViontoPage, AiMotionPanel, …)
lib/server/
  ai/                    # provider interfaces, registry, adapters, credentials, factory  ← new
  google-photos/         # crypto (reused for BYOK), connection, oauth, …
  ffmpeg.ts, render-manifest.ts, worker.ts   # deterministic render
  story-generation.ts, vision.ts, tts.ts, kling.ts   # wrapped by adapters
  smart-pacing.ts, pacing.ts, srt.ts, audio-mix.ts, pixabay-music.ts
  project-state.ts       # state machine  ← new
  storage.ts, validation.ts, auth.ts
docs/                    # this file + future schema/API/job docs
```

## Provider defaults & routing

- **Story:** OpenAI (`gpt-4.1-mini`) / Anthropic (Haiku↔Sonnet).
- **Narration:** economy→(Google TTS, planned), standard→OpenAI TTS / ElevenLabs Flash, premium→ElevenLabs Multilingual.
- **Album analysis:** OpenAI vision now; Gemini Flash planned (Phase B).
- **Generative filler:** Kling now; fal.ai (LTX default, WAN, Kling) planned (Phase G). Gated + approval + caps.
- **Render:** FFmpeg now; Remotion planned (Phase E).

## Testing

Unit (per spec §31): schema validation, scene duration, image→scene matching, credit math, provider routing,
caption timing, manifest generation. Phase A ships `project-state.test.ts`, `ai-registry.test.ts`,
`ai-credentials.test.ts` (22 tests). CI mocks all AI/TTS/video providers — never calls paid APIs.
