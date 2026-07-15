# Vionto

Vionto is the AI-powered photo-to-story video app in the ASafarIM Platform. It turns image collections into narrated MP4 videos: projects own the source images, albums are non-destructive subsets/orderings, and video versions carry the creative settings that scripts, audio tracks, render jobs, and exports hang off. Ported from `asafarim-digital` (see [docs/vionto-architecture.md](../../docs/vionto-architecture.md) for the full architecture).

## Development

```bash
pnpm --filter vionto dev   # starts web (:3004) + render worker together
```

Local URL: `http://localhost:3004` — worker health: `http://localhost:3007`

The render pipeline needs Redis (`docker compose up -d redis`, host port 6390)
and FFmpeg/ffprobe on PATH (or `FFMPEG_PATH`/`FFPROBE_PATH`). Configuration
lives in the repo-root `.env.local`; see the Vionto section of `.env.example`.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS
- **Auth:** Auth.js v5 (shared via `@asafarim/auth`; sign-in centralized on the Hub)
- **AI Providers:** OpenAI and Anthropic for image captions and story writing
- **TTS:** Azure Speech, ElevenLabs, and OpenAI
- **Storage:** local filesystem in dev, DigitalOcean Spaces (S3 API) in production
- **Job Queue:** Redis + BullMQ (`vionto-render` queue)
- **Worker:** background FFmpeg render worker (`worker.ts`, bundled with tsup)

## Architecture

- **vionto:** main Next.js app (dev port 3004; container port 3000)
- **vionto-worker:** background render worker (health endpoint on `WORKER_HEALTH_PORT`, default 3007)
- **Shared packages:** `@asafarim/auth`, `@asafarim/db`, `@asafarim/shared-i18n`, `@asafarim/country-language-selector`, `@asafarim/vionto-schemas`

## Environment Variables

All configuration is documented in the repo-root `.env.example` (Vionto
section): `REDIS_URL`, `VIONTO_STORAGE_DRIVER`/`DO_SPACES_*`,
`OPENAI_API_KEY`/`ANTHROPIC_API_KEY` (+ vision model overrides),
`AZURE_SPEECH_KEY`/`ELEVENLABS_API_KEY`, `PIXABAY_API_KEY`,
`GOOGLE_PHOTOS_*` + `VIONTO_TOKEN_ENCRYPTION_KEY` (see
[docs/google-photos-import.md](docs/google-photos-import.md)), and
`WORKER_HEALTH_PORT`/`FFMPEG_PATH`/`FFPROBE_PATH`.

## Deployment

Both containers are part of `docker-compose.prod.yml`:

- `vionto` — built from `apps/vionto/Dockerfile` (Next.js standalone), proxied
  by Caddy at `https://vionto.asafarim.com`
- `vionto-worker` — built from `infra/docker/Dockerfile.vionto-worker`
  (FFmpeg + fonts + bundled worker), sharing the `redis` service and database

Health endpoint: `/api/health`.
