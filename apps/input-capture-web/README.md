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
                              lineIcons.ts (appliance, coffee and landmark drawings) · lineMap.ts
src/lib/plans/                Dropzone · FileTile · DrawingCard · PhotoField · Thumb · Rejections
src/lib/floorplan/            FloorplanEditor.svelte (the wrapper round the editor)
                              marks.ts (the one map from a landmark kind to its colour, token and literal)
                              glyphs.ts (the 20x20 tool and view glyphs, as markup)
                              drawing.ts (builds and saves the Drawing) · seen.ts ("um.draw.seen")
                              device.ts (touch words or mouse words) · tutorialSlides.ts (the help)
                              Slides.svelte · SlideStage.svelte (the stage, a placeholder)
                              export.ts (svg/png)
src/lib/floorplan/engine/     index.ts (mountFloorplan, the handle and its options) · engine.css
                              editor.ts (the composition root: the render, the wiring, the handle)
                              session.ts (the editing session and the tools glue)
                              dom.ts (the template's elements) · viewport.ts (the view, cm <-> px)
                              plates.ts (tools, undo, view, hint, confirm)
                              ctrlLayer.ts (the numbers and names over the plan) · chips.ts (the fields)
                              focusPlate.ts (the plate of the piece in focus)
                              placement.ts (where a chip lands, clear of everything)
                              gestures.ts (the pointer router) · drags.ts (what a committed drag applies)
                              release.ts (what a release settles) · retarget.ts (the touch guard)
                              keys.ts (which action a key is) · numbers.ts (what typing a number does)
                              scene.ts (the plan and the hint, as one read of the session)
                              copy.ts (every Romanian word) · template.ts (the editor's markup)
                              model.ts (the editing model, its constructors and its ids)
                              topology.ts (read-only geometry and connectivity over the model)
                              openings.ts (the segment algebra inside one wall)
                              walls.ts (pushing, corners, cleanup, typed lengths, deleting)
                              strokes.ts (committing a drawn stroke, and squaring its weld)
                              landmarkEdits.ts (what blocks a landmark, and the settling pass)
                              snap.ts (what a gesture catches, in screen px) · dragState.ts
                              run.ts (a piece travelling along a run) · history.ts (undo/redo)
                              snapshot.ts (the room the contract carries) · parseLength.ts
                              hint.ts (the one grey line) · dims.ts (the numbers on the drawing)
                              planMarkup.ts (the plan as SVG)
                              tools.ts (which tool is on) · view.ts (fit, zoom, pan, the limits)
                              chain.ts (the chain of numbers on a wall, and where each one sits)
                              lanes.ts (keeping two walls´ numbers out of each other´s lane)
                              slide.ts (how far a window or a door travels while it is dragged)
                              landmarks.ts (where a landmark may sit, and how it follows its wall)
                              fixtures/ (recorded editors: model, room, svg and test ids per case)
src/lib/submit/               submit.ts (uploads + commit) · resumable.ts (chunked PUTs) · SubmitPanel.svelte
src/lib/server/               config.ts (env) · uploads.ts (session start) · commit.ts (checks + manifest)
                              objects.ts (object names) · log.ts · bucket.ts (re-exports @urban-moon/bucket)
src/routes/                   / · /cuprins · /planuri · /deseneaza · /deseneaza/tavan · /rezumat
                              /deseneaza/repere · /deseneaza/repere/[kind] · /programare · /multumim
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
- **The floorplan editor** lives in `src/lib/floorplan/engine/`, framework-free TypeScript behind
  one entry point (`index.ts`), wrapped in a Svelte component (`FloorplanEditor.svelte`, which
  imports `./engine` and `./engine/engine.css`). It draws only while a making tool is on (Perete,
  Fără perete, Fereastră, Ușă); the resting tool selects, moves and pans. Everything decidable
  without a browser is pure and unit-tested — the model and its geometry (`model.ts`,
  `topology.ts`), every edit (`openings.ts`, `walls.ts`, `strokes.ts`, `landmarkEdits.ts`,
  `run.ts`), what a gesture catches (`snap.ts`, `dragState.ts`), where a chip lands
  (`placement.ts`), which action a key is (`keys.ts`), what is shown (`hint.ts`, `dims.ts`,
  `planMarkup.ts`, `copy.ts`) and what is reported (`snapshot.ts`). What is left touches the DOM:
  one session (`session.ts`) that `editor.ts` creates and passes to the elements (`dom.ts`), the
  view (`viewport.ts`), the plates and the HTML layer (`plates.ts`, `ctrlLayer.ts`, `chips.ts`,
  `focusPlate.ts`), and the pointer (`gestures.ts`, `drags.ts`, `release.ts`, `retarget.ts`).
  `drawing.ts` beside it is the only writer of `um.plans.drawing`. The editor's classes are all
  scoped under `.fp` and share no name with a global rule of `app.css`.
- **The engine's behaviour is pinned by fixtures** under `engine/fixtures/`: one JSON per recorded
  case, each holding the model, the zoom it was recorded at (`scale` and `labelScale`), the room
  snapshot, the plan markup and the test ids the editor produced for it. `snapshot.ts` and
  `planMarkup.ts` are held to reproducing them exactly.
- **Numbers sit in one lane per wall**, 34px outside its band — the distance to the chip's near
  edge, so a number never covers the hit target of the wall it measures. At rest the lane holds that wall's
  own length (`dim-<wallId>`, editable); while a window or a door on it is in focus or dragged
  that number stands down and the same lane holds the chain (`chain`, with `chain-gap-before`,
  `chain-piece`, `chain-gap-after`) instead. `chain.ts` decides what the chain is — each gap runs
  to the first obstacle on its side, the wall's own ends included, and a gap of zero is dropped —
  and where each number goes: one too narrow for its span steps out one lane on a leader, and two
  such in a row are pushed apart. An obstacle the piece shares its stretch of wall with bounds the
  gap too, at whichever of its own edges lies beyond the piece, so no run is ever drawn across a
  jamb it does not stop at. The gaps are read-only. A wall off screen shows no number.
- **A label is sized against the fit, not against the zoom.** Every number, every mark's name and
  the live length riding the pointer are HTML over the SVG, so they are set in screen px rather
  than in the plan's own centimetres. `labelScaleFor` (`dims.ts`) says how much of that designed
  size they are drawn at: their full size at the fit and at every zoom closer in, and shrinking
  with the plan once the client zooms further out than the fit, down to `MIN_LABEL_SCALE` — a plan
  zoomed out to a quarter of the canvas would otherwise disappear under its own numbers. The lane,
  the dimension line's overshoot and ticks, the step-out and the leader all shrink with it
  (`labelPxPerCm` is the px-per-cm those px constants are read at), and the element itself is
  scaled about its own centre, so a shrunken chip is still measured and kept clear at its real
  size. The wall's own hit target and the plan's ink are unaffected: they are drawn in cm.
  The fit it is measured against is `viewport.lastFitScale()` — the scale of the last fit actually
  **performed**, when the editor opened or when the client asked for one, never one recomputed per
  render: drawing a wall that widens the plan would otherwise resize every number under a view the
  client has not touched.
- **Two numbers never share a lane.** Once labels stop shrinking with the plan at
  `MIN_LABEL_SCALE`, the inside of a reentrant corner puts the lanes of its two short walls in the
  same place. `lanes.ts` is the pure rule: whichever number comes second steps out one lane and
  then slides along its own wall until it clears, and `dims.ts` marks it `leader` so the plan
  markup ties it back to its own run. The chain's numbers are obstacles there but never move —
  gap | piece | gap only reads in order.
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
- **Landmarks are the step after the ceiling height.** `/deseneaza/repere` offers the seven kinds
  of `LANDMARK_KINDS` as object cards (`landmark-card-<kind>`, with `aria-pressed` and
  `data-count` read off `plans.drawing.room.landmarks`); nothing there has to be answered, and the
  arrow goes on to `/planuri`. Picking a card opens `/deseneaza/repere/<kind>`, which mounts the
  same engine with `mode: 'landmarks'` and that `landmarkKind`: the tool plate holds Selectează
  and the landmark alone, walls and openings are drawn but take no pointer and their numbers are
  read-only chips rather than fields, and "Gata" saves through `drawing.ts` exactly as the plan
  step does. An unknown kind goes back to the cards.
- **A landmark lives in the engine's model** (`model.landmarks`: id, kind, wallId, the offset of
  its near edge, face), so it is undone, dragged and reported like everything else; a model saved
  before they existed loads with none. `landmarks.ts` is the pure part: where a tap may put one
  (centred, clamped, moved along to the nearest free stretch, refused on a Fără perete side), how
  far a drag gets (its own free stretch, stopping against a landmark on the same face), which face
  a pointer is asking for, and how one follows its wall when that wall is resized, split, merged
  or deleted. Every wall edit ends in one settling pass (`settleOnWalls`) that puts each landmark
  back on what its wall still allows — on the wall, off a stretch with nothing built, and clear of
  the landmarks sharing its face — because clamping alone would leave two of them on the same spot
  when a wall shortens or a split drops both onto one piece. It runs to the same answer however
  many times it runs. A wall that can no longer hold one — shortened past the square, turned into
  a Fără perete side, or cut into a piece too short — keeps it all the same, clamped to the wall's
  start: `showsOnWall` is what decides that it is neither drawn nor touchable nor carried by the
  snapshot until the wall can hold it again, and it is also what stops a drag travelling onto such
  a wall, so an edit elsewhere never throws the client's answer away and the snapshot never states
  a landmark that does not fit the wall it names. Only a deleted wall takes its landmarks with it.
  `buildRoomSnapshot` reports them with `gapBeforeCm`/`gapAfterCm` measured by `chain.ts` — an
  opening's jamb, another landmark's edge on either face, a corner, a free end and the start of a
  Fără perete side all stop a gap, and a landmark may overlap an opening but never another
  landmark on its own face. A radiator under a window measures to that window's jambs, not past
  them.
- **A mark is drawn in cm and named in px**: the square is `LANDMARK_SIZE_CM` against its wall's
  band on its face, so it scales with the plan (`landmark-<id>`, with `data-kind` and
  `data-face`), while its name rides in the HTML layer beside it, sized like every other label.
  Colour
  is the one place the product has any: it comes from the custom properties `app.css` defines,
  through the single kind-to-colour map in `marks.ts`, and reaches only the square, its name chip
  and the square that stands for the landmark in the tool plate. The exported plan draws the same
  two things from that map's literals, since an SVG document string has no stylesheet to read.
- **Saving the plan has no checks**: an open outline, drawn lengths and an unchanged sill are
  saved as they are. `setDrawing` throws when the browser refuses the write, which is what the
  save-failed note is for; deleting the drawing on `/planuri` reports a refused write in that
  screen's own rejection line.
- **The slides are the editor's only help.** Five, one per tool, defined as data in
  `tutorialSlides.ts` with a paragraph for each device, plus the one-entry `LANDMARK_SLIDES` the
  placing screen opens the first time; `Slides.svelte` shows a set of them and `slideView` says
  what one step looks like (position, paragraph, whether "Înapoi" is there, what the button says,
  which the caller names for the last one — "Încep să desenez" for the drawing set, "Am înțeles"
  for the landmark one, whose position text is the landmark's own name). They are mounted by the
  screen, not by the engine, so opening and closing them touches neither the model nor the view;
  while they are open the engine's keys stand down.
  The engine's `onHelp` is what the "Cum desenez" link at the end of the hint line and the `?` key
  call; without it the engine renders no link and `?` does nothing. `SlideStage.svelte` is a
  placeholder: a still box with the tool's glyph, or, for the landmark slide, a square in that
  landmark's colour; marked `data-placeholder="true"`.
- **Touch words or mouse words** (`device.ts`): a screen starts from `(pointer: coarse)` and then
  follows whatever pointer was last used, the same rule the engine's hint line follows.
- **Seen once per browser**: `um.draw.seen`, one JSON object, read and written through `seen.ts`
  with storage injected — `zoomHint`, `slides` and `landmarkSlide` (each written whenever its
  slides close, however they close). Starting the questionnaire again does not clear it.
- **Sending is pure and injectable** (`submit.ts`): fetch, blob lookup, storage, ids and sleeps all
  arrive as options, so the tests drive a whole send without a browser or a bucket.
- **The server only handles small JSON.** File bytes go from the browser straight to the bucket.

## Against the emulator

- **The emulator is not Google:** `fake-gcs-server` ends an upload when asked for its status,
  ignores `ifGenerationMatch` and does not expose `Range` to the browser. The code copes with all
  three; those paths are proven against Google in unit tests only.
