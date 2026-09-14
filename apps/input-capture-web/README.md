# Configurează-ți proiectul — webapp (`apps/input-capture-web`)

The Urban Moon questionnaire and the freehand floorplan capture, in one SvelteKit app. Everything
the user sees is Romanian, addressing them as *tu*. HubSpot is not this app's concern: the PDF
worker (`apps/input-pdf-worker`) delivers submissions there.

SvelteKit 2 · Svelte 5 (runes) · TypeScript strict · `@sveltejs/adapter-node` (a Node server for
Cloud Run; `ADAPTER=cloudflare` builds the old Worker) · `idb-keyval` for plan blobs. Deploying:
`../../docs/deployment.md` (first-time setup: `../../docs/deploy-web-gcp.md`). Production build locally: `npm run build && npm start`. No UI library: plain CSS with the tokens in `src/app.css`.

## Run it

```bash
npm install            # from the repo root: installs the whole workspace
npm run deps:up         # from the repo root: the Cloud Storage emulator (Docker)
cp .env.example .env    # once: GCS_BUCKET + STORAGE_EMULATOR_HOST
npm run dev             # http://localhost:5173
```

Open <http://localhost:5173> and answer the questionnaire. Everything you type lives in your own
browser (`localStorage` + IndexedDB) until you press **Trimite răspunsurile**. Without the
emulator (or with `GCS_BUCKET` unset) the questionnaire works, but sending fails.

## Test it

```bash
npm run check     # svelte-check — must print 0 errors
npm test          # vitest, src/**/*.test.ts, environment node (no services needed)
```

## Where things live

```
src/app.html                  lang="ro", fonts, title
DESIGN.md                     the design language: tokens, type, components, icon rules
src/app.css                   the tokens and every shared class (see DESIGN.md)
src/lib/types.ts              the shared types in CONTRACTS.md
src/lib/state/answers.svelte.ts   answers store, persisted to localStorage "um.answers"
src/lib/state/plans.svelte.ts     plans store: "um.plans" metadata + blobs in IndexedDB
src/lib/state/cursor.svelte.ts    the resume cursor, "um.cursor"
src/lib/questions/            readback.ts · icons.ts (old clay set, no longer rendered)
../../packages/domain-data/   the question catalog (screens, rooms, predicates), shared types, limits,
                              manifest schema — imported as @urban-moon/domain-data
src/lib/flow/                 engine.ts (navigation, completeness, chrome) + the screen renderers
src/lib/ui/                   Frame (photo + side shell) · GoBar · Keyed · Seg · CountRow · Reveal · Field · Roll
                              motion.ts (durations, curves, page/roll/crossfade transitions)
                              images.ts (Unsplash ids, artFor(screen), contents thumbnails)
                              lineIcons.ts (appliance + coffee drawings) · lineMap.ts
src/lib/plans/                Dropzone · FileTile · DrawingCard · PhotoField · Thumb · Rejections
tools/icons/                  clay.mjs · build.mjs — the old clay icon set; nothing renders it since the redesign
src/lib/floorplan/            engine.js (the editor) · engine.css · export.ts (svg/png) · FloorplanEditor.svelte
src/lib/submit/               submit.ts (uploads + commit) · resumable.ts (chunked PUTs) · SubmitPanel.svelte
src/lib/server/               bucket.ts (Cloud Storage JSON API over fetch) · config.ts (env) · uploads.ts
                              (session start) · commit.ts (checks + manifest) · objects.ts · log.ts
src/routes/                   / · /planuri · /deseneaza · /rezumat · /programare · /multumim
                              /api/health · /api/uploads/start · /api/submissions/[id]/commit
src/routes/+layout.ts         ssr = false — every screen is driven by browser state
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
- Limit: `rooms × 2` files, never fewer than 2. Accepted: PDF, JPG, PNG (the lists and limits
  live in `@urban-moon/domain-data`); images up to 10 MB, PDFs up to 25 MB for now. Rejections —
  wrong type, too big, over the limit, duplicate — are listed in Romanian and never silently drop
  a file.
- It is preceded by its own question screen, "Ești dispus să modifici spațiul…?" (`p_modify`,
  multi, "Nu" exclusive). The step itself opens with the measuring disclaimer and an "Am măsurat
  spațiul" checkbox (`p_measured`): until it is ticked, drawing, uploads and photos are disabled.
- Continuing needs `p_measured` and at least one file or a drawing.

## Sending (`../../docs/pdf-pipeline-design.md` §5–6)

Everything lands in the bucket under `submissions/<submissionId>/`:

1. **Upload sessions.** For each plan, photo and the drawn plan's PNG, the browser asks
   `POST /api/uploads/start` (`{submissionId, fileId, kind, name, type, size}`). The server checks
   type and size against `@urban-moon/domain-data`, fixes the object name
   (`uploads/<fileId>.<jpg|png|pdf>`, `uploads/drawing.png`) and opens a Cloud Storage resumable
   session, returning its URI. Three files go at a time.
2. **Bytes go straight to the bucket.** The browser PUTs the file to that URI in 8 MiB chunks
   (`resumable.ts`); after a network error it asks the session how much arrived and carries on.
   A finished upload is remembered in `sessionStorage["um.uploads"]`, so a retry skips it. The
   panel shows a percentage per file.
3. **Commit.** `POST /api/submissions/<id>/commit` with the answers, the drawing's room and SVG,
   and the file list. The server checks each object is there with the declared size and really a
   JPEG, PNG or PDF (first 16 bytes), builds the manifest, validates it with `ManifestSchema`
   and writes `manifest.json` only if it does not exist yet (`ifGenerationMatch=0`). Then it writes the
   empty object `pending/<id>`, which is how the PDF worker finds new submissions. A repeat
   commit answers `ok` (and puts the marker back). Files it cannot find come back as `missing` and are uploaded again on
   the retry.
4. On `ok` the panel goes to `/programare` (Calendly), or `/multumim` with no Calendly link, and
   clears `um.submissionId` / `um.uploads`.

Logs are one JSON line each: `upload_session_created`, `upload_start_rejected`,
`submission_committed`, `submission_already_committed`, `commit_rejected`, `commit_failed`,
`storage_not_configured`. Session URIs are never logged.

Configuration (`.env` locally): `GCS_BUCKET`, `STORAGE_EMULATOR_HOST` (the emulator; unset in
production, where the token comes from the Cloud Run metadata server), `GCS_ACCESS_TOKEN` (to
try a real bucket from a laptop), `APP_VERSION`.

## Known gaps

- **No submission token yet** (design §12): anyone who knows a submission id could write into
  it. Ids are random UUIDs, so this is fine for local testing, not for production.
- **The PDF worker does not pick up `pending/` yet** (design §7): until it does, it is run by hand
  on a pulled submission.
- **No real bucket yet.** Checked against the emulator only. Real Cloud Storage also needs the
  bucket's CORS set for the app's origin (exposing `Range`), and the app on Cloud Run for its
  token; the Cloudflare deploy has neither, so sending fails there with a 503.
- **The emulator is not Google.** `fake-gcs-server` ends an upload when asked for its status,
  ignores `ifGenerationMatch`, and does not expose `Range` to the browser. The code copes with
  all three (it only asks for status after an error, checks for the manifest before writing,
  and assumes a chunk arrived when it cannot read `Range`), but those paths are only proven
  against Google in unit tests.
- **The exported plan is captioned in English.** `src/lib/floorplan/export.ts` still writes
  `All dimensions in cm · Ceiling <n> cm · outline not closed` into the SVG/PNG footer (and
  `export.test.ts` asserts it). The editor's own chrome is Romanian.
- **Consent is a checkbox only.** The panel blocks the send until it is ticked; the consent text
  is not recorded with the submission yet.
