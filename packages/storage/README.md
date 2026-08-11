# @asafarim/storage

Shared S3-compatible object storage utilities for the ASafarIM Platform.
Used by Vionto (media uploads), EduMatch (file uploads, quote PDFs),
TimelineAI (export images), and Hub (profile avatars).

## What's here

- **Dual-mode storage** — production uses S3-compatible object storage
  (DigitalOcean Spaces, AWS S3); local dev falls back to the
  filesystem (`.local-storage/objects/`) unless `STORAGE_FORCE_REMOTE`
  is set.
- **Upload** — `uploadObject()` with auto-generated UUID keys, content-
  type detection, and size validation.
- **Download** — `getObject()` returns a stream; `getObjectBuffer()`
  for small files.
- **Delete** — `deleteObject()` by key.
- **Exists** — `objectExists()` head check.
- **Presigned URLs** — `createPresignedUploadUrl()` and
  `createPresignedDownloadUrl()` for direct browser-to-S3 transfers
  using `@aws-sdk/s3-request-presigner`.

## Configuration

| Variable | Purpose |
| --- | --- |
| `STORAGE_ENDPOINT` | S3-compatible endpoint URL |
| `STORAGE_REGION` | Region (e.g. `fra-1`) |
| `STORAGE_BUCKET` | Bucket name |
| `STORAGE_ACCESS_KEY` | Access key ID |
| `STORAGE_SECRET_KEY` | Secret access key |
| `STORAGE_PUBLIC_URL` | Public-facing base URL for served objects |
| `STORAGE_FORCE_REMOTE` | Force S3 even in local dev (skip filesystem fallback) |

## Dependencies

- `@aws-sdk/client-s3` for S3 operations.
- `@aws-sdk/s3-request-presigner` for presigned URLs.

## Scripts

```bash
pnpm --filter @asafarim/storage typecheck
pnpm --filter @asafarim/storage test          # vitest
```
