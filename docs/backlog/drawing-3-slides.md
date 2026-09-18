# Drawing 3: the slides, with a placeholder stage

## Description

Third of five tickets that rebuild the drawing experience. It adds the editor's only help: five
slides, one per tool, that open over the canvas the first time in a browser and reopen from the
hint. **The animation each slide plays is not built here**: the stage ships as a placeholder, and
`drawing-tutorial-animations.md` fills it later.

**Depends on** `drawing-1-editor-tools-and-view.md` (the hint line, the engine's keys). Independent
of tickets 2 and 4; ticket 5 adds one landmark slide using what is built here. Until this ticket
lands the editor has no help link; after it the app is shippable as it stands.

**The visual source of truth is the mockup** `docs/ux/mockups/drawing/drawing-editor.html`:
sections 2.1, 2.10 and 4.7, for everything except what moves on the stage. Design language:
`docs/ux/design.md` 7.6, `docs/ux/components.md` ("Slides").

---

## Experience

Written by the ux agent.

- Five slides, one per tool, in this order: Perete, Fără perete, Fereastră, Ușă, Selectează (with
  moving and zooming). They open by themselves over the canvas the first time in this browser, and
  again from "Cum desenez" at the end of the hint line or the `?` key, always from the first slide,
  over whatever is on the canvas. Opening and closing them changes nothing on the drawing: nothing
  is selected or deselected, no tool changes, the view stays. There is no other help.
- Each is a plate over a light scrim (on phones a sheet from under the top bar down): the position
  "1 / 5" and "Sari peste" on top; the stage; the tool's name as a `.q2`; one paragraph in the
  device's words; then "Înapoi", the position as a row of short bars (not dots; the round arrow
  stays the only circle), and "Mai departe" as a filled button, on the last slide "Încep să
  desenez". "Sari peste" and Esc close.

### States

| State | What the client sees |
|---|---|
| First visit | the canvas, the slides over it on slide one |
| Later visits | no slides; "Cum desenez" at the end of the hint |
| Reopened | the slides from slide one over the drawing in progress |

### Copy

| Where | Text |
|---|---|
| Hint line, every state | ends with the link "Cum desenez" |
| Slides | Sari peste · Înapoi · Mai departe · Încep să desenez |
| Titles and paragraphs | the five entries of the mockup's `slides` list: title, the phone paragraph, the desktop paragraph |

---

## Technical plan

Nothing exists to reuse beyond the app's tokens and type styles. No contract change.

- `src/lib/floorplan/Slides.svelte`: the surface above. It takes the slide definitions and the
  device as props, so another screen can show a different set. "Înapoi" is absent on the first
  slide. Focus is trapped inside while open and returns to where it was.
- The slide definitions are data in one module: id, title, phone paragraph, desktop paragraph,
  copied from the mockup's `slides` list. The device follows the pointer last used, starting from
  `(pointer: coarse)`, the same rule the hint line uses.
- The engine gets an `onHelp` callback, fired by the "Cum desenez" link it renders at the end of
  the hint and by `?`; the slides are mounted by the route, outside the engine, and the engine's
  keys are suspended while they are open (the suspend call from ticket 1).
- Opening by itself: on `/deseneaza` when `um.draw.seen.slides` is not set, over an empty canvas
  or a saved drawing alike. The flag is written when the slides close, however they close. The
  seen-flags module from ticket 1 gains the `slides` flag.
- **The placeholder.** The stage is one component, `SlideStage.svelte`, taking the slide's id and
  the device (`phone` | `desktop`). Here it renders a still box with the final stage's proportions
  (the mockup's: a small copy of the screen, portrait on phones, landscape on desktop), `--paper`
  with a `--line-strong` hairline, and in its centre the glyph of the tool the slide is about, as
  in the tool plate. No motion, no copy, `aria-hidden`. It carries `data-testid="slide-stage"` and
  `data-placeholder="true"`. The animations ticket replaces the inside of `SlideStage.svelte` and
  nothing else: `Slides.svelte`, the flags and the copy do not change with it.

### Unit tests

The seen-flags module with the new flag; the slide definitions (five, in order, both paragraphs
present); a pure "which slide, which button label, is back shown" helper if the component's logic
is more than trivial.

### Test ids

`slides`, `slides-position`, `slides-skip`, `slides-back`, `slides-next`, `slide-stage`,
`hint-help` (the "Cum desenez" link).

### For qa

Every drawing journey now starts by skipping the slides (`slides-skip`) or seeds `um.draw.seen`
through `addInitScript`. Journey 4 of the `journeys/drawing.spec.ts` section in
`e2e-full-journeys.md` ("the slides open the first time only and reopen from the hint") is written
against this ticket.

### Rules and scope

`docs/code/standards.md`. Deploy: web app only, smoke tier. Out of scope: anything that moves on
the stage, `prefers-reduced-motion` handling of the stage (both `drawing-tutorial-animations.md`),
the landmark slide (ticket 5).

## How to verify it once delivered

`npm run check` and `npm test` pass. At 390×844 and 1440×900, against mockup 2.1 and 2.10:

1. In a fresh browser profile `/deseneaza` opens with the slides on "1 / 5"; a sheet from under
   the top bar on the phone, a plate over a scrim on desktop.
2. "Mai departe" walks the five titles in order; the bars follow; "Înapoi" is absent on the first;
   the last button says "Încep să desenez" and closes.
3. The paragraph says "atinge/degetul" with touch and "dă clic/tastele" with a mouse.
4. The stage is the placeholder: a still box with the tool's glyph, nothing moving.
5. "Sari peste" and Esc close. After a reload the slides do not open.
6. With a wall in focus and the view zoomed, "Cum desenez" and `?` open the slides from slide one;
   on closing, the same wall is in focus, the same tool is on, the view has not moved, and undo
   has nothing new.
7. While the slides are open, P, F, Delete and the rest do nothing to the drawing; Tab stays inside.

## After it is built

The architect adds the `slides` flag to `um.draw.seen` in `docs/architecture/storage.md` if the
key's description lists flags. The ux agent updates `docs/ux/screens/drawing.md`,
`docs/ux/components.md` ("Slides" built, stage pending) and the copy document. Then this ticket is
deleted.
