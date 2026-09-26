<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ResuMatch-specific notes

Kept outside the `nextjs-agent-rules` block above, which `next dev` regenerates.

- Read [docs/agent-notes.md](docs/agent-notes.md) before changing this app: git discipline, ResuMatch’s **own** database and migration command, CRLF, build/dev-server pitfalls, and the tailoring invariants.
- Output language (CV #641, cover letter #642) lives in `lib/tailoring/language.ts`; the #642 plan is kept for reference: [docs/plan-642-cover-letter-language.md](docs/plan-642-cover-letter-language.md).
