# ResuMatch technical backlog

This document tracks engineering gaps and deferred technical work that are
useful to contributors. It is not a commercial roadmap or release promise.

## Current architecture

ResuMatch runs as an isolated Next.js application with its own PostgreSQL
database, object storage for uploaded documents, a BullMQ worker, optional AI
providers behind a deterministic fixture provider, and a fail-closed malware
scanning boundary.

The core safety invariant is that generated CV and cover-letter content can
rephrase or reorder confirmed facts but cannot introduce an employer, date,
degree, certification, or skill absent from the user's confirmed profile.

## Priority engineering gaps

1. Complete equivalent provider coverage where the Anthropic extraction,
   summary-rewrite, job-fetch, job-metadata, and skill-categorization adapters
   still degrade to deterministic behavior.
2. Keep provider cost enforcement atomic under concurrent requests and expose
   sufficient operator evidence without logging document content.
3. Add per-item deletion and clearer retention controls for uploaded and
   generated artifacts.
4. Add rate limiting and abuse controls to document intake and AI routes.
5. Expand recovery, load, incident-response, and privacy-impact evidence
   before operating beyond showcase scale.
6. Add accessible print templates without weakening the single-source export
   contract shared by browser print and DOCX generation.
7. Keep localization dictionaries complete and tested as features evolve.

## Contributor checks

Changes to tailoring or extraction must preserve the no-fabrication merge,
prompt/data fencing, explicit preview-and-confirm flow, redacted logging, and
fixture-provider coverage. See `threat-model.md` and `agent-notes.md` for the
detailed invariants and test commands.
