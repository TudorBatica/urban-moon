# Split the draw engine, part 2: the DOM half, and `engine.js` goes

## Description

The second half of `draw-engine-sanity-split.md`. After that ticket, every decision the floor plan
editor makes lives in pure, tested TypeScript under
`apps/input-capture-web/src/lib/floorplan/engine/`, and `engine.js` is about 1 500 lines of what
touches the DOM: the session variables, `render()`, the view transform measured off the SVG, the
plates, the chips and the control layer, the focus plate, the pointer router, the keys, the
wiring and the public handle. This ticket turns that remainder into typed modules on an explicit
session object, deletes `engine.js` and `engine.d.ts`, and makes `engine/index.ts` the entry point.

**Depends on** `draw-engine-sanity-split.md` being built: it starts from that tree, its golden
fixtures (`engine/fixtures/*.json`, with their recorded `testids` lists) and its pure modules.

Nothing the client sees changes. No route, no test id, no CSS class, no copy, no saved model
shape, no room snapshot changes. `packages/domain-data` and `schemaVersion` are untouched; deploy
order is irrelevant (web app only, no contract change).

---

## Starting point

`engine/engine.js` holds, by the rows of part 1's inventory:

| Row | What is left |
|---|---|
| 3 | Mount plumbing: root/doc/win, `onWin`/`onRoot` bookkeeping, `notifyChange` (fires `onChange` only when `JSON.stringify(model)` changed, never re-entrantly), `exposeGlobals`, `destroy`. |
| 5 | The session variables: `model`, `selection`, `dragState`, `toastState`, `confirmState`, `lastSettledSegId`, `mode`, `landmarkKind`, `tools`, `activeTool`, `view`, `justMade`, `refusedTool`, `hintState`, `keysEnabled`, `zoomHintUntil`, `touchWords`, `carried`, `ids`, the history object. |
| 15 | `showToast`, `hideToast`, `showConfirm`, `hideConfirm`, `offerClamp`. |
| 16 | The view transform: `currentViewBox`, `viewTransform` (from the SVG's viewBox and bounding rect), `cmToClient`, `clientToCm`, `cmToStage`, `stageSize`, `stagePx`, `plateBands` (measured off the plates), `isNarrow` (≤ 860px), `fitNow` (eased with rAF, geometric scale), `stopFitEase`, `applyView`, `zoomBy`, `panView`, `noteZoomed`. |
| 17 | `render()`: settle (landmarks, the deferred merge of the piece that left focus), plates, hint, `applyView`, `viewTransform`, SVG (`planMarkup`), control layer, toast, confirm, `notifyChange`. |
| 20 | Plates: `plateButton`, `divider`, `undoButtons`, `renderToolPlate`, `renderCornerPlates`, `renderHint` (over `hint.ts`), `renderToastDom`, `renderConfirmDialog`. |
| 21 | The HTML layer: `stopChipPointer`, `freeEndObstacles`, `chipObstacles`, `pieceOwnObstacles`, `placeInStage` (clamp into the stage, then up to 8 rounds of pushing clear of every obstacle), `addLabel`, `buildChip`, `buildGapChip`, `bindLengthField` (expandos `_committed`/`_edited`/`_before`/`_commit` on the input), `commitActiveField`, `renderCtrlLayer`, `renderMarkNames`, the focus plate (`plateField`, `plateAction`, `focusPlateAnchor`, `newFocusPlate`, `renderLandmarkPlate`, `renderFocusPlate` with its side flip), the binding of `dims.ts` commit descriptors to `walls.ts`/`openings.ts` operations. |
| 22 | Tools glue: `hasAnyWall`, `pickTool`, `toolUsed`, `activeToolDef`, `toolMakes`, `isMakingStroke`, `isPlacingTap`, `landmarkTools`, `armedTool`. |
| 23 | Gestures: `pointers`, `pinch`, `spaceDown`, `cancelStroke`, `onSvgPointerDown` (the router), `capture`, `beginCommittedDrag`, `applyDragMove`, the edge auto-pan loop, `onSvgPointerMove`, `handleTap`, `placeOpening` (`elementFromPoint`), `placeLandmark`, `focusKey`, `revealFocused`, `onSvgPointerUp`. |
| 24 | Wiring: `init` (DOM refs, pointer listeners, wheel zoom, the touch retarget guards `realBoxMisses` on `touchstart`/`pointerdown`/`click` in the capture phase, hint help link, toast and confirm buttons, the mousedown/click capture that commits a chip before a button acts, window `resize`/`orientationchange`/`keyup`/`blur`/`keydown`), `onKeyDown`. |
| 25 | `setModel`, `bumpIdCounter` (now `ids.bumpPast`), the returned handle. |

---

## The split

### The session

One object, `Session`, in `session.ts`, holds what today is the closure's variables: `model`,
`history`, `ids`, `selection`, `drag: DragState | null`, `toast`, `confirm`, `lastSettledSegId`,
`mode`, `landmarkKind`, `tools`, `activeTool`, `justMade`, `refusedTool`, `hintState`,
`keysEnabled`, `zoomHintUntil`, `touchWords`, `carried`. It is a plain typed object, mutated in
place, created once by `editor.ts` and passed to the DOM modules. Only `editor.ts` and
`gestures.ts` write it; `viewport.ts` owns `view` separately, because the view is not undoable
and not part of the model.

### DOM modules

| File | Purpose | Public surface | Must not know |
|---|---|---|---|
| `session.ts` | The `Session` type and `createSession(opts)` with today's initial values (`armedTool`, `landmarkTools`, `carried` defaults, `touchWords` from `matchMedia`). Tools glue (row 22) as pure functions of the session: `hasAnyWall`, `pickTool`, `toolUsed`, `activeToolDef`, `toolMakes`, `isMakingStroke`, `isPlacingTap`. | as named | DOM elements |
| `dom.ts` | `bindDom(root) => Dom`: injects `TEMPLATE`, resolves the fourteen element refs root-scoped, adds `fp`/`fp-placing`; `unbind` clears them. | `bindDom`, `Dom` | the model |
| `viewport.ts` | Row 16. Owns `view` and the fit animation frame. | `createViewport(dom, win, deps: { planBox(), bands() }) => { transform(), clientToCm, cmToStage, stagePx, stageSize, isNarrow, fitNow(onFrame), stopFitEase, applyView(), zoomBy(factor, atPx), panBy(dx, dy), revealBox(box), reset(), destroy() }`. `plateBands` measures the plate elements the caller names, including the focus plate of the current render. | the model (takes a `Box`), selection, gestures |
| `placement.ts` | Pure: the escape loop of `placeInStage`. Clamp a box into the stage, then up to 8 rounds pushing clear of every overlapping obstacle, preferring the option that clears everything, else the one that clears most. | `placeClear({ pos, w, h, stage, obstacles }) => { x, y, remaining }`. | DOM |
| `chips.ts` | The fields: `buildChip`, `buildGapChip`, `addLabel`, `bindLengthField` (field state in a `WeakMap<HTMLInputElement, FieldState>` instead of expandos; same protocol: `commit` on Enter/blur/pointerdown elsewhere, revert on Escape, no commit without a keystroke), `commitActiveField`, `stopChipPointer`. Confirmation goes through `deps.confirm(message, yesLabel, onYes)`. | as named | the model, dims |
| `ctrlLayer.ts` | `renderCtrlLayer`, `renderMarkNames`, the obstacle sources (`freeEndObstacles`, `chipObstacles`, `pieceOwnObstacles`) and `placeInStage` (append, measure, `placeClear`, write back). | `renderCtrlLayer(ctx)` | history, gestures |
| `plates.ts` | Row 20: `plateButton`, `divider`, the tool plate, the corner plates, the hint line, the toast, the confirm dialog. | `renderPlates(ctx)`, `renderHint(dom, hint, hasHelp)`, `renderToast(dom, toast)`, `renderConfirm(dom, confirm)` | geometry |
| `focusPlate.ts` | The focus plate for a segment and for a landmark: docked on a narrow stage, else placed beside the piece with the side flip. | `renderFocusPlate(ctx) => HTMLElement \| null` | gestures |
| `retarget.ts` | The touch retarget guard: `realBoxMisses` and its three capture-phase listeners. | `installRetarget(root, onMissedPress) => () => void` | the model |
| `keys.ts` | `keyAction(e, ctx) => KeyAction \| null` (pure: which of space, undo, redo, escape, help, delete, zoom in/out, fit, rotate, pick-tool, or nothing), and `installKeys(win, ctx, apply) => () => void` with the `keyup`/`blur` space bookkeeping. | `keyAction`, `installKeys`, `KeyAction` | the DOM tree |
| `gestures.ts` | Row 23 on the `Session`: the pointer router, `beginCommittedDrag` (using `run.ts`'s `beginOpeningRun`/`beginLandmarkRun`), `applyDragMove` (one branch per `DragState` kind, each calling the pure operation), tap handling, `placeOpening`, `placeLandmark`, the edge auto-pan loop, `cancelStroke`, pinch, `revealFocused`, release (`roundAllEndpoints`, `forceSnapWeld`, the resize re-snap, `commitDrawStroke` and its toast). | `installGestures(session, dom, viewport, deps: { render, pushHistory, showToast }) => () => void` | Svelte, routes |
| `editor.ts` | The composition root: `createEditor(root, opts) => FloorplanHandle`. Creates the session, binds the DOM, the viewport, the listeners; `render()` in today's order with the model-settling step named (`settle()`); `notifyChange`; the commit-descriptor binding (`wallTotal` → `commitWallTotal`, `segment` → `commitWallPieceLength` or `resizeSegment` with the clamp offer); `setModel`, `reset`, `setHintState`, `setKeysEnabled`, `destroy`, `exposeGlobals`. | `createEditor` | Svelte, routes |
| `index.ts` | The single entry: `mountFloorplan` (= `createEditor`), `TEMPLATE`, and the types of `engine.d.ts` (`FloorplanHandle`, `MountFloorplanOptions`, `FloorplanModel`) declared here. | | |

### Dependency direction

```
(part 1's pure modules)  placement  session
   dom ← template
   viewport ← view, $lib/ui/motion
   chips ← parseLength, copy
   plates ← copy, glyphs, marks, tools, hint
   focusPlate ← chips, plates, copy, landmarkEdits, topology
   ctrlLayer ← dims, chips, placement, marks, landmarkEdits, topology
   retarget ← (nothing)
   keys ← tools
   gestures ← session, dragState, walls, openings, run, snap, landmarkEdits, topology, viewport
   editor ← everything
   index ← editor, dom
```

A DOM module never imports `editor.ts`. `placement.ts`, `session.ts`'s tools glue and
`keys.ts`'s `keyAction` are pure and tested; the rest is DOM and is checked by the manual list.
`document` and `window` keep coming from `root.ownerDocument`, so two editors can share a page.

---

## Migration order

`engine.js` stays the entry point until the last step and imports each module as it is cut. After
each step `npm run check` and `npm test` pass and the app behaves as before.

1. `session.ts`: the `Session` type and `createSession`; `engine.js` replaces its variables with
   `s.<field>` reads and writes. No other change. (Mechanical, large diff, zero behaviour change;
   do it alone.)
2. `dom.ts`, `retarget.ts`, `keys.ts` (with `keyAction` tests).
3. `placement.ts` (tests), then `chips.ts` and `ctrlLayer.ts`.
4. `plates.ts`, `focusPlate.ts`.
5. `viewport.ts`.
6. `gestures.ts`.
7. `editor.ts` takes what is left of `engine.js`; `index.ts`; delete `engine.js` and
   `engine.d.ts`; `FloorplanEditor.svelte` imports `./engine` and `./engine/engine.css`. Its props
   and exported functions do not change, so the routes do not change.

---

## Tests

Node environment, vitest, as in part 1. No DOM library is added: a layout-less DOM returns zero
for every rect, so a test there would pin degenerate behaviour, not the real one. What needs
layout is covered by the manual check and, once the e2e harness exists, the drawing journey
(`e2e/journeys/drawing.spec.ts`, `docs/code/testing.md`).

| Module | What is pinned |
|---|---|
| `placement` | clamped into the stage; pushed clear of one obstacle on the shortest axis; two rounds when clearing one reveals another; the option clearing everything beats a shorter push that does not; `remaining` reported when no clear spot exists after 8 rounds. |
| `session` | `createSession` in `plan` and `landmarks` mode (armed tool, the two-tool plate); `pickTool` clears the focus except on a refusal; `toolUsed(false)` keeps the tool on. |
| `keys` | `keyAction` for every key `onKeyDown` handles, with and without a focused input, with `keysEnabled` off, with modifiers. |
| `dom` | the `data-testid`s in `TEMPLATE` are a subset of every fixture's recorded `testids` (string scan). |

The recorded `testids` of each fixture are the contract for the elements this ticket rebuilds
(plates, chips, the focus plate, the chain group, mark names, the toast, the confirm dialog). The
manual check below is where they are verified on screen; the dev also greps the new modules for
every `data-testid` value in the fixtures and reports any that no longer has a producer.

---

## Risks and known ugly parts

- **Rendering mutates the model.** `render()` settles landmarks and merges the piece that just
  left focus. Keep it, under one name (`settle()`) at the top of `render()` in `editor.ts`.
- **`dragState` is set in three places** (`onSvgPointerDown`, `resolveFreeEndDirection`, which
  turns a `freeEnd` into a `resize` or a `pan`, and `beginCommittedDrag`, which adds the base
  snapshot and the run). With the union from part 1, the second is a replacement of the object,
  not a mutation of `kind`; the third adds fields the union declares optional until committed.
- **Expando properties** on chip inputs and the capture-phase click that reads `_commit` before
  a button acts: the `WeakMap` keeps the same protocol; `commitActiveField` looks the active
  element up in it.
- **Two transforms.** `view.ts`'s `View` and the DOM-measured `t` both exist; `viewport.ts` owns
  both and the conversion between them. Unifying them is not this ticket.
- **`plateBands` measures the focus plate of the previous render** (`focusPlateEl` is read before
  the control layer is rebuilt). Keep: the viewport asks the editor for the current plate element.
- **`placeOpening` uses `elementFromPoint`** while `placeLandmark` uses geometry
  (`wallUnderPoint`). Both stay as they are.
- **The edge auto-pan loop** re-applies the drag from the last pointer position on every frame;
  it lives in `gestures.ts` and calls `viewport.panBy` then `applyDragMove`.
- **Comments** that narrate history are dropped; the *why* that comes from a platform quirk (the
  touch retarget, the blur-before-click commit, `passive: false` on wheel) stays.

Deliberately left alone: in-place mutation of the model; rebuilding `innerHTML` on every render;
the CSS; the copy; the template and its ids; `mode: 'landmarks'` as a flag; the `tools` option
nobody passes; `exposeGlobals` and `window.__lastModel`.

---

## Done criteria

1. `engine.js` and `engine.d.ts` no longer exist. `floorplan/engine/index.ts` is the only module
   imported from outside `engine/`, and `FloorplanEditor.svelte` is its only importer; its props
   and exports are unchanged; the routes are unchanged.
2. Every file under `engine/` is strict TypeScript; `npm run check` from the root prints no errors;
   no `any`, no `@ts-ignore`, no `as unknown as`. No file over 500 lines.
3. No pure module (part 1's, plus `placement.ts`, `session.ts`, `keys.ts`'s `keyAction`) imports a
   DOM type or a DOM module; no DOM module imports `editor.ts` (checked in review).
4. Every module in the tests table has a `*.test.ts` next to it; part 1's golden tests still
   pass; `npm test` from the root passes.
5. Every `data-testid` in every fixture's recorded `testids` has a producer in the new modules
   (the dev's grep, listed in the summary).
6. Manual check on the local app, at 390×844 and 1440×900, the same list as part 1: draw a closed
   room; type a wall length and a piece length; the metres question on `2.5`; place, slide round a
   corner and past a free end, resize by jamb, rotate and delete a door; a window's sill and its
   carried width; a T-junction stroke; push a wall and drag a corner onto a snap; undo and redo
   through all of it; pinch, wheel, `+`/`-`/`0`, fit; leave and return to the plan; place a
   landmark, slide it onto the other face and round a corner, delete it; the hint reads right in
   touch and mouse words; the `?` key and the hint link open the slides; `Escape` cancels a stroke.
   In addition, what this ticket touches directly: a chip near the stage edge is pulled back on
   screen; a chip never covers a free end; the focus plate flips side when it would cover its own
   piece; on a phone the focus plate docks; a finger press on the halo of a chip reaches the chip
   and one just outside a plate reaches the canvas; pressing a button while a field is open
   commits the field first; two editors mounted on one page (a throwaway test page) do not share
   state.
7. The app README's code map lists the final `engine/` files and the "floorplan editor" paragraph
   no longer says "plain JS".
8. The dev's summary lists every behaviour that looked wrong or surprising while being ported,
   as findings for separate tickets.

## After it is built

The architecture docs do not describe the engine's internals, so nothing there changes; the
architect confirms `docs/README.md` and the app README's code map agree, then deletes this ticket.
