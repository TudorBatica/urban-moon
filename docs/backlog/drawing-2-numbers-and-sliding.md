# Drawing 2: one lane of numbers, the chain, and sliding round corners and past a free end

## Description

Second of five tickets that rebuild the drawing experience. It changes how numbers sit on the plan
(one lane per wall; a chain of gap | piece | gap while a window or door is in focus) and how far an
opening can slide (round joined corners, past a free end).

**Depends on** `drawing-1-editor-tools-and-view.md` (the tools, focus, plates and the client's
view). Independent of tickets 3 and 4; ticket 5 extends the chain to landmarks. Until this ticket
lands, numbers sit where the engine puts them today and openings slide as today; nothing is lost,
and after it the app is shippable as it stands.

**The visual source of truth is the mockup** `docs/ux/mockups/drawing/drawing-editor.html`:
sections 2.5 (the distances), 2.6, 2.7 (the narrow gap stepping out), 4.3 and 4.4. Where this text
and the mockup differ, the mockup wins. Design language: `docs/ux/design.md` 7.3 and 7.4,
`docs/ux/components.md` ("Dimension chip", "Chain").

---

## Experience

Written by the ux agent.

- **One lane**, outside the wall, 34px out. At rest it holds one number per wall: the wall's
  length. The room side stays free for plates.
- **The chain.** While a window or a door is in focus or dragged, its wall's length stands down
  and the lane holds gap | piece | gap, with a tick at every boundary and a hairline back to the
  wall. It adds up to the wall's length.
  - A gap runs from the piece's edge to the first obstacle on that side: another opening, a corner
    where the run turns, a free end, or where the wall meets a Fără perete side.
  - The chain stops at a corner even though the piece can slide round it.
  - The piece's own number is framed in ink and is the same value as the first field of its plate;
    tapping either edits it. The gaps are grey italic and count live during a drag.
  - A zero gap shows nothing; the chain simply starts at the piece. Past a free end the chain ends
    with the piece.
- **Stepping out.** A number too narrow for its span steps out one lane (68px on a horizontal wall,
  96px on a vertical one, where chips sit side by side) on a thin leader, instead of shrinking or
  overlapping; two such numbers in a row are pushed apart along the wall.
- A number whose wall is off screen is not drawn.
- **Sliding an opening.** It travels as far as the wall is continuous: at a corner where two walls
  join it carries on to the next wall (it is always wholly on one wall; it moves over once its
  middle passes the corner). It stops against another opening and where the wall meets a Fără
  perete side. At a free end it may go past the end until its near jamb meets the wall's end: the
  opening is then the end of the run and its far jamb is the free end; a wall drawn from there
  joins it, so the client can go wall → window → wall. While dragging, the plate hides and the
  chain stays.

### States

| State | What the client sees |
|---|---|
| Nothing in focus | one length per wall, in the lane |
| Window or door in focus | the wall's length gone, the chain in its place, the piece's number framed |
| Dragging an opening | plate hidden, chain counting live |
| Opening past a free end | the chain ends with the piece |

### Copy

| Where | Phone and desktop |
|---|---|
| Hint, window dragged round a corner | Fereastra merge pe perete și după colț, cât timp peretele continuă. |
| Hint, window past a free end | Fereastra poate trece de capătul liber. Apoi continuă peretele din capătul ei. |

For a door the same two lines with "Ușa"; not in the ux copy, for ux to confirm.

### Open item in this ticket

- **O1. Typed gaps.** Gaps in the chain are read-only, as in the mockup (writing 100 to move the
  piece to 100 cm from the corner is the obvious next step, not decided). Note that today the wall
  pieces either side of an opening carry editable chips; they become read-only gaps here. Keep the
  gap chip a part that could take an editor later; do not build the editing.

---

## Technical plan

Reused from `apps/input-capture-web/src/lib/floorplan/engine.js`: the chip layer and in-place
editing (`buildChip`, `bindLengthField`, `renderCtrlLayer`, `placeInStage`), the lane assignment
(`assignChipLane`, `allDims`), `slideSegment`, `moveOpeningToWall`, the welding of a stroke to a
free end. No contract change; `packages/domain-data` and the worker are not touched.

New pure TypeScript module with unit tests, called by the engine:

- `chain.ts`, two functions.
  - *The chain of a focused piece*: from a wall's segments and its neighbours at both ends, the
    boundaries and the two gaps, stopping at corners, free ends and Fără perete sides; zero gaps
    dropped. Its input takes a list of obstacles along the wall so another kind of obstacle can be
    added without changing it (ticket 5 adds landmarks).
  - *Chip placement in the lane*: given the spans in screen px and the chips' widths, which numbers
    stay in the lane, which step out and to which lane (68 or 96px by the wall's axis), and the
    pushing apart of two neighbours.
- In the engine: at rest `allDims` yields one length per wall; with an opening in focus or dragged
  it yields the chain for that wall instead. Numbers whose wall is outside the view are skipped.
- Sliding round a corner: during an opening drag, when the opening's middle passes a joined corner
  it moves to the neighbour wall (`neighborAt`, built on `moveOpeningToWall`), continuously within
  one drag and as one undo step. It does not enter an `open` wall and stops against other openings.
- Past a free end: the drag may continue until the opening's near jamb is at the wall's end; the
  wall is lengthened so the opening is its last segment, and the wall's free end (the far jamb) is
  what `findStartSnap` welds a new stroke to. Sliding back shortens the wall again, never below
  what was drawn or typed before the drag.

### Unit tests

`chain.test.ts`: gaps to another opening, a corner, a free end, a Fără perete side; a zero gap;
past a free end; sums to the wall's length; the step-out lane by axis; two neighbours pushed
apart. Engine-level tests for the corner hand-over and the free-end extension where the existing
engine tests allow it; otherwise the rule sits in a pure helper that is tested.

### Test ids

`chain` (the chain's container, present only while it shows), `chain-gap-before`, `chain-piece`,
`chain-gap-after` ("before" is toward the wall's start). `dim-<id>` stays on a wall's length.

### For qa

No journey changes: the chain and sliding are covered by unit tests and the ux review. If a
journey of `journeys/drawing.spec.ts` reads a gap chip, it uses the ids above.

### Rules and scope

`docs/code/standards.md` (code never references docs; touched engine functions leave without
history comments). Deploy: web app only, smoke tier. Out of scope: typed gaps (O1), landmarks in
the chain (ticket 5), the export (it keeps dimensioning every piece for the architect).

## How to verify it once delivered

`npm run check` and `npm test` pass. At 390×844 with touch and 1440×900 with a mouse, against
mockup 2.5 to 2.7, 4.3 and 4.4:

1. A room with nothing in focus shows exactly one number per wall, 34px outside it.
2. Focusing a window replaces that wall's length with gap | window | gap, ticks at the boundaries;
   the three add up to the wall's length; the window's number is framed and edits together with
   Lățime in the plate; the gaps cannot be edited.
3. A door 20 cm from a corner: the 20 steps out on a leader instead of overlapping; on a vertical
   wall it steps out further. Two narrow numbers in a row do not overlap.
4. Dragging the window: the plate hides, the gaps count live; against another opening it stops.
5. Dragging it to a joined corner: it carries on along the next wall, and the chain is now that
   wall's; one undo puts it back where the drag began. At a Fără perete side it stops.
6. Dragging it past a free end: it stops with its near jamb at the end, the chain ends with the
   piece; with Perete on, a stroke from its far jamb joins it.
7. Panning a wall off screen removes its number; zooming never changes a chip's size.

## After it is built

The ux agent updates `docs/ux/screens/drawing.md` and `docs/ux/components.md` ("Chain" built) and
the copy document. No architecture doc changes. Then this ticket is deleted.
