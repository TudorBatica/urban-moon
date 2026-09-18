# Components

The shared parts the language is built from, and where each lives. Paths are relative to
`apps/input-capture-web/`. A new screen uses these before inventing anything; a new part is added
here when a ticket introduces it.

## Shell

- **Frame** (`src/lib/ui/Frame.svelte`): the page shell of `design.md` section 4. Modes: `art`
  (photograph 42%, sticky, full height; content centred, max 560px), `dense` (photograph 34%),
  `opener` (photograph 50%, title set large), `noart` (no photograph, a centred 720px column).
  `artFor(screen)` in `src/lib/ui/images.ts` picks the photograph and mode per screen.
- **Top bar**: wordmark `.wm` (links to the contents) and, right, `.ct`: the position `4 / 16`
  or a word naming the step ("Planuri", "Cuprins", "Trimitere").
- **Bottom bar** (`GoBar.svelte`, `.bot`): "Înapoi" as `.lnk`, the round arrow `.go` (54px; grey
  `--off` while it waits; pops when it becomes available).

## Answers

- **Keyed options** (`Keyed.svelte`): white cells with a letter key; picked = ink border, lift of
  1px, the key fills and a check draws in it. Pressing the letter picks it. Variants: `list`,
  `grid` (two columns, for more than seven options), `row` (compact chips). With a `max`, the
  rest dim to 45%.
- **Rooms**: one joined two-column grid; picked cells fill ink.
- **Segmented** (`Seg.svelte`): up to four short options; an ink indicator slides under the pick.
  Two options sit inline at the end of a row (`mini`). Multi-choice segments fill each picked cell.
- **Counter row** (`CountRow.svelte`): label left, − value + right; the digits roll (`Roll.svelte`).
- **Field** (`Field.svelte`): a label and a line to write on; the line darkens on focus. Free text
  uses a white box (`.ta`) with suggestion chips (`.tags`).
- **Follow-up** (`Reveal.svelte`): opens by height, its content rises, the drawn outline goes round
  it and breathes until answered, then settles into a plain ink border.
- **Object tiles** (`.tile`): square white tiles with an object drawing and a small ink tick in the
  corner; single choice three to a row, multiple choice (`.tiles.small`) four to a row, three on
  phones. Picked = ink border and a heavier label. The drawings are always ink object drawings
  (`design.md` 6), never coloured.
- **Landmark cards** (planned, `backlog/drawing-5-landmarks.md`; mockup 3.3 and 3.6): object
  tiles used as a menu, not as an answer. Four to a row, three on phones. Tapping one opens the
  plan with that landmark's tool on. A card whose landmark is on the plan has the ink border, the
  heavier label and the tick, and a small grey count top left when there is more than one. The
  card does not carry the landmark's colour.
- **Appliance cards** (`.acard`): square tiles (rows on phones). A card with options turns over
  180° onto them; options arrive 60ms apart; × turns it back. One-at-a-time sections dim the others.

## Files

- **Drop actions** (`.drop`, `src/lib/plans/Dropzone.svelte`): white blocks with a tool glyph, a
  serif line with the underlined verb, a small grey line of limits. Side by side on wide screens.
  `.drop.slim` is the one-row version.
- **File rows** (`FileTile.svelte`): document glyph, name, size, remove.
- **Photo grid** (`PhotoField.svelte`, `Thumb.svelte`): square thumbnails.
- **Drawing card** (`DrawingCard.svelte`): the saved drawing's preview with edit and delete.
- **Rejections** (`Rejections.svelte`): the list of refused files with "Am înțeles".

## Messages

- **Note**: a white plate with a hairline; a Figtree 600 title, the details as a short list, then
  the actions (outline first, filled ink second). For "not done yet" and "are you sure" on any
  screen. A question that must be answered before going on ("Gata cu planul?") is the same plate
  over a light scrim. Today it exists only inside `src/routes/deseneaza/+page.svelte` (`.note`), styled on the
  old tokens, with buttons whose `.btn` class `app.css` no longer defines;
  `backlog/drawing-1-editor-tools-and-view.md` makes it a shared part.
- **Hint line**: one grey Figtree 13px line (`design.md` 7.2).

## Tools

For tool screens (`design.md` 4 and 7.4). Only the drawing editor uses them
(`src/lib/floorplan/`); none is built yet. They are drawn in
`mockups/drawing/drawing-editor.html` and specified in the tickets `backlog/drawing-1-…` to
`backlog/drawing-5-…` (listed in `screens/drawing.md`).

- **Tool plate**: a white plate with a `--line-strong` hairline, top centre of the canvas, holding
  the tools side by side, each a tool glyph beside a 13px label; the active one is filled ink. On
  wide screens undo and redo follow after a divider. A tool that places a mark shows a small
  square in the mark's colour instead of a glyph.
- **Undo plate** (phones): undo and redo, glyph only, bottom left; `--off` when there is nothing to
  undo or redo.
- **View controls**: bottom right; fit only on phones, zoom in, zoom out and fit on wide screens.
- **Hint line on a canvas**: the hint line of `design.md` 7.2 under the tool plate, on a soft paper
  backdrop so the drawing can run under it; it may end with the link that reopens the slides.
- **Dimension chip**: a number with its unit in a white chip with a hairline, Figtree 13.5px, on a
  thin dimension line with ticks; typed ink, otherwise grey italic, missing `—`. Tapping it edits
  it in place. Framed in ink when it belongs to the thing in focus. A live length while drawing is
  an ink chip with paper text.
- **Chain**: the row of chips along a wall while a piece on it is in focus (gap, piece, gap), with
  a tick at every boundary and a leader for a number that has to step out.
- **Focus plate**: the plate of the thing in focus, holding only what it needs (a labelled number
  box or two, an action or two, "Șterge" last). Beside the piece on wide screens; docked bottom
  centre on phones, in two rows when needed.
- **Handles**: small white squares with an ink edge at the ends of what is in focus; free wall ends
  are small white circles while a drawing tool is on.
- **Mark**: a square on the plan in its mark colour (`design.md` 2), 30 cm at the plan's scale,
  against a wall on one face, with its name on a small white chip whose hairline and text are in
  the same colour. In focus it gets an ink edge.
- **Slides** (`design.md` 7.6): the plate or sheet with position and "Sari peste", the stage, a
  `.q2` title, a paragraph, and the row "Înapoi", position bars, filled button.

## Contents

- **Contents** (`/cuprins`): chapters as rows: thumbnail, number, serif name, question count,
  state ("Gata", "Aici ai rămas").
