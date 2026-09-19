# Split the draw engine

## Description

The draw engine under input-capture-web has become an insane JS piece of shit thousands LoC long monster.
Split it into multiple TS components.
Order:
1. do a subdirectory under floorplan exclusively for the engine files.
2. read the existing .js engine and design components to be split into
3. write unit tests for those components to validate the exact same behaviour is kept
4. implement the components to pass the unit tests

The four steps stay, in that order, with two things made explicit:

- Step 2 is done here: the sections below are the design. The dev does not redesign; they build it
  and come back with findings where the code disagrees with the ticket.
- Steps 3 and 4 run **per component, interleaved**, not "all tests, then all code". `engine.js` is
  one closure: nothing inside it can be imported by a test until it has been cut out. So the
  behaviour is pinned in two layers: golden fixtures recorded from the old engine before any code
  moves (3a), and a unit test file written for each component as it is extracted (3b), checked
  against those fixtures. Every step leaves the app working and `npm test` green.

The split is two tickets. **This one takes every decision out of `engine.js`**: the model, the
geometry, the edits, snapping, sliding, the snapshot, the hint, the dimensions and the plan
markup become pure TypeScript modules with tests, and `engine.js` shrinks to what touches the DOM
(rendering into elements, pointers, keys, the view) and imports them. The remainder, turning that
DOM half into typed modules and deleting `engine.js`, is `draw-engine-split-2-dom-and-gestures.md`.

Nothing the client sees changes. No route, no test id, no CSS class, no copy, no saved model
shape, no room snapshot changes. `packages/domain-data` and `schemaVersion` are untouched; deploy
order is irrelevant (web app only, no contract change).

---

## What the engine does today

`apps/input-capture-web/src/lib/floorplan/engine.js` is `mountFloorplan(root, opts)`: a factory
whose whole body is one closure over the model, the selection, the drag, the view and the DOM
refs. It is consumed by exactly one file, `FloorplanEditor.svelte`, through the `FloorplanHandle`
in `engine.d.ts` (`room`, `getModel`, `setModel`, `reset`, `isEmpty`, `setHintState`,
`setKeysEnabled`, `destroy`) and the `MountFloorplanOptions` (`onChange`, `onHelp`, `mode`,
`landmarkKind`, `tools`, `seenStorage`, `exposeGlobals`). The three routes (`/deseneaza`,
`/deseneaza/repere/[kind]`, and `/deseneaza/tavan` which mounts nothing) only ever talk to
`FloorplanEditor.svelte`. The pure modules already beside it (`tools.ts`, `view.ts`, `chain.ts`,
`slide.ts`, `landmarks.ts`, `marks.ts`, `glyphs.ts`, `seen.ts`) are the pattern to continue: cm in,
cm out, no DOM.

Grouped by responsibility, in the order the file has them (function names, so this stays true
when lines move). Rows marked **A** leave `engine.js` in this ticket; rows marked **B** stay in it
until the follow-up.

| # | | Responsibility | What is there |
|---|---|---|---|
| 1 | A | **Copy** | `RO`: every Romanian string, the hint lines as functions of `touch`, the landmark names mid-sentence. |
| 2 | A | **Template** | `TEMPLATE`: the editor's markup with its ids and `data-testid`s; `$id` scoped to the root. |
| 3 | B | **Mount plumbing** | root/doc/win, listener bookkeeping (`onWin`, `onRoot`), `notifyChange` (fires `onChange` only when `JSON.stringify(model)` changed, never re-entrantly), `exposeGlobals` (`window.__room`, `__reset`, `__lastModel`), `destroy`. |
| 4 | A | **Constants and arithmetic** | `MIN_WALL`, `MIN_OPEN`, `DEFAULT_DOOR_W`, `DEFAULT_WINDOW_W`, `DEFAULT_SILL`, `WALL_THICKNESS_CM`, `SNAP_PX`, `TAP_PX`, `FREE_END_DECIDE_PX`, `WELD_EPS`, `MIN_STROKE_PX`; `r`, `clamp`, `dist`, `pointsEqual`, `pointKey`; `uid` with a per-instance counter and `bumpIdCounter` after `setModel`. |
| 5 | A/B | **Model and session state** | `model = { walls, landmarks }` (walls are an unordered set; adjacency is by coincident endpoints, never array order), `selection` (`{segId}` or `{landmarkId}`), `dragState`, `toastState`, `confirmState`, `lastSettledSegId`, `mode`, `landmarkKind`, `tools`, `activeTool`, `view`, `justMade`, `refusedTool`, `hintState`, `keysEnabled`, `zoomHintUntil`, `touchWords`, `carried` (last typed window width and sill). Constructors `makeSegment`, `makeWall` (refuses a diagonal), `minFor`. The types and constructors go (A); the variables stay in the closure (B). |
| 6 | A | **History** | `snapshotModel` (deep clone), `pushHistory` (cap 300, clears redo), `restoreSnapshot`, `undo`, `redo`, `resetAll`. A drag pushes one step when it commits and re-applies every move from `ds.base`; `cancelStroke` pops that step. |
| 7 | A | **Landmark glue** | `findLandmark`, `landmarksOn`, `focusedLandmark`, `openSpansOf`, `blockersFor`, `markWallLengthCm`, `landmarkObstacles`, `landmarkShows`, `syncLandmarks` (the settling pass, run at the top of every render, which also drops a hidden landmark from focus). The rules themselves are in `landmarks.ts`. |
| 8 | A | **Topology** (read-only) | `findWall`, `wallLen`, `wallDir`, `wallNormal`, `headingOf`, `headingVec`, `snapHeading`, `segLen`, `segTotal`, `wallsAtPoint`, `neighborAt` (exactly one neighbour, so a T-junction has no answer on purpose), `isFreeEnd`, `traceChain`, `findClosedRing` (traced from `model.walls[0]` only), `isClosedLoop`, `collectVertices`, `projectOnSegment`, `pointAlong`, `segPoints`, `planPoints`/`planBox`, `wallUnderPoint`. |
| 9 | A | **Outline edits** (mutate walls' geometry) | `pushWallByRef` (one hop and stop), `dragPushWall`, `dragCornerAtPoint`, `cleanupOutline` (drops zero-length walls, merges collinear end-to-end walls and their landmarks), `splitWallAtPoint` (T-junction), `squareWeldToVertex`, `commitDrawStroke` (the whole stroke commit: split, square, make, cleanup, then a toast), `setWallLengthExact`, `commitWallPieceLength`, `commitWallTotal`, `extendWallAtEnd`, `finalizeDragWeld` (rounds every endpoint at release, forces a caught snap bit-exact). |
| 10 | A | **Segment sync** | `reflow`, `segIsFresh` (reads `selection`), `mergeAdjacentPlain`, `dropZero`, `resizeWallKeepingSegments`, `syncSegmentsForAllWalls`: segments always partition the wall's geometric length; geometry is the truth. |
| 11 | A | **Openings** (inside one wall) | `findSeg`, `findSegAnywhere`, `flexRun`, `drain`, `resizeSegment` (returns `{ok, applied}` or `{ok:false, max}`), `slideSegment`, `addOpening` (defaults from `carried`), `removeSegmentToWall`, `deleteSelection`, `bestFlexSegmentFor`, `moveOpeningToWall`, `sliceSegments`, `setSegSill`/`setSegHinge`/`setSegSwing`, `DOOR_SWING_COMBOS`, `defaultDoorSwing`, `cycleDoorSwing`. |
| 12 | A | **Sliding along a run** | `runWallInputs`, `runPoints`, `legAtArc`, `arcOnRun` (continuity: only the leg the drag was on and its two neighbours), `entryFor`, `applyOpeningSlide`, `applyLandmarkSlide`. The run itself is `slide.ts`. |
| 13 | A | **Snapping** | `distPx`, `findStartSnap` (vertices only), `findEndpointSnap` (vertex weld, then T-junction at the exact axis intersection, then alignment), `resizeEndpointSnap` (refuses an off-axis weld), `findPushSnap` (1 DOF, free ends only), `findCornerSnap`. All in screen px through `t.scale`. |
| 14 | A | **The snapshot** | `buildRoomSnapshot` (ring order when closed, chains otherwise, openings flattened, landmarks through `snapshotLandmarks`, `unanswered` from `computeUnanswered`, `ceilingHeightCm: null`), `parseLengthInput` (the metres trap). |
| 15 | B | **Toast and confirm state** | `showToast`, `hideToast`, `showConfirm`, `hideConfirm`, `offerClamp`. |
| 16 | B | **View transform** (DOM) | `currentViewBox`, `viewTransform` (from the SVG's viewBox and bounding rect), `cmToClient`, `clientToCm`, `cmToStage`, `stageSize`, `stagePx`, `plateBands` (measured off the plates), `isNarrow` (≤ 860px), `fitNow` (eased with rAF, geometric scale), `stopFitEase`, `applyView`, `zoomBy`, `panView`, `noteZoomed` (the once-per-browser zoom hint, 4 s). Two coordinate systems coexist: `view.ts`'s `{cx, cy, scale}` and the DOM-measured transform `t`. |
| 17 | B | **render()** | The orchestrator: `syncLandmarks`, the deferred merge of the piece that just left focus, plates, hint, `applyView`, `viewTransform`, SVG, control layer, toast, confirm, `notifyChange`. Rendering mutates the model (7 and the merge). |
| 18 | A | **SVG markup** | `hitRectAttrs`, `segHitWidthCm`, `doorSvg`, `windowSvg`, `wallBandPoints`, `snapMarkerMarkup`, `alignGuideMarkup`, `handleMarkup`, `washMarkup`, `landmarkGeom`, `landmarkLabel`, `landmarkSquarePoints`, `landmarkMarkup`, `renderSvg` (paint order is hit-test priority). Pure string building over the model, the selection, the drag and `t.scale`. |
| 19 | A | **Dimensions** | `DIM_LINE_OUT_PX`, the chip size estimates, `segDimCommit`, `segDimLabel`, `openingAtFreeEnd`, `focusedOpening`, `visibleBox`, `wallOnScreen`, `wallAxis`, `chipAlongPx`, `chipHalfCrossPx`, `wallDim`, `chainFrom`, `chainDims`, `landmarkChainDims`, `allDims`, `liveDim`, `dimAnchor`, `chipAnchor`, `dimLineParts`. One source feeds both the SVG lines and the HTML chips. Each dim carries a `commit` closure that calls model operations, `render()` and `offerClamp`. |
| 20 | B | **Plates** (DOM) | `plateButton`, `divider`, `undoButtons`, `renderToolPlate`, `renderCornerPlates`, `renderHint` (+ `hintFor`, the pure decision, which is **A**), `renderToastDom`, `renderConfirmDialog`. |
| 21 | B | **HTML layer** (DOM) | `stopChipPointer`, `freeEndObstacles`, `chipObstacles`, `pieceOwnObstacles`, `placeInStage` (clamp to the stage, then up to 8 rounds of pushing clear of every obstacle), `addLabel`, `buildChip`, `buildGapChip`, `bindLengthField` (expando `_committed`/`_edited`/`_before`/`_commit` on the input), `commitActiveField`, `renderCtrlLayer`, `renderMarkNames`, the focus plate (`plateField`, `plateAction`, `focusPlateAnchor`, `newFocusPlate`, `renderLandmarkPlate`, `renderFocusPlate` with its side flip). |
| 22 | B | **Tools glue** | `hasAnyWall`, `pickTool`, `toolUsed`, `activeToolDef`, `toolMakes`, `isMakingStroke`, `isPlacingTap`, `landmarkTools`, `armedTool`. Rules in `tools.ts`. |
| 23 | B | **Gestures** (DOM events) | `pointers`, `pinch`, `spaceDown`, `cancelStroke`, `onSvgPointerDown` (the router: pan, draw, landmark grab, place, corner, jamb, free end, push/opening, else pan), `capture`, `beginCommittedDrag`, `applyDragMove` (one branch per kind), `resolveFreeEndDirection`, the edge auto-pan loop, `onSvgPointerMove`, `handleTap`, `placeOpening` (uses `elementFromPoint`), `placeLandmark`, `focusKey`, `revealFocused`, `onSvgPointerUp`. |
| 24 | B | **Wiring** | `init`: DOM refs, pointer listeners, wheel zoom, the touch retarget guards (`realBoxMisses` in the capture phase on `touchstart`, `pointerdown`, `click`), hint help link, toast and confirm buttons, the mousedown/click capture that commits a chip before a button acts, window `resize`/`orientationchange`/`keyup`/`blur`/`keydown`; `onKeyDown` (space, undo/redo, escape, `?`, delete, zoom keys, `r`, tool keys). |
| 25 | B | **Public API** | `setModel` (accepts and ignores `ceilingHeightCm`, defaults `landmarks`), the returned handle. |

---

## The split

### Layout

Everything of the editor moves under `apps/input-capture-web/src/lib/floorplan/engine/`. What is
not the editor stays in `floorplan/`: the save path (`drawing.ts`), the export (`export.ts`), the
slides (`Slides.svelte`, `SlideStage.svelte`, `tutorialSlides.ts`, `device.ts`), the seen flags
(`seen.ts`, read by the routes too), the mark colours (`marks.ts`, read by the export and the
`[kind]` route), and `FloorplanEditor.svelte`, the wrapper. The tool glyphs (`glyphs.ts`) stay
too: `SlideStage.svelte` draws them in the slides, so they are not engine-only. The engine-only
pure modules already written move in with their tests: `tools.ts`, `view.ts`, `chain.ts`,
`slide.ts`, `landmarks.ts`. `engine.css` moves in unchanged.

Two tiers, by one rule: **a pure module imports no DOM type and touches no element**; a DOM module
may import pure ones, never the other way round. Nothing under `engine/` imports Svelte,
`$lib/state`, or a route. `document` and `window` keep coming from `root.ownerDocument`, as today.

At the end of this ticket the tree is: `engine/engine.js` (the DOM remainder, still the entry
point), `engine/engine.d.ts`, `engine/engine.css`, the five moved modules, and the pure modules
below, each with its `*.test.ts`. `FloorplanEditor.svelte` imports `./engine/engine.js` and
`./engine/engine.css`; its props and exported functions do not change, so the routes do not change
at all.

### Pure modules (this ticket)

| File | Purpose | Public surface | Must not know |
|---|---|---|---|
| `copy.ts` | Every Romanian string (`RO`). | `RO`, the `Hint` function types. | anything else |
| `template.ts` | `TEMPLATE`, the editor's markup, as a string. | `TEMPLATE`. | the model |
| `model.ts` | The editing model's types and constructors: `Wall`, `Segment`, `EditorLandmark` (re-exported from `landmarks.ts`), `Model`, `Selection`, `Point`, the cm constants, `r`/`clamp`/`dist`/`pointsEqual`/`pointKey`, `Ids` (the per-instance counter: `next(prefix)`, `bumpPast(model)`), `makeSegment`, `makeWall`, `minFor`, `cloneModel`, `landmarksOfModel`, `findWall`, `findSeg`, `findSegAnywhere`, `findLandmark`, `landmarksOn`. | selection, view, DOM |
| `topology.ts` | Read-only geometry and connectivity over a `Model`: everything in row 8. | `wallLen`, `wallDir`, `wallNormal`, `headingOf`, `headingVec`, `snapHeading`, `segTotal`, `wallsAtPoint`, `neighborAt`, `isFreeEnd`, `traceChain`, `findClosedRing`, `isClosedLoop`, `collectVertices`, `projectOnSegment`, `pointAlong`, `segPoints`, `planBox`, `wallUnderPoint(model, pt, reachCm)`. Never mutates. | selection, drag, DOM |
| `openings.ts` | The segment algebra inside one wall (rows 10 and 11, minus `deleteSelection`). | `reflow`, `mergeAdjacentPlain(w, isFresh)`, `dropZero`, `resizeWallKeepingSegments`, `syncSegments(model, isFresh)`, `flexRun`, `resizeSegment`, `slideSegment`, `addOpening(model, wallId, kind, centreCm, defaults)`, `removeSegmentToWall`, `bestFlexSegmentFor`, `moveOpeningToWall`, `sliceSegments`, `setSegSill`/`Hinge`/`Swing`, `DOOR_SWING_COMBOS`, `defaultDoorSwing`, `cycleDoorSwing`, `openSpansOf`, `openingAtFreeEnd`. `isFresh: (seg) => boolean` is a parameter: today `segIsFresh` reads `selection`; the module gets the predicate, not the selection. | neighbouring walls, selection, DOM |
| `landmarkEdits.ts` | The engine's side of landmarks (row 7): what blocks one, its obstacles, whether it shows, the settling pass, its square's geometry. | `blockersFor`, `markWallLengthCm`, `landmarkObstacles`, `landmarkShows`, `settleLandmarks(model)` (returns whether the focused landmark must be dropped, does not touch selection), `landmarkGeom`, `landmarkLabel`, `placeLandmarkAt(model, ids, kind, wall, alongCm)`. | selection, DOM, rendering |
| `walls.ts` | Mutations of the outline (row 9). | `pushWallByRef`, `dragPushWall`, `dragCornerAtPoint`, `cleanupOutline`, `splitWallAtPoint`, `squareWeldToVertex`, `commitDrawStroke(...) => { made: boolean; newSegId?: string; squareChanges: Change[] }` (the toast is the caller's), `setWallLengthExact`, `commitWallPieceLength` and `commitWallTotal` (return `{ok, max?, reshapedTo?}`; no `render`, no toast), `extendWallAtEnd`, `deleteSelection(model, selection)`, `roundAllEndpoints` + `forceSnapWeld` (the two halves of `finalizeDragWeld`). Takes `isFresh` where it syncs segments. | DOM, toast, render |
| `snap.ts` | Row 13. | `SNAP_PX`, `findStartSnap`, `findEndpointSnap`, `resizeEndpointSnap`, `findPushSnap`, `findCornerSnap`; each takes `model` and `scale: number`, not `t`. `Snap` as a discriminated union (`none`/`end`/`corner`/`tjunction`/`align`). | DOM |
| `run.ts` | Row 12: an opening or a landmark travelling along a run. | `runWallInputs`, `runPoints`, `arcOnRun`, `entryFor`, `beginOpeningRun`/`beginLandmarkRun` (what `beginCommittedDrag` computes: run, points, `grabArc`, `centreArc0`), `applyOpeningSlide(model, ds, curCm) => { segId, pastFreeEnd }`, `applyLandmarkSlide(model, ds, curCm)`. Selection is returned, not set. | DOM, selection |
| `history.ts` | Row 6 as an object. | `createHistory(): { push(model), undo(model) => Model \| null, redo(model) => Model \| null, pop(), clear(), canUndo, canRedo }`. | everything else |
| `snapshot.ts` | Row 14's `buildRoomSnapshot` and `computeUnanswered`. | `buildRoomSnapshot(model): RoomSnapshot`, `computeUnanswered(model): string[]`. | selection, view, DOM |
| `parseLength.ts` | `parseLengthInput`. | `parseLengthInput(raw)`. | everything |
| `hint.ts` | `hintFor` as a pure function of a `HintInput` (`hintState`, `refusedTool`, the drag kind and `pastFreeEnd`, the sliding subject, `zoomHintOn`, `mode`, `activeTool`, `tools`, the focused piece's kind and whether it sits at a free end, `justMade`, `hasWalls`, `anyLandmarkShown`, `landmarkKind`, `touchWords`). | `hintFor(input) => { state, text }`. | model lookups, DOM |
| `dims.ts` | Row 19. Dims carry a **commit descriptor**, not a closure: `{ kind: 'wallTotal', wallId } \| { kind: 'segment', wallId, segId }`; `engine.js` binds descriptors to operations. | `allDims(model, selection, mode, scale, visibleBox)`, `liveDim(model, drag, scale)`, `dimAnchor`, `chipAnchor`, `dimLineParts`, the chip size constants. | DOM, history, toast |
| `planMarkup.ts` | Row 18 and `renderSvg` as `planMarkup(scene): string`, where `scene = { model, selection, drag, mode, toolGesture, scale, visibleBox, dims, liveDim }`. Same paint order, same attributes, same `data-testid`s. | `planMarkup`, `wallBandPoints`, `doorSvg`, `windowSvg`, `landmarkSquarePoints`. | DOM, view |
| `dragState.ts` | `DragState` as a discriminated union on `kind` (`pan`, `draw`, `place`, `landmark`, `corner`, `openingEdge`, `freeEnd`, `resize`, `push`, `opening`), with the fields each branch of `applyDragMove` reads today; `resolveFreeEndDirection` (pure: model, ds, point). Needed now because `planMarkup`, `dims`, `hint` and `run` read the drag. | DOM |

### Dependency direction

```
copy  template  model  parseLength  history          (leaves)
   topology ← model
   openings ← model, topology
   landmarkEdits ← model, topology, openings, landmarks, domain-data
   walls ← model, topology, openings, landmarkEdits, landmarks
   snap ← model, topology
   dragState ← model, topology, snap
   run ← model, topology, openings, walls, landmarkEdits, dragState, slide, landmarks
   snapshot ← model, topology, landmarkEdits, landmarks, copy
   hint ← copy, tools
   dims ← model, topology, landmarkEdits, dragState, chain, copy
   planMarkup ← model, topology, landmarkEdits, dims, dragState, marks
   ---------------------------------------------------- pure above
   engine.js (DOM remainder) ← every module above, view, glyphs, seen, motion
```

A pure module never imports `engine.js` or a DOM type. Only `engine.js` writes the session
variables; every pure function takes the model (or the fields it needs) as a parameter and
mutates the model in place exactly as today. The split does not introduce immutability: that
would be a rewrite with different behaviour under undo and drag, not a split.

---

## Migration order

Each step is one commit-sized change; after each, `npm run check` and `npm test` pass and the
local app draws, saves and restores a plan exactly as before. `engine.js` stays the entry point
throughout and imports each module as it is cut; a consumer never sees an intermediate state.

1. **The subdirectory.** Create `engine/`; move `engine.js`, `engine.d.ts`, `engine.css`, and the
   engine-only modules with their tests (`tools`, `view`, `chain`, `slide`, `landmarks`).
   Fix import paths. `FloorplanEditor.svelte` imports `./engine/engine.js` and `./engine/engine.css`.
   Nothing else changes. (Author's step 1.)
2. **Golden fixtures** (step 3a, below), recorded from the old engine before any code is cut.
3. `copy.ts`, `template.ts`: move the data; `engine.js` imports them.
4. `model.ts`, `topology.ts`: types, constants, constructors, read-only geometry. Tests: chain
   tracing and ring detection over the fixtures' models.
5. `snapshot.ts`: the first golden test, and the most valuable one: for every fixture,
   `buildRoomSnapshot(model)` deep-equals the recorded `room`.
6. `parseLength.ts`, `history.ts`, `hint.ts`: small, each with its own tests.
7. `openings.ts` (with the `isFresh` parameter). Tests derived from reading the code and checked
   against the old engine in the browser where a value is in doubt.
8. `landmarkEdits.ts`.
9. `walls.ts` (`commitDrawStroke` returns its square changes; the toast stays in `engine.js`).
10. `snap.ts`, `dragState.ts`.
11. `run.ts`.
12. `dims.ts` (commit descriptors) and `planMarkup.ts`: the second golden test: for every fixture,
    `planMarkup(scene)` equals the recorded `svg` string.

After 12 this ticket is done. What is left in `engine.js` (about 1 500 lines: the session
variables, `render()`, the view transform, plates, chips, the control layer, the focus plate,
gestures, keys, wiring, the public API) is the follow-up's starting point.

---

## Characterisation tests

### What "same behaviour" means here

Three things, in this order of weight:

1. **The model.** `getModel()` after a sequence of operations is JSON-identical. The model is
   what `um.plans.drawing.model` persists and what the client gets back on re-edit.
2. **The room snapshot.** `room()` is JSON-identical. It is the contract: it becomes
   `drawing.room` in the manifest and the architect's PDF.
3. **The plan markup.** The string `#roomSvg.innerHTML` is identical, and with it every
   `data-testid`, `data-*` attribute and class the e2e suite and the ux depend on.

Not pixels: there is no canvas, the plan is SVG in world coordinates, and equality of the markup
string is stronger and cheaper than any raster comparison. Not the HTML layer's final pixel
positions: they come out of `getBoundingClientRect` measurements that no node test can make.

### The two layers

**3a. Golden fixtures**, recorded before any code moves, under `engine/fixtures/`, one JSON per
case: `{ model, room, svg, testids }` where `svg` is `#roomSvg.innerHTML` with Selectează on and
the given selection, and `testids` the sorted list of `data-testid` values in the whole editor
root. Recorded with a throwaway script that mounts the old engine with `exposeGlobals: true` in
the dev server and dumps `window.__lastModel`, `window.__room()`, the SVG and the test ids. The
script is not committed; only the fixtures land in the repo. Cases:

- empty canvas;
- one wall;
- two walls in an L, one free end each;
- a closed 4-wall room with a door, a window and a `Fără perete` stretch (the export test's room
  is a good shape), with the door in focus (so the chain is in the markup) and with nothing in
  focus;
- a T-junction (a stroke ended on the middle of a wall);
- a free-standing second piece not joined to the room;
- landmarks on both faces of one wall, one under a window, one in focus, in `landmarks` mode;
- a wall shortened past 30 cm carrying a hidden landmark;
- a model saved by an earlier editor: with `ceilingHeightCm` and without `landmarks`.

The room snapshot of the closed room must also validate against `RoomSnapshotSchema` from
`@urban-moon/domain-data`, so the fixture is proven to be what the contract accepts. The
`testids` lists are recorded now and used by the follow-up ticket, which is where the elements
carrying them get rebuilt.

**3b. Per-module tests**, written as each module is extracted, in vitest, node environment:

| Module | What is pinned |
|---|---|
| `snapshot` | every fixture: `buildRoomSnapshot(model)` equals `room`; `unanswered` wording for none, one and three free ends, and for an unclosed loop with none. |
| `topology` | `traceChain` orientation-agnostic (a wall drawn to→from in the ring), `findClosedRing` null below 4 walls and for a fold-back, `neighborAt` null at a T, `wallUnderPoint` refuses a `Fără perete` side and takes the nearest across. |
| `openings` | `resizeSegment` drains next then prev and reports `max`; `slideSegment` conserves the wall's total; `addOpening` picks the nearest flex segment, clamps the width, refuses under `MIN_OPEN`, applies `carried`; `removeSegmentToWall` fuses both sides; `mergeAdjacentPlain` never merges a fresh piece and downgrades mixed provenance to `computed`; `cycleDoorSwing` walks the four combos from a null pair; `sliceSegments` re-ids a trimmed clone only. |
| `walls` | `commitDrawStroke`: below `MIN_WALL` or `MIN_STROKE_PX` makes nothing and pushes nothing; a T-junction end splits the wall and the landmarks on it; a free-start stroke translates onto an off-axis vertex; a both-ends-welded stroke squares the target and reports the changed walls; a refused square leaves the ends unjoined. `cleanupOutline`: drops a zero wall and heals, merges collinear walls with landmarks re-based, downgrades to `computed`. `setWallLengthExact`: free end extends, welded end pushes the neighbour one hop. `deleteSelection`: the far end absorbs the removed piece; the only piece removes the wall. `roundAllEndpoints` + `forceSnapWeld` make a weld bit-exact. |
| `landmarkEdits` | `settleLandmarks` keeps a hidden landmark, drops one whose wall is gone, separates two clamped onto one spot; `landmarkObstacles` excludes the landmark itself; `blockersFor` includes `open` spans and same-face landmarks only. |
| `snap` | each finder at a scale of 1 and of 0.25, so the px radius is proven to be screen px; the alignment case; the off-axis weld refusal in `resizeEndpointSnap`; `findPushSnap` skips welded ends and off-axis candidates; `findCornerSnap` excludes participating vertices. |
| `dragState` | `resolveFreeEndDirection`: 25° either side of the axis is a resize, more is a pan. |
| `run` | `arcOnRun` stays on the neighbouring legs and wraps on a closed run; `applyOpeningSlide` re-makes the opening on the next wall, falls back onto its own wall when there is no room, extends a free end by whole cm; `applyLandmarkSlide` refuses a wall too short, flips face only where it fits. |
| `history` | cap at 300; redo cleared by push; `pop` after a cancelled drag. |
| `hint` | one case per `data-state` the old engine emits (enumerate them from `hintFor`), in both touch and mouse words. |
| `dims` | at rest one dim per on-screen wall; the chain replaces the focused wall's dim; read-only in `landmarks` mode; a landmark's piece carries `value: null`; `liveDim` for `draw`, `resize` and `openingEdge` only; `chipAnchor` with a shift. |
| `planMarkup` | every fixture: equals the recorded `svg`; the hits group order; no hit rects in `landmarks` mode; free-end circles only with a stroke tool on; preview parts for a live draw with a weld and with an align guide. |
| `parseLength` | `2.5` and `2,5` ask about metres; `250` does not; empty and negative refused. |

### What cannot be pinned in node, and why the DOM parts wait

`placeInStage`'s measurements, `plateBands`, the focus plate's side flip, the fit easing, the
touch retarget guard, `elementFromPoint` in `placeOpening`, pointer capture. No DOM library is
installed (`vitest.config.ts`: `environment: 'node'`), and one is not added: a layout-less DOM
would return zero for every rect, so a test there would pin degenerate behaviour, not the real
one. The rule instead is that any geometry those parts decide is made pure and tested (in the
follow-up: the obstacle escape, the key decisions, the viewport arithmetic already in `view.ts`),
and what genuinely needs layout is covered by the manual check below and by the drawing journey
(`e2e/journeys/drawing.spec.ts`, `docs/code/testing.md`) once the e2e harness exists. This ticket
adds no journey and changes no test id.

---

## Risks and known ugly parts

- **Rendering mutates the model.** `render()` runs `syncLandmarks` and the deferred
  `mergeAdjacentPlain` of the piece that just left focus. Keep the behaviour; `settleLandmarks`
  and `syncSegments` are pure and called from `render()` in `engine.js` under one explicit name,
  so a reader sees that the model can change on a bare re-render.
- **`segIsFresh` reads the selection inside segment merging.** Model logic depends on UI focus.
  Injected as `isFresh`, not removed: removing it changes what merges when.
- **Model operations show UI.** `commitDrawStroke` toasts; `commitWallPieceLength` and
  `commitWallTotal` toast and `render()`; the dim commit closures open the clamp confirm. Fixed by
  return values and descriptors, wired in `engine.js`. Every message text stays.
- **`dragState` is an untyped bag** with kind-specific fields set in three places. Typing it as a
  union is the largest pure typing effort; the dev should expect to discover a field read on the
  wrong kind and must keep the behaviour, noting it in the summary.
- **`findClosedRing` traces from `walls[0]` only**, `arcOnRun` returns `nearArc || 0` when no leg
  matches, `applyOpeningSlide`'s fallback builds a one-wall run with both ends closed: whatever
  the reader thinks of them, they are the behaviour and are pinned as they are. Anything that
  looks like a bug goes into the dev's summary as a finding for a separate ticket, not into a fix.
- **`exposeGlobals`** and `window.__lastModel` stay; they are how the fixtures are recorded and
  how a journey may one day read the model.
- **Strict TypeScript over a JS port.** No `any`, no `@ts-ignore`, no `as unknown as`. Where the
  old code relied on a loose shape (a `Snap` with or without `wallId`, a `Dim` with or without
  `chipOutCm`), the union or optional field says so. `engine.js` stays JS for now and calls the
  typed modules; its `.d.ts` is unchanged.
- **Comments.** The old file's comments narrate history ("SPEC-lessons round six", "used to be").
  The standards forbid that: keep the *why* that comes from how the system works, drop the story.
  The dev should expect to rewrite most comments they carry across.

Deliberately left alone: in-place mutation of the model; the render-everything-every-time
strategy (`innerHTML` rebuilt on each render); the CSS; the copy; the DOM template and its ids;
the coexistence of `mode: 'landmarks'` as a flag rather than a separate editor; the `tools`
option nobody passes; the 300-step history cap; everything in the rows marked **B**.

---

## Done criteria

1. `floorplan/engine/` exists and holds every engine file; nothing of the editor is left directly
   under `floorplan/` beyond what the Layout section keeps there (the save path, the export, the
   slides, the seen flags, the mark colours, `glyphs.ts`, and the wrapper).
   `FloorplanEditor.svelte` imports `./engine/engine.js` and
   `./engine/engine.css` and is otherwise unchanged; the routes are unchanged (git shows no diff
   under `src/routes/`).
2. Every pure module in the table above exists, is strict TypeScript (`npm run check` clean; no
   `any`, no `@ts-ignore`, no `as unknown as`), imports no DOM type and no DOM module, and is under
   500 lines.
3. `engine.js` contains no function from a row marked **A**: it imports them. Its remaining body
   is rows 3, 5 (variables), 15, 16, 17, 20 to 25 only.
4. The golden fixtures exist under `engine/fixtures/`, and every fixture's `room` and `svg` are
   reproduced exactly by `snapshot.ts` and `planMarkup.ts`; the closed room's snapshot validates
   against `RoomSnapshotSchema`.
5. Every module in the table above has a `*.test.ts` next to it covering what the table names;
   `npm test` from the root passes.
6. Manual check on the local app, at 390×844 and 1440×900: draw a closed room; type a wall length
   and a piece length; the metres question on `2.5`; place, slide round a corner and past a free
   end, resize by jamb, rotate and delete a door; a window's sill and its carried width; a
   T-junction stroke; push a wall and drag a corner onto a snap; undo and redo through all of it;
   pinch, wheel, `+`/`-`/`0`, fit; leave and return to the plan (restore from `um.plans`); place a
   landmark, slide it onto the other face and round a corner, delete it; the hint reads right in
   touch and mouse words; the `?` key and the hint link open the slides; `Escape` cancels a stroke.
7. The app README's code map lists `engine/` and its files, and the "floorplan editor" paragraph
   points at `engine/` (the README is the dev's).
8. The dev's summary lists every place the old code's behaviour looked wrong or surprising while
   being pinned, as findings, each with the test that pins it today.

The remainder, `engine.js` itself becoming typed DOM modules and going away, is
`draw-engine-split-2-dom-and-gestures.md`.

## After it is built

The architecture docs do not describe the engine's internals, so nothing there changes; the
architect confirms `docs/README.md` and the app README's code map agree, then deletes this ticket.
