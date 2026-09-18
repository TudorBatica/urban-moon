# The drawing editor

`/deseneaza`, opened from the plans step when there is one room: the client draws the room's
outline, gives the walls their lengths, and places doors and windows. "Gata" saves the drawing and
returns to the plans step. The system side: `docs/architecture/flow.md` step 4. Code:
`apps/input-capture-web/src/lib/floorplan/`.

## The settled design (not built yet)

`mockups/drawing/drawing-editor.html` is how the drawing experience will work: parts 2 and 3 show
every state on a phone and on desktop, part 4 writes out the rules.
It is built by five tickets in `backlog/`, in this order, each the spec for its part:
`drawing-1-editor-tools-and-view.md` (the look, the tools, the view, saving, the ceiling height),
`drawing-2-numbers-and-sliding.md` (the lane, the chain, sliding round corners and past a free
end), `drawing-3-slides.md` (the slides, with a placeholder stage),
`drawing-4-landmarks-contract.md` (landmarks in the manifest and the PDF) and
`drawing-5-landmarks.md` (the landmark cards and placing). What plays inside the slides is
`drawing-tutorial-animations.md`. As each is built this page describes the result; once all are,
the section below goes. What is particular to these screens, beyond the
general rules for tool screens in `design.md` (4, 7.3, 7.4, 7.6):

- **Screens.** The editor on an empty canvas, with five slides over it the first time; then, after
  "Gata cu planul?", the ceiling height as a question screen, and "Ce mai e prin cameră?", a menu
  of seven landmark cards from which the client goes back onto the plan to place each one.
- **Tools.** Selectează, Perete, Fără perete, Fereastră, Ușă. Perete and Fără perete are one drag;
  Fereastră and Ușă are one tap on a wall. No changing a wall's kind; delete and draw again.
- **The plan.** Walls are a solid ink band 20 cm thick; a window is three thin lines with jambs, a
  door a leaf and a dashed arc, a Fără perete side a dashed grey line with end ticks.
- **Numbers.** One lane 34px outside each wall; the chain gap | piece | gap to the first obstacle
  while a window, door or landmark is in focus, stopping at corners.
- **Openings** slide along a wall, round joined corners and past a free end; a window is 60 cm with
  a 90 cm sill and a door 90 cm by default, and typed values carry over to the next one. Rotește
  cycles a door through its four swings.
- **Landmarks** are 30 cm squares in their mark colour with a name chip, on either face of a wall;
  several of a kind are allowed. During that step only Selectează and the chosen landmark are in
  the tool plate. The cards that offer them are ink object drawings with no colour.
- **Saving** has no checks: an open outline and drawn lengths are saved as they are.

## As it is today (September 2026)

- **Chrome.** Its own strip at the top (wordmark and "Desenează planul · <camera>" in Playfair,
  the room in brass italic), a bottom row with "Înapoi" and "Gata" as unstyled browser buttons.
  Not the Frame.
- **Drawing.** Always on: any drag on empty canvas draws a wall. A drag from a free wall end
  continues it or, along its axis, resizes it. Tapping empty canvas deselects.
- **View.** No zoom or pan by the client. After every stroke the view refits to the drawing, so
  the first 2 m wall fills the screen and the next stroke starts on a canvas that just jumped.
- **Tool plate** (floating, bottom centre): "Anulează", "Refă", "Înălțimea tavanului" with a cm
  field, and a count of what is missing. A second plate appears with a selection: the kind switcher
  (Perete, Latură deschisă, Fereastră, Ușă). Next to the selected piece: "+ Ușă", "+ Fereastră",
  "Șterge".
- **Numbers.** Every wall carries a dimension chip; typed numbers ink, drawn ones grey italic.
- **Finishing.** "Gata" is disabled with no walls; with an open outline it shows "Conturul nu e
  închis încă." with what is missing, "Continuă desenul" and "Salvează oricum". Leaving with
  changes asks "Renunți la modificări?" ("Rămân aici", "Renunț").

## Defects seen on 2026-09-17 (local app, 390×844 and 1440×900)

- After a second wall, a dimension chip renders as a 64px-wide white column the full height of the
  screen, over the drawing and the tools. The chip's class `side` picks up the Frame's global
  `.side` rule from `app.css`.
- On phones the ceiling plate is about 107px tall, mostly empty: the global `.field` rule adds a
  22px bottom margin to the editor's own `.field`. The empty-canvas hint ("Trage oriunde ca să
  desenezi primul perete.") sits under that plate and cannot be read; on desktop it is half-covered.
- Brass on walls being drawn, selection, doors and the heading; a red on "Șterge" hover.
- Walls are drawn as a 20 cm hatched band, which at the fitted scale is about 25px thick on a phone and 80px on desktop.
