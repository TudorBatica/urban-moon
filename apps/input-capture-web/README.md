# Configurează-ți proiectul — webapp (`apps/input-capture-web`)

The Urban Moon questionnaire and the freehand floorplan capture, in one SvelteKit app. Everything
the user sees is Romanian, addressing them as *tu*.

SvelteKit 2 · Svelte 5 (runes) · TypeScript strict · `@sveltejs/adapter-node` · `idb-keyval` for
plan blobs. No UI library: plain CSS with the tokens in `src/app.css`.

What the app does inside the whole system, and the send protocol it speaks:
`../../docs/architecture/flow.md`. The design language: `../../docs/ux/design.md`. Deploying:
`../../docs/operations/deployment.md`.

## Run it

```bash
npm install             # from the repo root: installs the whole workspace
npm run deps:up         # from the repo root: the Cloud Storage emulator (Docker)
cp .env.example .env    # once: GCS_BUCKET + STORAGE_EMULATOR_HOST
npm run dev             # http://localhost:5173
```

Everything typed lives in the browser (`localStorage` + IndexedDB) until **Trimite răspunsurile**.
Without the emulator (or with `GCS_BUCKET` unset) the questionnaire works, but sending fails with a
503 and `storage_not_configured` in the log.

```bash
npm run check                      # svelte-check — must print 0 errors
npm test                           # vitest, src/**/*.test.ts, node environment, no services needed
npm run build && npm start         # the production Node server, as the container runs it
```

`.env`: `GCS_BUCKET`, `STORAGE_EMULATOR_HOST` (unset in production, where the token comes from the
metadata server), `GCS_ACCESS_TOKEN` (to try a real bucket from a laptop), `APP_VERSION`,
`PUBLIC_CALENDLY_URL`.

## Where things live

```
src/app.html                  lang="ro", fonts, title
src/app.css                   the tokens and every shared class (../../docs/ux/design.md)
src/lib/types.ts              the app's own types; the shared ones come from @urban-moon/domain-data
src/lib/state/answers.svelte.ts   answers store, persisted to localStorage "um.answers"
src/lib/state/plans.svelte.ts     plans store: "um.plans" metadata + blobs in IndexedDB
src/lib/state/photos.svelte.ts    photos: "um.photos" + IndexedDB, up to 10 per group
src/lib/state/cursor.svelte.ts    the resume cursor, "um.cursor"
src/lib/flow/                 engine.ts (navigation, completeness, chrome) + the screen renderers
src/lib/questions/            readback.ts (the "Ce am înțeles" lines) · icons.ts (unused clay set)
src/lib/ui/                   Frame (photo + side shell) · GoBar · Note · Keyed · Seg · CountRow · Reveal · Field · Roll
                              motion.ts (durations, curves, transitions) · images.ts (Unsplash ids, art per screen)
                              lineIcons.ts (appliance + coffee drawings) · lineMap.ts
src/lib/plans/                Dropzone · FileTile · DrawingCard · PhotoField · Thumb · Rejections
src/lib/floorplan/            engine.js (the editor: geometry, rendering, pointers) · engine.css
                              tools.ts (which tool is on) · view.ts (fit, zoom, pan, the limits)
                              chain.ts (the chain of numbers on a wall, and where each one sits)
                              slide.ts (how far a window or a door travels while it is dragged)
                              drawing.ts (builds and saves the Drawing) · seen.ts ("um.draw.seen")
                              export.ts (svg/png) · FloorplanEditor.svelte
src/lib/submit/               submit.ts (uploads + commit) · resumable.ts (chunked PUTs) · SubmitPanel.svelte
src/lib/server/               config.ts (env) · uploads.ts (session start) · commit.ts (checks + manifest)
                              objects.ts (object names) · log.ts · bucket.ts (re-exports @urban-moon/bucket)
src/routes/                   / · /cuprins · /planuri · /deseneaza · /deseneaza/tavan · /rezumat
                              /programare · /multumim
                              /api/health · /api/uploads/start · /api/submissions/[id]/commit
src/routes/+layout.ts         ssr = false — every screen is driven by browser state
tools/icons/                  clay.mjs · build.mjs — the old icon set; nothing renders it since the redesign
```

The questions themselves are not here: the catalog, the answer and manifest schemas and the upload
limits live in `../../packages/domain-data`.

## Implementation notes

- **Screens come from the catalog.** `src/lib/flow/engine.ts` decides what is visible, what counts
  as answered, and what the chrome shows; one renderer per screen kind (single, multi, text,
  compound cards, furniture). URLs are `/?s=<screenId>`; plain `/` resumes from `um.cursor`.
- **"Altceva" options** open a text box: a `followUp` of kind `input` on single/multi screens, or a
  field named `other` inside a compound screen. Continuing needs the text.
- **Furniture screens** (`k13`, `l4`, `d4`, `x3_*`) answer `{ items: [{ name, length, width }] }`
  and take photos of the objects, tagged with that screen's room.
- **"Începe din nou"** clears the answers, the plans, the photos, the IndexedDB blobs and the
  session keys of an in-flight send.
- **The floorplan editor** is plain JS (`engine.js`), framework-free, wrapped in a Svelte
  component. It draws only while a making tool is on (Perete, Fără perete, Fereastră, Ușă); the
  resting tool selects, moves and pans. What is decidable without a browser lives in TypeScript
  beside it and is unit-tested: `tools.ts` (one use, then back to Selectează), `view.ts` (the fit
  into the canvas minus the plate bands, zoom around a point, both limits, the edge auto-pan),
  `chain.ts`, `slide.ts` (below) and `drawing.ts` (the only writer of `um.plans.drawing`). The
  editor's classes are all scoped under `.fp` and share no name with a global rule of `app.css`.
- **Numbers sit in one lane per wall**, 34px outside its band — the distance to the chip's near
  edge, so a number never covers the hit target of the wall it measures. At rest the lane holds that wall's
  own length (`dim-<wallId>`, editable); while a window or a door on it is in focus or dragged
  that number stands down and the same lane holds the chain (`chain`, with `chain-gap-before`,
  `chain-piece`, `chain-gap-after`) instead. `chain.ts` decides what the chain is — each gap runs
  to the first obstacle on its side, the wall's own ends included, and a gap of zero is dropped —
  and where each number goes: one too narrow for its span steps out one lane on a leader, and two
  such in a row are pushed apart. The gaps are read-only. A wall off screen shows no number.
- **An opening slides along a run of walls.** `slide.ts` builds the run — the walls that carry on
  into one another from the one it sits on, a ring coming back as one closed run that travel wraps
  round — and says which wall of it the opening lands on (always wholly one, changing over as its
  middle passes the corner), how far the wall has to grow when it goes past a free end, and which
  of that wall's own ends that is. The run is taken when the drag commits, and each move reads the
  pointer against the leg of it the drag was on or one either side, so travel stays continuous.
  The whole drag is one undo step: every move re-applies from the model as it was when it began.
- **The ceiling height** is asked on `/deseneaza/tavan` and lives on the saved drawing's own
  snapshot (`drawing.room.ceilingHeightCm`), not in the engine's model; a model saved by an
  earlier editor still carries it, and `setModel` accepts and ignores it.
- **Saving the plan has no checks**: an open outline, drawn lengths and an unchanged sill are
  saved as they are. `setDrawing` throws when the browser refuses the write, which is what the
  save-failed note is for; deleting the drawing on `/planuri` reports a refused write in that
  screen's own rejection line.
- **Seen once per browser**: `um.draw.seen`, one JSON object, read and written through `seen.ts`
  with storage injected. Starting the questionnaire again does not clear it.
- **Sending is pure and injectable** (`submit.ts`): fetch, blob lookup, storage, ids and sleeps all
  arrive as options, so the tests drive a whole send without a browser or a bucket.
- **The server only handles small JSON.** File bytes go from the browser straight to the bucket.

## Against the emulator

- **The emulator is not Google:** `fake-gcs-server` ends an upload when asked for its status,
  ignores `ifGenerationMatch` and does not expose `Range` to the browser. The code copes with all
  three; those paths are proven against Google in unit tests only.
