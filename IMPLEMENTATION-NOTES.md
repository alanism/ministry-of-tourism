# Implementation notes: what these documents can claim

The documentation describes a useful browser-and-files product while keeping the broader ambition visible. It is based on public-source inspection and later local feature and helper materials reviewed on 4 November 2026. It does not certify every feature in the hosted app or convert a development test into a production promise.

## Publication baseline and feature maturity

This documentation-only publication starts from public `main` at `900ee85dc5ba16d71db0cf0fd6926c89b86ac34d`. It adds the use cases, philosophy essays, index, owner's manual and these notes. It does not merge application features or deploy the app. Source and hosted versions are maintained separately, as the existing [Git workflow](docs/GIT-WORKFLOW.md) explains.

Later carousel and public-helper materials informed the related stories; those additions are not all present in the publication's source baseline. The three new discovery and photo-illustration documents describe local feature work reviewed separately. Discovery's secured public funded backend and approved reference-image integration for the illustration treatments remain in progress. None of those three features is announced as deployed here. Existing uncommitted feature work is outside this documentation commit.

## Evidence used for the boundaries

The following source paths identify the material reviewed. Rows marked as later/local describe separately inspected work, rather than files guaranteed to exist at the publication baseline.

| Subject | Inspected source or documentation | Resulting boundary |
| --- | --- | --- |
| Carousel scenarios (later source) | `apps/web/src/trip/LandingCarousel.tsx` | Eight original themes and one local discovery preview mapped in INDEX; illustrative apparel imagery is not product proof |
| Local persistence | `apps/web/src/trip/trip-store.ts`, `TripApp.tsx` | Browser-profile storage, explicit save status, ZIP import as a new board |
| Export selection | `apps/web/src/trip/ExportScreen.tsx`, `artifacts.ts` | Public versus Review scope; HTML, PDF and editable ZIP are distinct |
| Guest copy | `apps/web/src/trip/GuestCopyPanel.tsx` | Selected Guide cards become an independent guest copy |
| Keepsakes | `apps/web/src/trip/Keepsakes.tsx` | Photo postcard and memory-page PNG; missing-photo and resolution feedback |
| Agent operations | `apps/web/public/trip-agents.md`, `apps/web/src/trip/agentApi.ts` | Capability discovery, revision checks, distinct Apply/save/export receipts |
| File proposals and room limits | `apps/web/public/guides/trip-best-practices.md`, `OwnMuseFiles.tsx` | Selected-context file route; local review; production live rooms unavailable |
| Positional counting | `packages/core/src/trip/preference-tally.ts`, `voting-lifecycle.ts` | Ranked points are advisory and distinct from stamps |
| Instant-runoff | `packages/core/src/trip/instant-runoff.ts` | Active-ballot majority, explicit ties, exhausted ballots and no hidden tie-break |
| Public helper (later source) | `docs/MUSE-CUSTOM-CONNECTOR.md`; `packages/mot-server/src/custom-connector.ts` | Public HTTP/OpenAPI catalogue metadata only; no private trip access or native registration claim |
| Related-place discovery (local feature work) | `docs/discover-more.md`; `DiscoverMore.tsx`; `packages/mot-server/src/discovery.ts` | Public catalogue inputs; source-backed candidates; conditional public Instagram evidence; no deployed funded backend claim |
| Photo illustrations (local feature work) | `docs/photo-fashion.md`; `PhotoFashionPanel.tsx`; `fashion-photo.ts`; `muse-fashion-preset.ts` | Deliberate prepared-photo request; unchanged original; opaque output; review and private saving; reference integration in progress |
| Content rights | `docs/CONTENT-AND-ASSETS.md` | FCC-specific current adapters; separate asset terms and prospective providers |
| Product narrative | Existing README and reported browser/file walkthrough | Four traveler entry points; travelers choose when planning, journaling or keepsakes are useful |

The existing materials report a completed Muse browser/file round trip and physical-device checks. Those reports support describing the workflow, rather than claiming that this documentation task repeated them. The new use cases contain no personal trip files, private booking details or credentials.

## Current paths and future direction

| Claim | Treatment in the new documentation |
| --- | --- |
| Local board, selected content and exports | Describe inspected behavior and recovery limits |
| Multiple people and their agents | Independent file copies and deliberate organizer review; no automatic general merge |
| Household voting | Separate points and instant-runoff; explicit households, concerns and human choice |
| Public catalogue helper | Read-only metadata/source-link path; client capabilities and retention vary |
| Private trip access from the public API | Not supported by the public helper |
| Hosted in-app model or image adapter | Optional configuration; no fresh live call or generation claimed here |
| Related-place discovery | Local preview; inspectable public search evidence; Instagram only when qualifying public-post/reel evidence is present; funded backend in progress |
| City Ink and Fashion Illustration | Local implementations, not deployed; original retained, opaque output, human review, private saving; final reference-guided fidelity not established |
| Production live rooms | Unavailable in the inspected guide; development tests remain separate |
| Other publishers | Desired future connections, not established partnerships |
| Web3-like architecture | Portability and independent providers as a direction, not blockchain implementation |
| T-shirt checkout and photo-book fulfillment | Future direction, not a completed order flow |
| Privacy and token savings | Specific boundaries and mechanisms; no universal guarantees or measured savings invented |

## Writing and checks

The writing applies the requested reader-centered method using the supplied Reader-Centered Writing Playbook and its William Fitzpatrick reference lens. Each use case opens with a concrete need, explains the useful response and its mechanism, and ends with a practical outcome. The philosophy essays connect the design choice to a traveler benefit and an observable design test. Claims remain calibrated to the inspected behavior rather than the ambition alone.

The unchanged `npm run check` passed in the isolated documentation checkout at the stated public-source baseline: **1,491 tests across 278 files**, followed by all three workspace TypeScript checks. The test stage took 77.45 seconds. This result is separate from checks of later carousel, discovery or illustration work; it does not certify their production readiness.

The documentation checks cover **23 Markdown files**, including 15 use cases with more than 200 narrative words each, five philosophy essays and the three root guides. All **92 local file links** resolve, and all **20 Mermaid diagrams** parse with Mermaid 11.17.2. No test assertion, timeout, source file or configuration is changed by this documentation task.

[Documentation index](INDEX.md) · [Owner's manual](OWNER-MANUAL.md)
