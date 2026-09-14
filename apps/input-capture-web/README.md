# Configurează-ți proiectul — webapp

The Urban Moon questionnaire, the freehand floorplan capture and the HubSpot hand-off, in one
SvelteKit app. Everything the user sees is Romanian, addressing them as *tu*.

SvelteKit 2 · Svelte 5 (runes) · TypeScript strict · `@sveltejs/adapter-node` · `idb-keyval` for
plan blobs · WireMock 3 as the HubSpot stand-in. No UI library: plain CSS with the tokens in
`src/app.css`.

Read `../PLAN-webapp.md` for the why and `CONTRACTS.md` for the binding build contract.

## Run it

```bash
npm install
cp .env.example .env    # already present; never point it at real HubSpot
npm run mock            # WireMock 3 on :8080 (docker compose up -d)
npm run dev             # http://localhost:5173
```

Open <http://localhost:5173> and answer the questionnaire. Everything you type lives in your own
browser (`localStorage` + IndexedDB) until you press **Trimite răspunsurile**.

- <http://localhost:5173/dev/inbox> — what WireMock received, newest first: every submission with
  its fields and every uploaded file with its `fileName`/`folderPath`. This is exactly what would
  reach HubSpot. Dev only: the page 404s when `MOCK_ADMIN_BASE` is empty.
- `npm run mock:down` stops WireMock · `npm run build` + `npm run preview` build and serve the
  Node server in `build/`.

## Test it

```bash
npm run check     # svelte-check — must print 0 errors
npm test          # vitest, src/**/*.test.ts, environment node (no services needed)
npm run test:e2e  # playwright, e2e/*.spec.ts
```

The e2e suite needs WireMock up on :8080 — a global setup fails fast with a plain message if it
is not answering — and starts `npm run dev` itself on :5173 (`reuseExistingServer`, so a dev
server you already have is reused). WireMock's request journal is a single global resource that
several specs clear and then count, so `playwright.config.ts` sets `workers: 1`; the suite runs
in about a minute.

Specs: `smoke` (page + health) · `api` (the three `/api` routes against the mock) · `flow` (the
three prototype question paths) · `planuri` (upload, tag, limits) · `deseneaza` (drawing a
rectangle with real pointer/touch input) · `journey` (five whole journeys: three rooms with two
uploads, one room with a drawn plan, a failed submit and its retry, a 390×844 phone run, and the
restart).

## Where things live

```
src/app.html                  lang="ro", fonts, title
DESIGN.md                     the design language: tokens, type, components, icon rules
src/app.css                   the tokens and every shared class (see DESIGN.md)
src/lib/types.ts              the shared types in CONTRACTS.md
src/lib/state/answers.svelte.ts   answers store, persisted to localStorage "um.answers"
src/lib/state/plans.svelte.ts     plans store: "um.plans" metadata + blobs in IndexedDB
src/lib/state/cursor.svelte.ts    the resume cursor, "um.cursor"
src/lib/questions/            rooms.ts · screens.ts (the S array) · predicates.ts · readback.ts · icons.ts (old clay set, no longer rendered)
src/lib/flow/                 engine.ts (navigation, completeness, chrome) + the screen renderers
src/lib/ui/                   Frame (photo + side shell) · GoBar · Keyed · Seg · CountRow · Reveal · Field · Roll
                              motion.ts (durations, curves, page/roll/crossfade transitions)
                              images.ts (Unsplash ids, artFor(screen), contents thumbnails)
                              lineIcons.ts (appliance + coffee drawings) · lineMap.ts
src/lib/plans/                Dropzone · FileTile · DrawingCard · PhotoField · Thumb · Rejections
tools/icons/                  clay.mjs · build.mjs — the old clay icon set; nothing renders it since the redesign
src/lib/floorplan/            engine.js (the editor) · engine.css · export.ts (svg/png) · FloorplanEditor.svelte
src/lib/hubspot/              mapping.ts (pure) · client.ts (server only) · validation.ts
src/lib/submit/               submit.ts (the orchestration) · SubmitPanel.svelte
src/routes/                   / · /planuri · /deseneaza · /rezumat · /multumim
                              /api/health · /api/upload · /api/submit · /dev/inbox
src/routes/+layout.ts         ssr = false — every screen is driven by browser state
mock/wiremock/mappings/       the WireMock stubs (ok + the "fail" scenario)
e2e/                          Playwright specs, fixtures and the global setup
docs/                         the archived HubSpot Forms v3 auth doc
```

`../floorplan-engine/` is the engine's staging copy — the same `engine.js`/`engine.css`/`export`
plus a standalone `harness.html` and `verify.mjs` parity suite
(`python3 -m http.server 8732`, then `node verify.mjs`). Changes to the editor are made in
`src/lib/floorplan/` and copied there.

## The flow

Chapters, in order: **Despre tine** (`c_identity`, `c_rooms`) → **Planuri** (a `route` screen that
hands off to `/planuri`) → **Locuința** (`c_stage`, `c_household`) → one chapter per picked room
(`bucatarie` k1–k13 · `living` l1–l4 · `dormitor` d1–d4 · `birou` · `baie` · `hol` · `alta`
x1–x3). The copy follows `COPY-chestionar(1).md`. The child room is gone — children now pick a
`dormitor`.

- "Altceva" options open a text box: a `followUp` of kind `input` on single/multi screens
  (`c_stage_other`, `d1_other`, `k6a_other`, `x1_baie_other`, `x1_hol_other`), and a field
  `other` inside compound screens (`petsOther`, `bedOther`, `wantsOther`). Continuing needs the text.
- The "mobilier păstrat" screens (`k13`, `l4`, `d4`, `x3_*`) are `furniture` screens:
  `{ items: [{ name, length, width }] }`, plus optional photos of the objects.

- URLs are `/?s=<screenId>`; plain `/` resumes from `localStorage["um.cursor"]`, or starts over.
- Answers, plans and the cursor all live in the browser. "Începe din nou" clears all of them,
  the IndexedDB blobs and the submission session keys.
- `/rezumat` shows "Ce am înțeles" — every question with its answer, by chapter, each with a
  "Modifică" link back to its screen (`src/lib/questions/readback.ts`) — then the submit panel.
- After a successful send, `/programare` embeds Calendly (`PUBLIC_CALENDLY_URL`, name and email
  prefilled) and moves on to `/multumim` once a slot is booked. With the variable empty the
  booking step is skipped.
- Photos (of the space on `/planuri`, of kept furniture per room) live in
  `src/lib/state/photos.svelte.ts`: `localStorage["um.photos"]` + IndexedDB, up to 10 per group.

### The plans step (`/planuri`)

- **One room**: upload *or* draw. The "Desenează planul" tile opens `/deseneaza`, the full-screen
  editor (no app chrome); "Gata" saves `{model, room, svg, pngDataUrl, updatedAt}` and returns.
  Uploaded files are tagged with that room automatically.
- **Two rooms or more**: upload only, and each file can be tagged with the room it shows.
- Limit: `rooms × 2` files, never fewer than 2. Max 25 MB each. Accepted: PDF, JPG, PNG, WEBP,
  HEIC/HEIF, DWG, DXF (by mime *or* by extension). Rejections — wrong type, too big, over the
  limit, duplicate — are listed in Romanian and never silently drop a file.
- It is preceded by its own question screen, "Ești dispus să modifici spațiul…?" (`p_modify`,
  multi, "Nu" exclusive). The step itself opens with the measuring disclaimer and an "Am măsurat
  spațiul" checkbox (`p_measured`): until it is ticked, drawing, uploads and photos are disabled.
- Continuing needs `p_measured` and at least one file or a drawing.

## HubSpot

Nothing in this phase talks to a real HubSpot host. `HUBSPOT_API_BASE` and `HUBSPOT_FORMS_BASE`
default to `http://localhost:8080` in `.env`, in `.env.example` **and** in the code's own
fallbacks (`src/lib/hubspot/client.ts`), so an app started with no `.env` at all still points at
the mock. The token is `mock-token`. **No real HubSpot call is made from this app.**

Endpoints modelled by WireMock (`mock/wiremock/mappings/`):

| Endpoint | Mock answer |
|---|---|
| `POST /files/v3/files` (multipart `file`, `options`, `folderPath`, `fileName`) | 201 `{ id, url, name, size, access }`, url under `http://localhost:8080/mock-files/…` |
| `POST /submissions/v3/integration/secure/submit/{portalId}/{formGuid}` | 200 `{ inlineMessage: "Mulțumim. Răspunsurile au ajuns." }` |
| either of the two, with header `X-Mock-Scenario: fail` | 500 — the failure path, reachable from the UI as `/rezumat?scenario=fail` |

Uploads go into `/proiecte/<email-slug>/`, the file name prefixed with the room tag
(`bucatarie--plan.pdf`), with `access: PUBLIC_NOT_INDEXABLE`.

### Field mapping (`src/lib/hubspot/mapping.ts`)

Every field is a contact field (`objectTypeId: "0-1"`). Empty values are omitted; any value over
65,000 characters is cut with a trailing `…`.

| Field | Value |
|---|---|
| `firstname` / `lastname` | `c_identity.name`, split on the last space |
| `email` | `c_identity.email` |
| `um_rooms` | picked room ids, joined with `;` (`bucatarie;living;copil`) |
| `um_stage` | `c_stage` |
| `um_adults` · `um_children` | the household steppers |
| `um_child_ages` · `um_pets` | `;`-joined lists |
| `um_elderly` | `da` / `nu` |
| `um_readback` | the whole "Ce am înțeles" list (chapter, question, `- answer`) as plain text |
| `um_answers_json` | every answer, as JSON |
| `um_plan_files` | one `url \| name \| room` per line (room is `-` when untagged) |
| `um_photo_files` | one `url \| name \| room \| spatiu-or-mobilier` per line |
| `um_plan_drawing_json` | the `RoomSnapshot` of the drawn plan |
| `um_plan_drawing_png` | the uploaded url of `plan-desenat.png` |
| `um_submission_id` | a UUID kept for the whole attempt series, so retries dedupe |
| `context` | `{ pageUri, pageName: "Configurează-ți proiectul" }` |

Submitting uploads the plan files first (skipping any already uploaded in this attempt series —
`sessionStorage["um.uploaded"]`), then the drawing's PNG and JSON, then the form.

### Verified vs. assumed (copied from `CONTRACTS.md`)

Verified from the archived legacy doc saved at `docs/hubspot-forms-v3-auth.txt`:

- `POST https://api.hsforms.com/submissions/v3/integration/secure/submit/:portalId/:formGuid`,
  `Content-Type: application/json`, `Authorization: Bearer {token}` (private app token, scope
  `forms`). No CORS — server-side only. Rate limit 100–200 requests / 10 s by tier.
- Body: `fields: [{ objectTypeId, name, value }]` (up to 1000; names must match property names;
  contact `objectTypeId` is `"0-1"`), optional `context: { hutk, ipAddress, pageName, pageUri,
  pageId }`, optional `submittedAt` (ms, only to backdate, max one month), `legalConsentOptions`
  with `consent: { consentToProcess, text, communications: [{ value, subscriptionTypeId, text }] }`
  — required if the form has GDPR notices.
- Files API (from developers.hubspot.com, fetched 2026-09-08): `POST https://api.hubapi.com/files/v3/files`
  multipart with `file`, `options` JSON (`access` required: `PRIVATE` | `PUBLIC_INDEXABLE` |
  `PUBLIC_NOT_INDEXABLE`; optional `ttl`, `duplicateValidationStrategy`,
  `duplicateValidationScope`), `folderPath` or `folderId`, `fileName`. Scopes `files`,
  `files.ui_hidden.read`. 201 returns `{ id, url, name, size, extension, type, access, … }`.
  A `PRIVATE` file's `url` 404s outside HubSpot; there is a `GET /files/v3/files/{id}/signed-url`.

Assumed, not verified:

- How a form *file* field takes its value through this API. We design for the safe case: upload
  with `access: PUBLIC_NOT_INDEXABLE` and put the returned URLs into the multi-line text field
  `um_plan_files`, one `url | name | room` per line. Nothing depends on a file-typed form field.

## Known gaps

- **The exported plan is captioned in English.** `src/lib/floorplan/export.ts` still writes
  `All dimensions in cm · Ceiling <n> cm · outline not closed` into the SVG/PNG footer (and
  `export.test.ts` asserts it). The editor's own chrome is Romanian.
- **Only one failure scenario.** `X-Mock-Scenario: fail` 500s *both* endpoints, so
  `/rezumat?scenario=fail` cannot fail the form submission alone; `journey.spec.ts` reaches that
  case by adding the header to `/api/submit` from the test. A `fail-submit` mapping would be
  cleaner.
- **The e2e suite is serial** (`workers: 1`) because WireMock's journal is global. A
  per-test scenario prefix, or a second WireMock instance, would let it run in parallel again.
- **The retry cache is per tab.** `um.submissionId` / `um.uploaded` live in `sessionStorage`, so
  a closed tab means re-uploading the files and a new submission id (HubSpot would see two
  submissions).
- **`docker-compose.yml` pins `wiremock/wiremock:3x`**, not the `:3` tag CONTRACTS.md names —
  that tag does not exist on Docker Hub.
- **Consent is a checkbox, not `legalConsentOptions`.** The panel blocks the send until it is
  ticked, but the consent text is not sent to HubSpot; wiring it needs the real form's GDPR
  settings.
- **No signed-url path.** Files are uploaded as `PUBLIC_NOT_INDEXABLE`, which is what the URL
  fields assume; a portal that requires `PRIVATE` files would need
  `GET /files/v3/files/{id}/signed-url`.
- **Untested formats.** HEIC/DWG/DXF are accepted by type and extension, but no fixture exercises
  a real one end to end.
