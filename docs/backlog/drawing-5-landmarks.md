# Drawing 5: "Ce mai e prin cameră?" and placing landmarks on the plan

## Description

Last of five tickets that rebuild the drawing experience. After the ceiling height the client
meets "Ce mai e prin cameră?": seven cards (water, gas, boiler, air conditioning, fireplace,
radiator, hood outlet). Picking one opens the finished plan with a tool that places that landmark
on a wall as a small coloured square with its name. The landmarks travel with the drawing to the
manifest, the plan image and the architect's PDF.

**Depends on** all four before it: `drawing-1-editor-tools-and-view.md` (tools, view, focus, the
ceiling screen), `drawing-2-numbers-and-sliding.md` (the chain, sliding round corners),
`drawing-3-slides.md` (the slides surface) and `drawing-4-landmarks-contract.md` (the snapshot's
`landmarks`, the catalog, the PDF list; its worker deployed). Until this ticket lands the flow is
plan → ceiling height → `/planuri`, complete without landmarks.

**The visual source of truth is the mockup** `docs/ux/mockups/drawing/drawing-editor.html`:
sections 3.1, 3.3 to 3.6 and 4.9 (and 4.4 for the chain). Where this text and the mockup differ,
the mockup wins. Design language: `docs/ux/design.md` 2 (mark colours), 6 (object drawings), 7.4,
7.6; `docs/ux/components.md` ("Landmark cards", "Mark").

---

## Experience

Written by the ux agent.

1. **"Gata cu planul?"** now reads as designed: "Urmează înălțimea tavanului și ce mai e prin
   cameră. Te poți întoarce oricând la plan."
2. **"Ce mai e prin cameră?"** follows the ceiling height. A question screen (`noart` Frame, step
   word "Plan"), subtitle "Alege pe rând și arată pe plan unde se află. Sari peste ce nu ai."
   Seven object cards, three to a row on phones, four on desktop: Țeavă de apă, Gaz, Centrală, Aer
   condiționat, Șemineu, Calorifer, Evacuare hotă. The drawings are object drawings in ink, as on
   the appliance cards; they carry no colour. Nothing is required: the arrow goes on with none
   chosen. A card whose landmark is on the plan has an ink border, a heavier label and the tick,
   and a count in its top left corner when there is more than one.
3. **Placing.** Tapping a card (ticked or not) opens the plan with a tool plate of two: Selectează
   and that landmark (a small square in its colour, and its name), the landmark tool on. Undo,
   redo and the view controls are as in the editor. Walls, windows and doors are drawn but cannot
   be selected or changed; to change them the client goes back to the plan.
   - A tap on a wall places a 30 cm square in the landmark's colour against the wall on the room
     side, with its name on a small white chip in the same colour, on the room side. The tool
     turns off and the square is in focus: a wash, an ink edge, the plate "Șterge", and its chain.
   - The chain is the one windows and doors have: gap | square | gap to the first obstacle on each
     side, other landmarks counting as obstacles; the square is a break in the line with no number.
   - Landmarks already on the plan, of any kind, can be touched, moved or deleted. More than one of
     a kind is allowed.
   - Dragging slides a square along the wall and round corners like an opening; dragging it across
     the wall puts it on the other face. The face is part of the answer.
   - The square is 30 cm at the plan's scale whatever the zoom; the name chip keeps its screen size.
   - The arrow here is "Gata" and returns to the cards.
4. **The first time** a landmark is about to be placed, one slide shows over the placing screen,
   in the shape of the drawing slides: the landmark's name where the position is, "Sari peste",
   the stage, the title "Arată unde se află", its paragraph, one position bar, "Am înțeles". It
   does not come back.
5. **Landmark colours** (`design.md` 2): apă `#2F6F9F`, gaz `#C08A1E`, centrală `#3E7D5A`, aer
   `#6E63A6`, șemineu `#B4553A`, calorifer `#8A6244`, hotă `#9B4A86`. Only on the square, its name
   chip and the square in the tool plate.
6. From the cards the arrow goes on to `/planuri`, where the drawing card shows the saved plan
   with its landmarks (O2).

### States

| State | What the client sees |
|---|---|
| Cards, nothing placed | seven resting cards, arrow available |
| Cards, some placed | ticked cards with counts |
| Placing, first time | the landmark slide over the placing screen |
| Placing, tool on | two-tool plate with the landmark filled, hint |
| Just placed, or touched | Selectează filled, the square in focus with "Șterge" and its chain |
| Dragging a landmark | plate hidden, chain counting live |
| Landmarks placed, none in focus | colour and name carry them; no numbers |

### Copy

| Where | Phone (touch) | Desktop (mouse) |
|---|---|---|
| Before leaving the plan | Gata cu planul? · Urmează înălțimea tavanului și ce mai e prin cameră. Te poți întoarce oricând la plan. · Mai am de lucru · Continuă | same |
| Cards | Ce mai e prin cameră? · Alege pe rând și arată pe plan unde se află. Sari peste ce nu ai. · the seven names | same |
| Hint, landmark tool on | Atinge peretele unde e {gazul}. | Dă clic pe peretele unde e {gazul}. |
| Hint, landmark in focus | Trage pătratul pe perete. Trage-l peste perete ca să-l muți pe partea cealaltă. | same |
| Hint, landmarks placed, none in focus | Atinge un pătrat ca să-l muți sau să-l ștergi. | Dă clic pe un pătrat ca să-l muți sau să-l ștergi. |
| Landmark slide | Arată unde se află · the phone paragraph in the mockup's `lmSlide` · Sari peste · Am înțeles | same, the desktop paragraph |
| Arrow `aria-label`, placing | Gata | same |

The hint uses each landmark's articulated form: "țeava de apă", "gazul", "centrala", "aerul
condiționat", "șemineul", "caloriferul", "evacuarea hotei".

### Open items and assumptions in this ticket

Build the stated default; each is one rule in one place.

- **O2. Where the arrow on the cards goes.** Built as `/planuri` (photos are still to be added
  there); awaiting the user's confirmation. The target stays in the one constant ticket 1 made.
- **O4. Card to colour.** The cards are monochrome, so the client first meets a landmark's colour
  on the tool plate. The name chip is the fallback already in the design; nothing more to build.
- **A1. A landmark and an opening may overlap along the wall** (a radiator under a window); two
  landmarks on the same face of a wall may not. A landmark's gaps run from the square's edges to
  the nearest boundary beyond that edge: an opening's jamb, another landmark's edge (either face),
  a corner, a free end, the start of a Fără perete side.
- **A2. In the editor (the plan step) landmarks already placed are drawn but inert**, as walls are
  on the placing screen. They follow their wall when it moves or is resized (clamped to its
  length) and are deleted with it, like its windows and doors. Landmarks never go on a Fără perete
  side.
- **A3. On the placing screen** "Gata" saves and returns to the cards; "Înapoi" returns to the
  cards too, asking "Renunți la modificări?" ("Rămân aici", "Renunț") first when landmarks
  changed. A failed save shows the editor's save-failed note.
- **A4. "Room side"** for a new landmark is the side a new door opens into: the engine's `in` side
  of the wall (for an outline not closed, to the right of the wall's drawing direction).
- **A5. The exported plan** (the drawing card's image and the PDF's) draws landmarks as on the
  canvas: the coloured square and the name chip; no distances (the PDF lists them).

---

## Technical plan

### What exists and is reused (from tickets 1 to 4)

The tool state machine (`tools.ts`, which takes its tool list as data), the view (`view.ts`), focus
and the focus plate, the chain and its chip placement (`chain.ts`, which takes a list of
obstacles), the corner hand-over used by sliding openings, the shared Note, the seen-flags module,
`Slides.svelte` and `SlideStage.svelte`, `drawing.ts` as the only writer of `um.plans.drawing`,
the `/deseneaza/tavan` screen and the constant its arrow follows, `export.ts`; from
`@urban-moon/domain-data` the `RoomLandmark` schema and type, `LANDMARK_KINDS` with their labels,
`LANDMARK_SIZE_CM`. The object card's look (`.acard`-family styles, `src/lib/ui/lineIcons.ts`).

### Data

Landmarks live in the engine's model (`model.landmarks`: id, kind, wallId, offset along the wall,
face), because they need undo, drag and the chain; `snapshotModel`/`restoreSnapshot` and
`getModel`/`setModel` carry them, and a model saved before this ticket loads with none.
`buildRoomSnapshot` reports them as `landmarks` in the contract's shape, with `gapBeforeCm` and
`gapAfterCm` from `chain.ts`. `drawing.ts` needs no new way of building a `Drawing`: saving from
the placing screen is "saving from the editor".

### New pure module, with unit tests

`src/lib/floorplan/landmarks.ts`:

- place on a tapped wall: centred on the tap, clamped to fit the wall, refused on an `open` wall,
  moved along to the nearest free stretch when it would overlap a landmark on the same face
  (refused when there is none);
- slide along the wall, stopping against a landmark on the same face, and round joined corners
  once its middle passes the corner (the same hand-over as openings);
- flip face when the drag crosses the wall's centre line, if the other face is free there;
- follow the model: clamp when the wall shortens, move to the right piece when a wall is split
  (`splitWallAtPoint`) or merged (`cleanupOutline`), go when the wall is deleted.

`chain.ts` gains landmarks as obstacles and the landmark as a focused piece with no number (A1).

### The engine

`mountFloorplan(root, opts)` gains `mode: 'plan' | 'landmarks'` and, for `landmarks`, the
`landmarkKind` to arm on mount.

- `landmarks` mode: walls and openings render but take no pointer and no focus; the tool list is
  Selectează and the landmark (`tool-landmark`, the colour square as its glyph), armed at mount;
  placing, focusing, dragging and deleting landmarks; Delete, Esc, V, undo and redo and the view
  keys work, P L F U R do nothing; the three landmark hints.
- `plan` mode: landmarks render inert (A2) and follow the walls through every wall operation.
- Rendering: the square in cm (scales with the plan) against the wall's band on its face, the
  name chip in the HTML chip layer on the same side (keeps its size); colours from CSS custom
  properties named as `design.md` 2 names them, added to `app.css`, with one map from kind to
  token in the web app.

### Routes

- `/deseneaza/repere`: the cards. Needs a saved drawing (else `/deseneaza`) and a picked room.
  Card state (ticked, count) is read from `plans.drawing.room.landmarks`. "Înapoi" to
  `/deseneaza/tavan`; the arrow to `/planuri` (O2).
- `/deseneaza/repere/[kind]`: placing, the engine in `landmarks` mode on the saved model. An
  unknown kind goes to the cards. "Gata" saves through `drawing.ts` and returns to the cards;
  "Înapoi" as in A3.
- The constant that the ceiling screen's arrow follows now points at `/deseneaza/repere`.
- The "Gata cu planul?" sentence becomes the designed one.
- The landmark slide: a one-entry definition (title, both paragraphs from the mockup's `lmSlide`)
  shown through `Slides.svelte` with the landmark's name as the position text, no "Înapoi", the
  button "Am înțeles"; `SlideStage.svelte` gets the id `landmark` and shows the landmark's colour
  square in its placeholder. It opens when the placing screen mounts and `um.draw.seen.landmarkSlide`
  is not set; the flag is written when it closes.
- The seven drawings are in the mockup's `LM` list as plain strings with explicit attributes,
  ready to paste into `src/lib/ui/lineIcons.ts` under the catalog's kind ids. The Gaz drawing is
  the existing `gas` entry; do not add it twice.
- The articulated forms for the hint live with the engine's `RO` table, keyed by kind.

### Export

`export.ts` draws each landmark of the snapshot as on the canvas (A5). The caption is untouched.

### Unit tests

`landmarks.test.ts` (placing and clamping; no overlap on one face, overlap with an opening
allowed; round a corner; flipping face; following a resized, split, merged and deleted wall);
`chain.test.ts` extended (a landmark as obstacle for an opening and for another landmark, on
either face; the landmark's own chain; under a window); the snapshot's `landmarks` validates
against the shared schema; an old model loads with none; `export.test.ts` (squares with their
colours and names); the slide definition.

### Test ids

| Test id | On |
|---|---|
| `landmark-card-<kind>` | a card, with `aria-pressed` when placed and `data-count` |
| `tool-landmark` | the landmark tool, `aria-pressed` when on, `data-kind` |
| `landmark-<id>` | a placed landmark, with `data-kind` and `data-face` |
| `chain`, `chain-gap-before`, `chain-gap-after`, `focus-plate`, `plate-delete`, `hint`, `next`, `btn-back`, `note-discard`, `slides`, `slides-skip`, `slides-next` | reused as the earlier tickets defined them |

### For qa

Journey 5 of the `journeys/drawing.spec.ts` section in `e2e-full-journeys.md` ("places a landmark
and it reaches the manifest and the PDF") is written against this ticket, and journey 1 gains the
cards step on its way to `/planuri`. `e2e/fixtures/state/drawing.json` is recaptured (the model
gained landmarks). The journey map's step 4 now covers three screens.

### Rules and scope

`docs/code/standards.md` (code never references docs or the mockup; touched engine functions leave
without history comments). Deploy: the web app, after the full e2e tier, with ticket 4's worker
already deployed. Out of scope: what moves on the landmark slide's stage
(`drawing-tutorial-animations.md`), typed gaps, landmark sizes other than 30 cm, the copy document
(ux, once built).

## How to verify it once delivered

`npm run check` and `npm test` pass. At 390×844 with touch and 1440×900 with a mouse, against
mockup 3.3 to 3.6 and 4.9:

1. "Gata cu planul?" announces both steps; after the ceiling height the cards appear: seven, ink
   only, three and four to a row; the arrow works with none chosen and lands on `/planuri`.
2. Tapping Gaz the first time shows the one slide (placeholder stage with the gas colour square);
   "Am înțeles" closes it; it never returns, for any kind.
3. The plate holds Selectează and Gaz only; tapping a wall places a 30 cm square in the gas colour
   on the room side with its name chip; Selectează is on; "Șterge" and the chain show; tapping a
   window, a wall or empty canvas selects nothing of the plan; a tap on a Fără perete side places
   nothing and the tool stays on.
4. Dragging along the wall counts the gaps live; round a joined corner it carries on; across the
   wall it sits on the other face; a second landmark on the same face stops it; it can sit under a
   window.
5. "Gata" returns to the cards: Gaz ticked; placing a second Calorifer shows the count 2; a ticked
   card reopens the plan where every placed landmark can be moved or deleted. Undo and redo work.
6. "Înapoi" with changes on the placing screen asks first.
7. In the editor ("Modifică" from `/planuri`) landmarks are visible and inert; moving and resizing
   their wall carries them; deleting the wall removes them; going through again keeps the rest.
8. The drawing card's image shows the squares and names. After a send, `manifest.json` has
   `drawing.room.landmarks` with kind, wall, face and gaps matching what the chain showed, and the
   PDF lists them under "Repere".

## After it is built

The architect updates `docs/architecture/flow.md` step 4 (the landmark step, what is saved when)
and `docs/architecture/storage.md` (`landmarkSlide` flag if flags are listed). The ux agent moves
the whole experience into `docs/ux/screens/drawing.md` (removing "The settled design (not built
yet)" and "As it is today"), updates `docs/ux/screens/plans.md`, `docs/ux/components.md` and the
copy document. Then this ticket is deleted.
