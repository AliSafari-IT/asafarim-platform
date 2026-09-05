# JM-001 — Licensing decision and dependency/license inventory

**Issue:** [#205](https://github.com/AliSafari-IT/asafarim-platform/issues/205)
· business plan reference: `docs/business-plan.md` → M0 → JM-001
**Owner / copyright holder:** Ali Safari (`asafarim@gmail.com`)
**Decision date:** 2026-09-05
**Status:** Decided. This record is the durable location for the JM-001
decision, the permissions register, and the dependency/license inventory.

> This document is an engineering record of the copyright holder's decision.
> It is not legal advice. If JobMatch moves toward commercial operation,
> paid pilots, or B2B use (business-plan milestones M10–M12), the wording
> here must be reviewed by qualified legal counsel before that step.

---

## 1. Decision

The `jobmatch.asafarim.com` deployment continues **as a non-commercial
portfolio showcase operated solely by the Licensor (Ali Safari)**, with an
explicit showcase disclosure shown to visitors before the CV-upload point.

Rationale:

- The deployment exists to demonstrate the Licensor's work to recruiters,
  hiring managers, and prospective clients — the exact audience the
  repository `LICENSE` ("Portfolio Evaluation & Source-Available License")
  is written for. Visitors may try the flow end to end (build a profile,
  upload a CV, walk up to the point of applying for a selected job).
- It is **not** offered as open-source software, a reusable product, or a
  hosted service for anyone else to run. Any commercial or third-party
  hosted use still requires a separate written agreement with the Licensor.
- No paid features, tenants, or customer contracts exist. Monetisation
  (M10+) is out of scope and would trigger a fresh legal review.

### What this decision permits

| Actor | Permitted |
|---|---|
| The Licensor | Operate the single public showcase instance at `jobmatch.asafarim.com`, for demonstration and lead generation, at no charge. |
| A visitor / evaluator | View the source per `LICENSE` §1; use the live showcase instance to evaluate the Licensor's work. |

### What this decision does **not** permit (unchanged from `LICENSE` §2)

- Commercial use, resale, or operation as a SaaS/managed service by anyone.
- Third-party deployment of the Software or a derivative to any server or
  cloud environment beyond a local, non-public evaluation.
- Re-publishing, mirroring, or re-hosting the source.
- Any use beyond the Permitted Purposes without a separate written
  commercial license — contact `asafarim@gmail.com`.

---

## 2. `LICENSE` ↔ deployment consistency

The repository `LICENSE` restricts commercial use and third-party public
deployment but does **not** restrict the **Licensor's own** use of the
Software. As the copyright holder, the Licensor may operate the showcase
instance without a separate grant; §2 binds a *Licensee*, not the Licensor.
The public deployment is therefore consistent with `LICENSE` as written, and
no relicensing or added grant clause is required for the showcase.

**Inconsistency found and fixed:** the root `package.json` declared
`"license": "MIT"`, which contradicts the source-available `LICENSE` file.
Changed to `"license": "SEE LICENSE IN LICENSE"` in the same change set as
this record. `apps/jobmatch/package.json` is `"private": true` with no
`license` field, which is correct.

No other contradiction between the license wording and the deployment model
was identified.

---

## 3. Dependency / license inventory — JobMatch deployment

**Method:** taken from `apps/jobmatch/package.json` plus the shared
`workspace:*` packages it pulls in. Transitive licenses were not machine-
enumerated in this pass because the local pnpm store index was incomplete
(`pnpm licenses list` failed pre-`pnpm install`). Re-run
`pnpm --filter @asafarim/jobmatch licenses list` after a clean
`pnpm install` and append the full transitive breakdown here; the direct
runtime surface below is the licensing-relevant set for a showcase.

### Direct runtime dependencies

| Package | Version | License | Notes for showcase deployment |
|---|---|---|---|
| `next` | ^16.2 | MIT | Permissive. |
| `react`, `react-dom` | ^19.2 | MIT | Permissive. |
| `@prisma/client`, `@prisma/adapter-pg`, `@prisma/client-runtime-utils` | 7.8.0 | Apache-2.0 | Permissive; patent grant. Client generated into `lib/db/generated`. |
| `prisma` (CLI, dev) | 7.8.0 | Apache-2.0 | Build-time only. |
| `zod` | ^4.4 | MIT | Permissive. |
| `mammoth` | ^1.12 | BSD-2-Clause | Permissive. `.docx` text extraction. |
| `unpdf` | ^1.8 | MIT | Permissive. PDF text extraction; bundles a build of PDF.js (Apache-2.0). |
| `dotenv` | ^17.4 | BSD-2-Clause | Permissive. |

### Shared workspace packages (first-party)

`@asafarim/auth`, `@asafarim/storage`, `@asafarim/ui`,
`@asafarim/theme-toggle`, `@asafarim/config` — all owned by the Licensor and
covered by the repository `LICENSE`. No third-party copyright holder.

### Assessment

- All direct third-party dependencies are under permissive licenses (MIT,
  BSD-2-Clause, Apache-2.0). None is copyleft (no GPL/AGPL/LGPL/SSPL/EUPL),
  and none restricts hosted or public deployment.
- No dependency imposes an obligation incompatible with a non-commercial
  showcase deployment. Apache-2.0 (Prisma, PDF.js) carries a NOTICE/patent
  provision but no deployment restriction.
- No dependency requires attribution surfaced in the running UI; source-
  level license retention is satisfied by the unmodified `node_modules`
  contents.

**Action item (non-blocking):** add a CI job running `pnpm licenses list`
with an allow-list (MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, 0BSD,
Unlicense, CC0-1.0) so a future copyleft transitive dependency fails the
build. Tracked as a follow-up, not required for this decision.

---

## 4. Copyright holders

| Component | Holder |
|---|---|
| JobMatch app + all `@asafarim/*` packages + repository | Ali Safari |
| Third-party dependencies in §3 | Respective upstream authors, under the permissive licenses listed |

No external contributor holds copyright in the JobMatch code as of this
date; contributor permissions are therefore not required. If outside
contributions are accepted later, add a CLA or DCO before merging and record
it here.

---

## 5. Permissions / approvals register

| Date | Item | Granted by | Terms |
|---|---|---|---|
| 2026-09-05 | Operate `jobmatch.asafarim.com` as a free, non-commercial portfolio showcase | Ali Safari (copyright holder) | Showcase disclosure shown before CV upload; no paid features; no third-party tenants; revocable at any time by the Licensor. |

No written permission from any third party is required for this decision
(all dependencies permissively licensed; no external data source is
connected — see JM-003/JM-004).

---

## 6. Acceptance-criteria mapping (issue #205)

| Criterion | Where satisfied |
|---|---|
| JM-001 has a documented decision and owner | §1, this file header |
| Dependency/license inventory complete for the deployment | §3 |
| Required written permissions / license changes recorded | §5; `package.json` license fix in §2 |
| `LICENSE` ↔ deployment relationship documented and consistent | §2 |
| Public landing/profile/upload experience identifies the app as an experimental showcase MVP | `app/components/ShowcaseNotice.tsx`, rendered on `app/page.tsx`, `app/profile/page.tsx`, and `app/profile/UploadPanel.tsx`; `app/layout.tsx` footer |
| Disclosure states not for professional recruiting / consequential decisions | `ShowcaseNotice` full + compact copy |
| Disclosure does not imply accuracy/security/availability/suitability | `ShowcaseNotice` copy explicitly disclaims all four |
| Wording reviewed before presenting to external users | This record; copy authored for the copyright holder's review in the PR for #205 |

---

## 7. Follow-ups (not blocking JM-001)

- Re-run `pnpm licenses list` post-install and append the transitive
  breakdown (§3).
- Add the license allow-list CI check (§3).
- Revisit this record before any milestone that introduces payment,
  tenants, or B2B use (M10–M12); obtain legal review at that point.
