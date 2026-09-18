# Drawing 1: the editor's look, one-use tools, the client's view, saving and the ceiling question

## Description

First of five tickets that rebuild the drawing experience to the settled design. This one makes
the editor itself: it looks like the rest of the questionnaire, draws only with a tool on, never
zooms by itself, puts the thing in focus on a small plate, asks "Gata cu planul?" and saves
without checks, and asks the ceiling height on a screen of its own.

**The visual source of truth is the mockup** `docs/ux/mockups/drawing/drawing-editor.html` (open it
in a browser; phone frames 360×740, desktop 1000×640): sections 1, 2.2 to 2.5, 2.7 to 2.9, 2.11,
3.1, 3.2 and, in part 4, 4.1, 4.2, 4.5, 4.6, 4.8, 4.10. Where this text and the mockup differ, the
mockup wins and this text is corrected. Design language: `docs/ux/design.md` (2, 4, 5, 7.2, 7.3,
7.4, 9), `docs/ux/components.md` ("Tools", "Note"). The editor as it is today, with its defects:
`docs/ux/screens/drawing.md`.

**The series and its order.** Depends on nothing. Then `drawing-2-numbers-and-sliding.md`,
`drawing-3-slides.md`, `drawing-4-landmarks-contract.md` (independent, any time before 5),
`drawing-5-landmarks.md`. Each is shippable alone.

**What the app is like after this ticket and before the others** (all deliberate):

- The ceiling height is asked on its own screen, built here, so it is never lost. Its arrow goes
  to `/planuri`; ticket 5 points it at the landmark cards.
- "Gata cu planul?" says "Urmează înălțimea tavanului. Te poți întoarce oricând la plan."; ticket 5
  restores the designed sentence that also announces the landmarks. For ux to confirm.
- Numbers are in the new look but placed as the engine places them today (a chip per wall piece,
  the pieces either side of an opening editable). Ticket 2 brings the single lane and the chain.
- Openings slide as today (along their wall, and dropped onto another wall). Ticket 2 brings
  round-the-corner and past-a-free-end.
- The hint has no "Cum desenez" link and `?` does nothing: there is no help until ticket 3.

Not in any of the five: the animations inside the slides (`drawing-tutorial-animations.md`).

---

## Experience

Written by the ux agent; the technical plan is built against it and does not change it.

Dropped on the way to the settled design, so nobody builds it: no starting-shape chooser
(rectangle, L-shape), no ceiling plate in the editor, no "Începe din nou", no missing-things line,
no kind switcher, no "+ Ușă / + Fereastră" next to a wall.

### The look (direction A, "Foaie")

- **Chrome.** The questionnaire's top bar with only the wordmark and the step word "Plan"; the
  bottom bar with only "Înapoi" and the round arrow (`aria-label` "Gata, salvează planul").
- **Canvas.** `--paper` from edge to edge between the bars, no page scroll, no photograph.
- **Walls** are a solid ink band, 20 cm thick at the plan's scale. A window is cut out of the band:
  three thin ink lines with a jamb at each end. A door is a thin leaf line and a dashed quarter arc.
  A Fără perete side is a dashed `--grey` line with a tick at each end. Free wall ends show as small
  white circles with an ink edge while Perete or Fără perete is on.
- **Plates** (white, `--line-strong` hairline, 4px radius, 44px rows):
  - *Tools*, top centre of the canvas: the five tools, glyph and word. The active one is filled ink
    with paper text. On desktop undo and redo sit in the same plate after a divider.
  - *Undo and redo*, bottom left on phones (glyph only; `--off` when there is nothing to undo).
  - *View*, bottom right: "Încadrează" on phones; "Mărește", "Micșorează", "Încadrează" on desktop.
  - *The focused thing's plate*: beside the piece on desktop; docked bottom centre on phones, above
    the undo and view plates.
- **Hint line.** One grey line under the tool plate, on a soft paper backdrop so it stays readable
  when the drawing runs under it.
- **Numbers**: a white chip with a hairline, Figtree 13.5px, with its unit. Typed is ink; drawn,
  derived or prefilled is grey italic; not given is `—`. Tapping a chip edits it in place; the
  keyboard never opens by itself. The number of the thing in focus is framed in ink.
- **Defects fixed here** (`docs/ux/screens/drawing.md`): the dimension chip that becomes a
  full-height white column (its `side` class is hit by the Frame's global `.side` rule), the global
  `.field` margin on the editor's own `.field`, the unstyled "Înapoi"/"Gata" buttons, brass and
  red. After this ticket nothing on these screens may pick up a questionnaire class by accident.

### Tools

| Tool | Key | What one use is |
|---|---|---|
| **Selectează** (resting tool) | V | tap a wall, side, opening or number: focus it · drag a wall: move it · drag a handle: move the corner or resize the opening · drag an opening: slide it · drag empty canvas: move the view · tap empty canvas: end focus |
| **Perete** | P | one drag, end to end, with its live length in an ink chip; joins a free end it starts or ends near |
| **Fără perete** | L | the same drag, for a side that opens into another room with nothing built |
| **Fereastră** | F | one tap on a wall: a 60 cm window centred on the touch, moved along just enough to fit |
| **Ușă** | U | one tap on a wall: a 90 cm door |

- **One use, then back to Selectează.** The moment a tool has made one thing it turns itself off,
  Selectează fills again and the new thing is in focus. A tap that makes nothing (no drag for
  Perete and Fără perete; a tap that misses a wall, or lands on a Fără perete side, for Fereastră
  and Ușă) leaves the tool on and the hint repeats what to do. Tapping the tool again, tapping
  Selectează, or Esc turns it off.
- On an empty canvas Perete carries the breathing outline until it is first used. Fereastră and
  Ușă are not dimmed; tapping one says "Desenează întâi un perete."
- There is no way to turn a wall into another kind: delete it (or undo) and draw it again.
  Deleting a wall deletes the windows and doors on it.
- Other keys: R Rotește, Delete or Backspace deletes what is in focus (when no number is being
  edited), Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, + − 0 for the view. Desktop tooltips name each tool
  with its key.

### Focus and plates

- **Focus.** One thing at a time: a `--wash` band, a heavier edge, a white square handle at each
  end or jamb, its number framed in ink, its plate. It ends when the client touches something else,
  taps empty canvas or picks a tool; it survives panning and zooming.
- **Plates** hold only what the thing needs. A wall or a Fără perete side: "Șterge". A window:
  Lățime, Înălțime pervaz, "Șterge" (two rows on phones). A door: Lățime, "Rotește", "Șterge".
  Lățime is the same value as the piece's number on the drawing; editing either edits both. Wall
  lengths are never in a plate; they are on the drawing.
- **Rotește** cycles a door's swing through four: hinge at one jamb opening in, the other jamb in,
  that jamb out, the first jamb out. A new door starts on the first.
- **Defaults carried over.** Window 60 cm wide with a 90 cm sill, door 90 cm. Prefilled numbers are
  grey italic until typed. Once the client types a width or a sill, the next window starts from
  that value, still grey italic.

### View

- Opening the editor and "Încadrează" fit the whole drawing into the drawing area, eased over
  `--base`. An empty canvas fits a 4 × 4 m area. Nothing else changes the zoom.
- **The drawing area** is the canvas minus the plate bands (tool plate and hint on top, the corner
  plates and, on phones, the docked plate at the bottom), so a fit never puts the plan under the
  chrome.
- Phone: two fingers pinch and pan whatever the tool (a second finger landing during a stroke
  cancels the stroke); one finger on empty canvas pans in Selectează. Mouse: the wheel and a
  trackpad pinch zoom around the pointer; dragging empty canvas in Selectează pans; Space + drag or
  the middle button pans with any tool.
- While a stroke or a drag comes within 32px of a canvas edge the view pans toward it at a steady
  pace. When a focused piece would sit under the docked plate, the view pans just enough to show it.
- Limits: zoomed out, the drawing's box is no smaller than a quarter of the canvas's shorter side;
  zoomed in, 50 cm is at most the canvas's shorter side.
- Numbers, handles, chips and plates keep their screen size at every zoom; wall thickness scales
  with the plan.
- The first time the client zooms or pans, the hint shows the zoom line for 4 s, once per browser.

### Finishing and the ceiling height

1. **"Gata cu planul?"** Pressing the arrow opens a note over a light scrim with "Mai am de lucru"
   (outline) and "Continuă" (filled). "Continuă" saves and opens the ceiling question; while it
   saves the arrow shows as pressed and takes no second press (hint "Se salvează…"). **There are
   no checks**: an open outline, drawn lengths and an unchanged sill are saved as they are. The
   arrow is grey only while the canvas is empty.
2. **Ceiling height.** A question screen (`noart` Frame, step word "Plan"): "Cât de înalt e
   tavanul?", subtitle "Măsoară de la podea până la tavan, în cameră.", a field "Înălțime" with
   "cm", the line "De obicei între 250 și 300 cm." The arrow waits for a number; on phones the
   number keyboard opens with the screen. A height given before is prefilled.
3. A saved drawing reopened from `/planuri` opens in the editor, fitted, with Selectează on.

### States

| State | What the client sees |
|---|---|
| Empty canvas | tool plate with Perete breathing, hint, view plate; arrow grey |
| A making tool on | that tool filled; free ends as circles; hint says the gesture |
| Drawing | translucent ink band with a dashed centre line, live length in an ink chip |
| Just made, or touched | Selectează filled; the piece in focus with its plate and framed number |
| Dragging an opening | plate hidden |
| Arrow pressed | "Gata cu planul?" |
| Saving | arrow pressed, "Se salvează…" |
| Save failed | a note above the bottom bar, the drawing stays as it was |
| Leaving with changes ("Înapoi") | the discard note |
| Ceiling, empty / answered | the arrow waits / is available |

### Copy

| Where | Phone (touch) | Desktop (mouse) |
|---|---|---|
| Tools | Selectează · Perete · Fără perete · Fereastră · Ușă | same, tooltips with keys |
| Plates | Lățime · Înălțime pervaz · Rotește · Șterge | same |
| View | Încadrează | Mărește · Micșorează · Încadrează |
| Hint, empty canvas | Alege **Perete**, apoi trage cu degetul ca să faci primul perete. | Alege **Perete** (tasta P), apoi ține apăsat și trage ca să faci primul perete. |
| Hint, while drawing | Ridică degetul ca să termini peretele. | Dă drumul butonului ca să termini peretele. Esc renunță. |
| Hint, wall just drawn | Atinge numărul ca să scrii lungimea. Pentru încă un perete, alege din nou Perete. | Dă clic pe număr ca să scrii lungimea. Pentru încă un perete, alege din nou Perete (P). |
| Hint, Fără perete on | Trage pe unde camera se deschide spre altă cameră. | same |
| Hint, Fără perete in focus | Atinge numărul ca să scrii lungimea. Trage linia ca s-o muți. | Dă clic pe număr ca să scrii lungimea. Trage linia ca s-o muți. |
| Hint, Fereastră on | Atinge peretele pe care e fereastra. | Dă clic pe peretele pe care e fereastra. |
| Hint, Ușă on | Atinge peretele pe care e ușa. | Dă clic pe peretele pe care e ușa. |
| Hint, Fereastră or Ușă with no wall | Desenează întâi un perete. | same |
| Hint, window in focus | Trage fereastra ca s-o muți pe perete. Atinge înălțimea pervazului ca s-o schimbi. | Trage fereastra ca s-o muți pe perete. Dă clic pe înălțimea pervazului ca s-o schimbi. |
| Hint, door in focus | Trage ușa ca s-o muți pe perete. Apasă Rotește până se deschide ca la tine. | Trage ușa ca s-o muți pe perete. Apasă Rotește (R) până se deschide ca la tine. |
| Hint, wall in focus | Trage peretele ca să-l muți. Atinge numărul ca să schimbi lungimea. | Trage peretele ca să-l muți. Dă clic pe număr ca să schimbi lungimea. |
| Hint, first zoom (4 s) | Apropie sau depărtează două degete ca să mărești. Cu două degete muți planul. | Rotița mărește în jurul cursorului. Trage de fundal ca să muți planul. |
| Hint, saving | Se salvează… | same |
| Before leaving | Gata cu planul? · Urmează înălțimea tavanului. Te poți întoarce oricând la plan. · Mai am de lucru · Continuă | same |
| Save failed | Planul nu s-a salvat. · Verifică legătura la internet și încearcă din nou. · Încearcă din nou | same |
| Leaving with changes | Renunți la modificări? · Rămân aici · Renunț | same |
| Ceiling | Cât de înalt e tavanul? · Măsoară de la podea până la tavan, în cameră. · Înălțime · cm · De obicei între 250 și 300 cm. | same |
| Arrow `aria-label` | Gata, salvează planul | same |

### Open items and assumptions in this ticket

Build the stated default; each is small to change later.

- **O3. Save failure and leaving with changes** are not drawn in the mockup; ux specified them from
  `design.md` 7.2 with the copy above. Technical note for ux: saving is local to the browser (the
  drawing goes into `localStorage`; nothing is sent until the whole submission is sent), so a
  failed save is a failed raster or a full browser storage, never the network. "Verifică legătura
  la internet și încearcă din nou." is built as given and is flagged for ux to reword.
- **The "Ușă on" hint** is not in the ux copy; it is written by analogy with Fereastră so the
  state has a line. For ux to confirm.
- **The shortened "Gata cu planul?" sentence** (above) until ticket 5. For ux to confirm.
- **A5. The exported plan** (the image on the drawing card at `/planuri` and in the architect's
  PDF) follows the canvas's drawing rules: solid ink band, window and door as above, dashed grey
  Fără perete side, Figtree, no brass.
- **A6. A client who leaves after "Continuă" but before answering the ceiling height** has a saved
  drawing with no height; `/planuri` shows the card and the send is allowed. The PDF already prints
  "necompletată" for it.

---

## Technical plan

### What exists and is reused

`apps/input-capture-web/src/lib/floorplan/engine.js` (framework-free, mounted by
`FloorplanEditor.svelte`):

| Exists | Where | Change |
|---|---|---|
| Walls as a set of axis-aligned pieces joined by snapping; the stroke with its live length; welding to free ends; closed-ring detection | `commitDrawStroke`, `findStartSnap`, `findEndpointSnap`, `traceChain` | a stroke starts only while Perete or Fără perete is on |
| A whole side with nothing built | a wall with `isOpen` and one `open` segment | made by the Fără perete tool |
| Moving a wall, dragging a corner, resizing from a free end | `dragPushWall`, `dragCornerAtPoint`, `resizeEndpointSnap` | only in Selectează |
| Openings as segments of a wall: add, resize by jamb, slide, drop on another wall | `addOpening`, `resizeSegment`, `slideSegment`, `moveOpeningToWall` | added by one tap with a tool on; never on an `open` wall |
| Door swing as a cycle of four | `DOOR_SWING_COMBOS`, `cycleDoorSwing` | none; same order as the design |
| Numbers with provenance, edited in place, as HTML over the SVG so they keep their size | `segDim`, `allDims`, `buildChip`, `bindLengthField`, `renderCtrlLayer` | the new look only |
| Undo and redo, model get and set, the room snapshot | `pushHistory`, `getModel`/`setModel`, `buildRoomSnapshot` | the ceiling height leaves the model |
| The printable plan from a snapshot, pure | `export.ts` | the new look |
| Discard note, save into `um.plans`, the drawing card | `routes/deseneaza/+page.svelte`, `state/plans.svelte.ts` | below |

Removed from the engine: drawing on any drag, the refit after every render (`fitViewBox` called
from `render`), the bottom bar with the ceiling field and the missing-things line (`renderBar`,
`renderMissingLine`, `setCeilingHeight`), the kind switcher (`renderCluster`, `changeKind`), the
"+ Ușă / + Fereastră" piece actions, the hatch pattern, every brass and red token (`--fp-brass*`
in `FloorplanEditor.svelte` and `engine.css`), the engine's own confirm dialog if nothing uses it.
The default window width goes from 100 to 60 cm. The route's "Conturul nu e închis încă." note
goes. The engine stops listing the ceiling height in the snapshot's `unanswered`.

No contract change: the room snapshot keeps its shape (`packages/domain-data` is not touched).

### New logic: pure TypeScript modules next to the engine, each with unit tests

`engine.js` stays JavaScript where it is only edited, and calls:

- `tools.ts`: the tool state machine. Inputs: tool picked, tap, completed stroke, placed piece,
  Esc, key. Outputs: the active tool, what to make, what gets focus. The one-use rule, "a use that
  makes nothing keeps the tool on" and the empty-canvas rule for Fereastră and Ușă live here. It
  takes the list of tools as data (ticket 5 mounts the engine with a different list).
- `view.ts`: the view as `{centre, scale}`: fit into a drawing area (an empty model fits
  400 × 400 cm), zoom around a point, pan, the two limits, the edge auto-pan step, "pan just enough
  to clear the docked plate". The engine turns the view into the SVG's `viewBox`; `viewTransform`,
  `cmToClient` and the HTML chip layer keep working from it. Pointer handling gains a
  second-pointer path (pinch and two-finger pan, cancelling a stroke in progress), wheel and
  trackpad pinch (`ctrlKey` wheel), Space or middle-button pan.
- `drawing.ts`: builds a `Drawing` (`model`, `room`, `svg`, `pngDataUrl`, `updatedAt`) and is the
  only writer of `um.plans.drawing`. The ceiling height's truth is `drawing.room.ceilingHeightCm`:
  - saving from the editor: the engine's model and snapshot, with the height carried over from the
    drawing saved before (a model saved by the old editor still has `ceilingHeightCm`; `setModel`
    accepts and ignores it);
  - answering the ceiling height: the saved snapshot with the new height, no engine mounted;
  - both re-render the SVG and the PNG through `export.ts` (the image states the height).
- Carried-over defaults (window width and sill) are engine session state: not in the model, not
  undoable, kept while the editor is mounted.

`setDrawing` must report a failed write instead of swallowing it (today `persist()` catches and
carries on in memory); the save-failed note depends on it and on a failed raster.

### Routes and chrome

- `/deseneaza`: the app's top bar and `GoBar` (its `next` button with the editor's `aria-label`)
  replace the route's own strip and `.btn` buttons. "Înapoi" goes to `/planuri`, through the
  discard note when the model changed. "Continuă" saves, then goes to `/deseneaza/tavan`.
- `/deseneaza/tavan`: needs a saved drawing (else `/deseneaza`); "Înapoi" to `/deseneaza`; the
  arrow writes the height and goes to the target held in one constant, `/planuri` for now.
- Both keep the redirect to `/?s=c_rooms` when no room is picked.
- The **Note** becomes a shared component in `src/lib/ui/` (title, optional lines, outline and
  filled actions, optional scrim), used by the three notes here.
- The engine gains `onChange` reporting enough for "empty" and "changed", and a way to suspend its
  keys while a note is open. The hint wording follows the pointer last used (`pointerType`),
  starting from `(pointer: coarse)`. The engine keeps its Romanian in its `RO` table.
- CSS: the engine's styles are rewritten on the design tokens (`--paper`, `--ink`, `--grey`,
  `--wash`, `--line-strong`, `--off`); every class inside the engine's root is scoped under `.fp`
  and none shares a name with a global rule of `app.css` (`side`, `field`, `note`, `btn`, `nav`
  are the known collisions). The old brass, stone, smoke and ash tokens are deleted from `app.css`
  once nothing uses them.
- Seen-once flags: one `localStorage` key, `um.draw.seen`, a JSON object; this ticket writes
  `zoomHint`. It is about the browser, not the project: `/multumim` does not clear it. One small
  module with storage injected reads and writes it.

### Unit tests

`tools.test.ts` (each tool's one use; each way of making nothing; the empty model; Esc; tapping
the active tool), `view.test.ts` (fit with and without bands, the empty fit, zoom keeps the point
under the pointer still, both limits, the auto-pan step, clearing the docked plate),
`drawing.test.ts` (both ways a `Drawing` is built; the height survives a re-save; an old model
loads), `export.test.ts` updated to the new look, the seen-flags module.

### Test ids

| Test id | On |
|---|---|
| `editor`, `editor-svg`, `stage` (kept) | the engine's host, SVG and stage |
| `tool-select`, `tool-wall`, `tool-open`, `tool-window`, `tool-door` | the tools; the active one has `aria-pressed="true"` |
| `undo`, `redo` (kept), `view-fit`, `view-zoom-in`, `view-zoom-out` | the plates |
| `hint` | the hint line, with `data-state` naming the state |
| `seg-<id>`, `seg-<id>-hit`, `dim-<id>`, `corner-<x,y>`, `free-end-<x,y>`, `opening-edge-<edge>-<id>` (kept) | the plan's pieces and numbers |
| `focus-plate`, `plate-width`, `plate-sill`, `plate-rotate`, `plate-delete` | the focus plate |
| `btn-back` (kept), `next` (the app's arrow, replacing `btn-done`) | the bottom bar |
| `note-done`, `btn-keep-drawing` (kept), `btn-continue` | "Gata cu planul?" |
| `note-discard` (kept), `btn-stay`, `btn-discard` (kept) | leaving with changes |
| `note-save-failed`, `btn-retry-save` | save failed |
| `ceiling-input` (kept, now on `/deseneaza/tavan`) | the ceiling height field |

Removed with their UI: `bar`, `cluster`, `missing-summary`, `missing-list`, `note-unclosed`,
`btn-save-anyway`, `btn-done`, `empty-hint`.

### For qa

Drags on empty canvas no longer draw and the ceiling height has its own screen, so
`journeys/drawing.spec.ts` (flow step 4 in the journey map of `docs/code/testing.md`, full tier)
changes: journeys 1 to 3 of its section in `e2e-full-journeys.md` are written against this ticket.
`e2e/fixtures/state/drawing.json` is recaptured from the new editor.

### Rules and scope

- `docs/code/standards.md`: code never references docs, the mockup or a ticket; comments say why.
  `engine.js` is full of comments that tell history and cite old specs; every function this ticket
  touches leaves without them (the sweep of the rest is `comments-to-standard.md`).
- The export's caption stays as it is; translating it is `floorplan-caption-romanian.md`.
- No network, no new endpoint, no change to the send or the commit. Deploy: web app only, smoke
  tier.
- Out of scope: the single lane, the chain and the sliding changes (ticket 2), the slides
  (ticket 3), landmarks (4, 5), diagonal walls, more than one room, any check before saving, the
  copy document `apps/input-capture-web/COPY-chestionar(1).md` (ux updates it once screens are
  built, `design.md` 8).

## How to verify it once delivered

`npm run check` and `npm test` pass. Then, at 390×844 with touch and 1440×900 with a mouse,
against the mockup sections named at the top:

1. With Selectează on, dragging on the empty canvas draws nothing (it moves the view).
2. Each of the four making tools makes exactly one thing and Selectează is filled again with the
   new thing in focus; each way of making nothing leaves the tool on; Esc and a second tap turn it
   off; Fereastră on an empty canvas says "Desenează întâi un perete."
3. Drawing a second wall never moves or zooms the view. Pinch, wheel, pan, the three view
   controls, both zoom limits, auto-pan at the edge; "Încadrează" never puts the plan under a plate.
4. Focus plates per kind of thing, docked on the phone; Rotește walks the four swings; a typed
   window width and sill prefill the next window in grey italic; every key in the table.
5. Every hint in the copy table appears in its state, in the device's words.
6. No brass, no red, no hatch, no full-height white column after the second wall; the chrome is
   the questionnaire's.
7. The arrow is grey on an empty canvas; "Gata cu planul?" → "Mai am de lucru" returns, "Continuă"
   saves an open outline with no complaint and opens the ceiling question; the arrow there waits
   for a number; then `/planuri` shows the drawing card with the new-look image.
8. "Modifică" reopens the plan fitted with Selectează on; going through again, the ceiling height
   is prefilled and survives.
9. "Înapoi" with changes shows the discard note; a save made to fail (storage full) shows the
   save-failed note and keeps the drawing.
10. A full send with the drawing: the PDF's drawn-plan page shows the new-look image and the
    ceiling height.

## After it is built

The architect updates `docs/architecture/flow.md` step 4 (tools, no checks, the ceiling height on
its own screen, what "Continuă" saves) and `docs/architecture/storage.md` (`um.draw.seen`). The ux
agent updates "As it is today" and removes the fixed defects in `docs/ux/screens/drawing.md`,
marks the built parts in `docs/ux/components.md`, and adds the copy to the copy document. Then
this ticket is deleted.
