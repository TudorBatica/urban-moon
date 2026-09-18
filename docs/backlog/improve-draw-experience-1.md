# Improving the layout drawing experience - part 1 - essentials

## Description

We have changes to be done on the layout drawing functionality:
1. UI visual changes: bring the overall look and feel of the draw canvas to the design standard. Suggest a few mockups/visual directions.
2. update the initial step in the draw experience: first, the user has a choice of selecting from a two common shapes for the room (rectangle or L-shape) or to draw their own (proceeding to the current flow); 
3. we currently have an always-in-draw mode on, which implies automatic zoom, which is really annoying; bring it back to select to draw, explain how it will work so it's intuitive that you need to select a tool to draw, how the tool bar works, how zoom works, mobile-first, but explain for both platforms
4. update the design language docs to fit in more general flows, like this one, right now the docs conflate general design language philosophy with information specific to the questionnaire. Figure a way to structure the design docs, inside docs/design.md, optimally for yourself. once the docs have been updated, update your own docs references at .claude/agents/ux.md, and any design docs reference in the root readme.md

## Experience

Written by the ux agent. **The settled design is the mockup**
`docs/ux/mockups/drawing/drawing-editor.html` (open it in a browser; its sections are linked from
its top, phone frames 360×740, desktop 1000×640). Parts 2 and 3 of the mockup show every state;
part 4, "The systems", writes out every rule. This section summarises it so the build can be
planned and reviewed; where the two differ, the mockup wins and this text is corrected.

The design went through several rounds with the user, and what was settled differs from the
description above in three ways:

- **No starting-shape chooser** (point 2). The editor opens straight on the empty canvas; the
  rectangle and L-shape tiles are dropped.
- **Tools are one-shot** (point 3): five tools, each of the four that make something returns to
  Selectează after one use.
- **The flow grew two screens after the plan**: the ceiling height as a question of its own, and
  "Ce mai e prin cameră?", where the client places landmarks (water, gas, boiler and so on) on
  the finished plan.

The design language was changed to fit (`docs/ux/design.md`: principles 2 and 6, sections 2, 4,
5, 6, 7.3, 7.4 and 9; `docs/ux/components.md`, "Tools" and "Object cards"). The editor as it is
today, with its defects: `docs/ux/screens/drawing.md`.

### What the client gets, in short

1. `/deseneaza` opens on the empty canvas. The first time in this browser, five short slides play
   over it, one per tool, each showing the gesture on a small copy of the client's own screen.
2. Five tools in one plate at the top of the canvas: **Selectează**, **Perete**, **Fără perete**,
   **Fereastră**, **Ușă**. A tool makes one thing, then Selectează is on again. Touching the canvas
   with Selectează never draws.
3. The view never zooms or moves by itself; the client pinches or scrolls, and "Încadrează" brings
   the whole plan back.
4. The thing last touched or just made is in focus: its number framed, a small plate with only what
   it needs, and, for a window, a door or a landmark, a chain of distances along its wall.
5. The arrow asks "Gata cu planul?", saves without checks, then asks the ceiling height and what
   else is in the room. Landmarks are placed on the plan as small coloured squares with their name.
6. The editor looks like the rest of the questionnaire: paper, ink, Figtree numbers, the same top
   and bottom bars, no brass.

### 1. The look (direction A, "Foaie")

- **Chrome.** The questionnaire's top bar with only the wordmark and the step word "Plan"; the
  bottom bar with only "Înapoi" and the round arrow (`aria-label` "Gata, salvează planul"). No
  "Începe din nou", no ceiling plate, no missing-things line.
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
    the undo and view plates. It holds only what that thing needs (section 3).
- **Hint line.** One grey line under the tool plate, on a soft paper backdrop so it stays readable
  when the drawing runs under it (copy table).
- **Defects to fix as part of this** (`docs/ux/screens/drawing.md`): the dimension chip that
  becomes a full-height white column (`side` class hit by the Frame's `.side`), the `.field`
  margin, the unstyled "Înapoi"/"Gata" buttons, brass and red. After this ticket nothing on the
  page may pick up a questionnaire class by accident.

### 2. Tools

| Tool | Key | What one use is |
|---|---|---|
| **Selectează** (resting tool) | V | tap a wall, side, opening, landmark or number: focus it · drag a wall: move it · drag a handle: move the corner or resize the opening · drag an opening: slide it · drag empty canvas: move the view · tap empty canvas: end focus |
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
  edited), ? opens the slides, Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, + − 0 for the view. Desktop
  tooltips name each tool with its key.

### 3. Focus, plates and numbers

- **Focus.** One thing at a time: a `--wash` band, a heavier edge, a white square handle at each
  end or jamb, its number framed in ink, its plate. It ends when the client touches something else,
  taps empty canvas or picks a tool; it survives panning and zooming.
- **Plates.** A wall or a Fără perete side: "Șterge". A window: Lățime, Înălțime pervaz, "Șterge"
  (two rows on phones). A door: Lățime, "Rotește", "Șterge". A landmark: "Șterge". Wall lengths
  are never in a plate; they are on the drawing.
- **Numbers.** Every number is a white chip with a hairline, Figtree 13.5px, with its unit. Typed
  is ink; drawn, derived or prefilled is grey italic; not given is `—`. Tapping a chip edits it in
  place; the keyboard never opens by itself.
- **One lane**, outside the wall, 34px out. At rest it holds the wall's length. A number too narrow
  for its span steps out one lane (68px on a horizontal wall, 96px on a vertical one) on a thin
  leader; two in a row are pushed apart. The room side stays free for plates and landmark names.
- **The chain.** While a window, a door or a landmark is in focus or dragged, its wall's length
  stands down and the lane holds gap | piece | gap, with a tick at every boundary. A gap runs to the
  first obstacle: another opening or landmark, a corner, a free end, or where a Fără perete side
  begins. The chain stops at a corner even though the piece can slide round it. The piece's own
  number is framed in ink and is the same value as the first field of its plate; the gaps are grey
  italic and count live during a drag. A zero gap shows nothing. Gaps are read-only (open question
  O1).
- **Defaults carried over.** Window 60 cm wide with a 90 cm sill, door 90 cm. Prefilled numbers are
  grey italic until typed. Once the client types a width or a sill, the next window starts from
  that value, still grey italic.
- **Sliding an opening.** It travels as far as the wall is continuous, round joined corners (it
  moves over once its middle passes the corner), and stops against another opening and at a Fără
  perete side. Past a free end it may go until its near jamb meets the wall's end; a wall drawn
  from its far jamb joins it. While dragging, the plate hides and the chain stays.
- **Rotește** cycles a door's swing through four: hinge at one jamb opening in, the other jamb in,
  that jamb out, the first jamb out.
- **The drawing area** is the canvas minus the plate bands, so a fit never puts a number under the
  chrome. A number whose wall is off screen is not drawn.

### 4. View

- Opening the editor and "Încadrează" fit the whole drawing into the drawing area, eased over
  `--base`. An empty canvas fits a 4 × 4 m area. Nothing else changes the zoom.
- Phone: two fingers pinch and pan whatever the tool (a second finger landing during a stroke
  cancels the stroke); one finger on empty canvas pans in Selectează. Mouse: the wheel and a
  trackpad pinch zoom around the pointer; dragging empty canvas in Selectează pans; Space + drag or
  the middle button pans with any tool.
- While a stroke or a drag comes within 32px of a canvas edge the view pans toward it at a steady
  pace. When a focused piece would sit under the docked plate, the view pans just enough to show it.
- Limits: zoomed out, the drawing's box is no smaller than a quarter of the canvas's shorter side;
  zoomed in, 50 cm is at most the canvas's shorter side.
- Numbers, handles, chips, plates and landmark name chips keep their screen size at every zoom;
  wall thickness and landmark squares scale with the plan.
- The first time the client zooms or pans, the hint shows the zoom line for 4 s, once per browser.

### 5. The slides

- Five slides, one per tool (Perete, Fără perete, Fereastră, Ușă, Selectează with moving and
  zooming), open over the empty canvas the first time in this browser, and again from "Cum desenez"
  at the end of the hint or the ? key, over whatever is on the canvas. Opening and closing them
  changes nothing on the drawing. There is no other help.
- Each is a plate over a light scrim (on phones a sheet from under the top bar down): position
  "1 / 5" and "Sari peste" on top; the stage; the tool's name as a `.q2`; one paragraph in the
  device's words; "Înapoi", the position as a row of short bars, and "Mai departe" (the last:
  "Încep să desenez"). Esc closes.
- The stage is a small copy of the client's own screen, and plays one eight-second timeline: zoomed
  on the tool, the tool is tapped and fills, the camera pulls back, the gesture runs, then it looks
  at the tool plate back on Selectează (Perete, Fără perete) or moves in on the placed piece and its
  numbers (Fereastră, Ușă). With `prefers-reduced-motion` each slide rests on a still frame.
- The first time a landmark is placed, one slide of the same shape ("Arată unde se află", "Am
  înțeles") shows the tap, the square with its name and distances, and the drag along and across
  the wall. It does not come back.

### 6. After the plan

1. **"Gata cu planul?"** Pressing the arrow opens a note over a light scrim: "Urmează înălțimea
   tavanului și ce mai e prin cameră. Te poți întoarce oricând la plan." with "Mai am de lucru"
   (outline) and "Continuă" (filled). "Continuă" saves; while it saves the arrow shows as pressed
   and takes no second press (hint "Se salvează…"). **There are no checks**: an open outline, drawn
   lengths and an unchanged sill are saved as they are. The arrow is grey only while the canvas is
   empty.
2. **Ceiling height.** A question screen (`noart` Frame, step word "Plan"): "Cât de înalt e
   tavanul?", subtitle "Măsoară de la podea până la tavan, în cameră.", a field "Înălțime" with
   "cm", the line "De obicei între 250 și 300 cm." The arrow waits for a number; on phones the
   number keyboard opens with the screen.
3. **"Ce mai e prin cameră?"** Subtitle "Alege pe rând și arată pe plan unde se află. Sari peste ce
   nu ai." Seven object cards, three to a row on phones, four on desktop: Țeavă de apă, Gaz,
   Centrală, Aer condiționat, Șemineu, Calorifer, Evacuare hotă. The drawings are object drawings in
   ink, as on the appliance cards (`design.md` 6; the drawings are in the mockup's `LM` list, Gaz
   being the app's `gas` drawing); they carry no colour. Nothing is required: the arrow goes on with
   none chosen. A card whose landmark is on the plan has an ink border, a heavier label and the
   tick, and a count in its top left corner when there is more than one.
4. **Placing.** Tapping a card opens the plan with a tool plate of two: Selectează and that
   landmark (a small square in its colour, and its name). Walls, windows and doors are drawn but
   cannot be selected or changed. A tap on a wall places a 30 cm square in the landmark's colour
   against the wall on the room side, with its name on a small white chip in the same colour; the
   tool turns off and the square is in focus with "Șterge" and its chain (the square is a break in
   the chain, with no number). Dragging slides it along the wall and round corners; dragging it
   across the wall puts it on the other face. The arrow here is "Gata" and returns to the cards.
5. **Landmark colours** (`design.md` 2): apă `#2F6F9F`, gaz `#C08A1E`, centrală `#3E7D5A`, aer
   `#6E63A6`, șemineu `#B4553A`, calorifer `#8A6244`, hotă `#9B4A86`. Only on the square, its name
   chip and the square in the tool plate.
6. From the cards the arrow goes on: back to `/planuri`, where the drawing card shows the saved
   plan (open question O2).

A saved drawing reopened from `/planuri` opens in the editor, fitted, with Selectează on.

### States

| State | What the client sees |
|---|---|
| First visit | empty canvas, the slides over it |
| Empty canvas | tool plate with Perete breathing, hint, view plate; arrow grey |
| A making tool on | that tool filled; free ends as circles; hint says the gesture |
| Drawing | translucent ink band with a dashed centre line, live length in an ink chip |
| Just made, or touched | Selectează filled; the piece in focus with its plate, framed number and, for openings, the chain |
| Dragging an opening or landmark | plate hidden, chain counting live |
| Arrow pressed | "Gata cu planul?" |
| Saving | arrow pressed, "Se salvează…" |
| Save failed | a note above the bottom bar: "Planul nu s-a salvat." · "Verifică legătura la internet și încearcă din nou." · "Încearcă din nou" (filled); the drawing stays as it was |
| Leaving with changes ("Înapoi") | note "Renunți la modificări?", "Rămân aici" (outline), "Renunț" (filled) |
| Cards, nothing placed | seven resting cards, arrow available |
| Cards, some placed | ticked cards with counts |
| Placing a landmark | two-tool plate, hint, then the square in focus |

### Copy (new or changed)

| Where | Phone (touch) | Desktop (mouse) |
|---|---|---|
| Tools | Selectează · Perete · Fără perete · Fereastră · Ușă | same, tooltips with keys |
| Plates | Lățime · Înălțime pervaz · Rotește · Șterge | same |
| View | Încadrează | Mărește · Micșorează · Încadrează |
| Hint, empty canvas | Alege **Perete**, apoi trage cu degetul ca să faci primul perete. · Cum desenez | Alege **Perete** (tasta P), apoi ține apăsat și trage ca să faci primul perete. · Cum desenez |
| Hint, while drawing | Ridică degetul ca să termini peretele. | Dă drumul butonului ca să termini peretele. Esc renunță. |
| Hint, wall just drawn | Atinge numărul ca să scrii lungimea. Pentru încă un perete, alege din nou Perete. | Dă clic pe număr ca să scrii lungimea. Pentru încă un perete, alege din nou Perete (P). |
| Hint, Fără perete on | Trage pe unde camera se deschide spre altă cameră. | same |
| Hint, Fără perete in focus | Atinge numărul ca să scrii lungimea. Trage linia ca s-o muți. | Dă clic pe număr ca să scrii lungimea. Trage linia ca s-o muți. |
| Hint, Fereastră on | Atinge peretele pe care e fereastra. | Dă clic pe peretele pe care e fereastra. |
| Hint, Fereastră or Ușă with no wall | Desenează întâi un perete. | same |
| Hint, window in focus | Trage fereastra ca s-o muți pe perete. Atinge înălțimea pervazului ca s-o schimbi. | Trage fereastra ca s-o muți pe perete. Dă clic pe înălțimea pervazului ca s-o schimbi. |
| Hint, window dragged round a corner | Fereastra merge pe perete și după colț, cât timp peretele continuă. | same |
| Hint, window past a free end | Fereastra poate trece de capătul liber. Apoi continuă peretele din capătul ei. | same |
| Hint, door in focus | Trage ușa ca s-o muți pe perete. Apasă Rotește până se deschide ca la tine. | Trage ușa ca s-o muți pe perete. Apasă Rotește (R) până se deschide ca la tine. |
| Hint, wall in focus | Trage peretele ca să-l muți. Atinge numărul ca să schimbi lungimea. | Trage peretele ca să-l muți. Dă clic pe număr ca să schimbi lungimea. |
| Hint, first zoom (4 s) | Apropie sau depărtează două degete ca să mărești. Cu două degete muți planul. | Rotița mărește în jurul cursorului. Trage de fundal ca să muți planul. |
| Hint, landmark tool on | Atinge peretele unde e {gazul}. | Dă clic pe peretele unde e {gazul}. |
| Hint, landmark in focus | Trage pătratul pe perete. Trage-l peste perete ca să-l muți pe partea cealaltă. | same |
| Hint, landmarks placed, none in focus | Atinge un pătrat ca să-l muți sau să-l ștergi. | Dă clic pe un pătrat ca să-l muți sau să-l ștergi. |
| Slides | the five titles and paragraphs in the mockup's `slides` list · Sari peste · Înapoi · Mai departe · Încep să desenez | the desktop paragraphs of the same list |
| Landmark slide | Arată unde se află · the paragraph in the mockup's `lmSlide` · Am înțeles | same, mouse words |
| Before leaving | Gata cu planul? · Urmează înălțimea tavanului și ce mai e prin cameră. Te poți întoarce oricând la plan. · Mai am de lucru · Continuă | same |
| Ceiling | Cât de înalt e tavanul? · Măsoară de la podea până la tavan, în cameră. · Înălțime · cm · De obicei între 250 și 300 cm. | same |
| Landmarks | Ce mai e prin cameră? · Alege pe rând și arată pe plan unde se află. Sari peste ce nu ai. · the seven names | same |
| Arrow `aria-label` | Gata, salvează planul (editor) · Gata (placing a landmark) | same |

The landmark hint uses each landmark's articulated form ("țeava de apă", "gazul", "centrala",
"aerul condiționat", "șemineul", "caloriferul", "evacuarea hotei"). Once built, the copy goes into
`apps/input-capture-web/COPY-chestionar(1).md`, "Ecranul de desenat planul", and the experience
moves into `docs/ux/screens/drawing.md`.

### Reviewing it

The ux agent reviews at 390×844 with touch and at 1440×900 with a mouse: every state in the table,
every hint, each tool's one use and its ways of making nothing, focus and the chain for a window,
a door and a landmark (including a narrow gap stepping out), sliding round a corner and past a free
end, pinch and wheel zoom, auto-pan at the edge, the slides first time and reopened, reduced
motion, the three screens after the plan, and a saved drawing reopened. Compared with the mockup
and with `docs/ux/design.md`.

Notes for the architect and qa: drags on empty canvas no longer draw unless a tool is on, so the
drawing journeys in `e2e-full-journeys.md` change. The ceiling height moves out of the editor into
its own screen, and landmarks (kind, wall, position along it, face) are new data for the drawing,
the manifest and the architect's PDF; whether they belong to this ticket or a second one is the
architect's call.

### Open questions

- **O1. Typed gaps.** Gaps in the chain are read-only. Typing one (write 100 and the piece moves to
  100 cm from the corner) is the obvious next step; not in this ticket unless the user says so.
- **O2. Where the arrow on the cards goes.** The mockup says "the rest of the questionnaire". This
  text takes that to be `/planuri`, where the editor was opened from and where photos are still to
  be added. To confirm with the user.
- **O3. Save failure and leaving with changes** are not drawn in the mockup; the states table gives
  them in the language of `design.md` 7.2.
- **O4. Card to colour.** The cards no longer show the landmark's colour (user decision, final
  revision), so the client first meets it on the tool plate when placing. If testing shows clients
  cannot tell which square is which on a full plan, the name chip is the fallback already in place.
