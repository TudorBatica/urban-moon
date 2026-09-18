# Design language: Urban Moon

The language every screen the client sees is built in, whatever the flow: the questionnaire, the
plans step, the drawing editor, the summary and whatever comes next. It says how things look,
move, speak and behave in general. What a particular screen does lives in `screens/`; the shared
parts that implement the language live in `components.md`.

Calm and editorial: a warm paper page, a light serif that asks, a sans that answers, controls that
feel like keys you press. The visual source of truth for the questionnaire is the two mockups,
`urban-moon-screens(1).html` (screens, web and phone) and `urban-moon-motion.html` (motion), in
`apps/input-capture-web/`; for tool screens it is `mockups/drawing/drawing-editor.html`, whose
part 4 writes out the rules the sections below generalise. Tokens live in
`apps/input-capture-web/src/app.css`.

## 1. Principles

1. **Calm before complete.** One thing to do per screen. Anything not needed for that thing is
   absent, not dimmed. A photograph may set the mood; it never carries information, and dense or
   working screens (long lists, tools) drop it.
2. **Ink on paper.** Near-black on warm off-white, hairlines to separate, no accent colour. State
   is told by ink weight, fill and outline, never by hue. Colour has one job and one place: on a
   plan, to tell apart kinds of things the client has put there (section 2, "Mark colours"). It
   never reaches the chrome, a card, an icon or a state.
3. **The serif asks, the sans answers.** What we ask or name is Newsreader Light; every answer,
   label, number and control is Figtree.
4. **Nothing moves without a reason.** Motion confirms something the client did or points at the
   one thing left to do. The view never moves on its own while the client is working (see 7.4).
5. **One way forward.** A round black arrow bottom-right, never with words in it (what it does
   goes in `aria-label` and the tooltip); "Înapoi" is grey text bottom-left. A tool screen keeps
   the same pair.
6. **Say what to do, where it is done.** Instructions are one short line next to the thing they
   are about, in the client's words, and change with the state. A gesture that words cannot carry
   is shown, not described: a tool screen may open once with a few skippable slides that play the
   gesture on a copy of the client's own screen (7.6). No manuals, and nothing that walks the
   client around the real screen while they wait.
7. **Phone first, both explained.** Every interaction is designed for a thumb on a 360px screen,
   then given its mouse and keyboard form. Where the gesture differs, the words differ too
   ("atinge" on touch, "dă clic" with a mouse).

## 2. Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#F5F4F0` | page, canvas |
| `--white` | `#FFFFFF` | option cells, tiles, text boxes, floating tool plates |
| `--ink` | `#141414` | text, selection, the arrow, active tool, walls |
| `--body` | `#33322F` | body text in segments and lists |
| `--soft` | `#5A5955` | subtitle (serif), secondary text |
| `--grey` | `#7A7975` | labels, counter, "Înapoi", hints, inactive tools |
| `--hair` | `#E0DFD9` | resting borders and rules |
| `--line-strong` | `#CFCEC8` | key boxes, segment and stepper borders, tool plates |
| `--wash` | `#ECEBE6` | photo placeholder, drag-over, a selected area's fill |
| `--off` | `#C9C8C2` | the arrow while it waits, disabled tools |
| `--place` | `#B5B4AE` | placeholders, "Fără răspuns", values not given yet |

Radius is 4px everywhere (3px on keys and chips). The round arrow is the only circle.

**Mark colours.** The only hues in the product, one per kind of landmark the client places on a
plan: `--apa` `#2F6F9F`, `--gaz` `#C08A1E`, `--centrala` `#3E7D5A`, `--aer` `#6E63A6`, `--semineu`
`#B4553A`, `--calorifer` `#8A6244`, `--hota` `#9B4A86`. Muted enough to sit on paper. A mark colour
fills the mark on the plan, and draws the hairline and text of its name chip and the small square
that stands for it in the tool plate. Nowhere else: the card that offers the landmark is an ink
object drawing like any other. A mark in focus gets an ink edge, so state is still told in ink. A
new kind of mark gets a new colour here before it is used; a colour is never reused for anything
that is not a mark.

`app.css` still defines the old brass, stone, smoke and ash tokens for the drawing editor. They are
not part of the language: nothing new uses them, and they go when the editor moves onto the
tokens above (`backlog/drawing-1-editor-tools-and-view.md`).

## 3. Typography

Newsreader (opsz, 300/400), Figtree (400–600), Playfair Display 600 for the wordmark only.

| Role | Style |
| --- | --- |
| Question or screen title `.q` | Newsreader 300, 34px / 1.12 (27px on phones), −.012em, max 18ch |
| Long question `.q.sm` | 26px (24px), used automatically past ~58 characters |
| Chapter opener `.q.xl` | clamp(44px, 6vw, 72px) |
| Section heading `.q2` | Newsreader 300, 22px |
| Subtitle `.sub` | Newsreader 300, 17px, `--soft` |
| Option or tool label | Figtree 15.5px (tool labels 13px); hint 12.5px `--grey` |
| Field label `.fl` | Figtree 13px `--grey` |
| Numbers on a drawing | Figtree 13.5px, tabular figures |
| Eyebrow | Figtree 12px, uppercase, .12em |
| Wordmark `.wm` | Playfair Display 600, 14px, uppercase, .14em |

A hyphenated word never breaks at its hyphen ("să-l"). Italic is not used for emphasis; on a
drawing it marks a number the client did not type (see 7.3).

## 4. Layout

- **Frame.** Every page sits in the same shell: a top bar (wordmark, which links to the contents,
  and on the right the position, a word naming the step, or on a tool screen its one screen-wide
  action as a grey link, if it has one), the content, a bottom bar with
  "Înapoi" and the arrow. On wide screens a photograph may take the left side (42%, 34% for dense
  screens, 50% for openers); on phones (≤ 860px) the order is top bar, photograph (if any),
  content, bottom bar, and the bottom bar is sticky over a paper fade.
- **Content width.** Reading content stays within 560px (720px without a photograph).
- **Tool screens** (a canvas the client works on) fill the viewport between the top bar and the
  bottom bar, with no photograph and no page scroll. Everything floats on the canvas in white
  plates with a `--line-strong` hairline and 44px rows, each in a fixed place: the tools top
  centre, with the hint line under them; undo and redo bottom left (on wide screens, inside the
  tool plate); the view controls bottom right; the plate of the thing in focus beside it on wide
  screens and docked bottom centre on phones, above the corner plates. The bottom bar holds only
  "Înapoi" and the arrow. The work is fitted into the canvas minus these bands, so nothing the
  client needs to read ends up under a plate.
- **Touch targets** are at least 44 × 44px, even when what is drawn is smaller.
- **Gutters.** 22px on phones, clamp(24px, 4.5vw, 64px) on wide screens.

Photographs are Unsplash ids in `src/lib/ui/images.ts`. Choose new ones to match: natural light,
muted palette, uncluttered, no faces, no text.

## 5. Motion

From `urban-moon-motion.html`, implemented in `src/lib/ui/motion.ts` and `app.css`:

- Three durations: `--fast` 180ms (touch feedback), `--base` 320ms (states), `--slow` 560ms (what
  appears or disappears). One exit curve `cubic-bezier(.2,.7,.2,1)`; one with a slight recoil
  `cubic-bezier(.34,1.4,.4,1)` for confirmations.
- Between pages the movement is vertical: the current page rises 12px and fades, the next comes
  up 16px from below 120ms later; going back reverses it. A photograph crossfades and settles with
  a slow 4% zoom over 1.2s; it never slides.
- Checks draw (stroke), ticks scale in on the recoil curve, a segment indicator slides, the arrow
  pops when it becomes available and nudges right on hover. On an opener the arrow bounces once,
  a second after arrival; the bounce moves a wrapper, never the button. Buttons scale to .94–.985
  when pressed.
- **The drawn outline** (an ink outline that draws round something and breathes) means "this is
  the thing to do next". It stops as soon as that thing is done. Only one breathes at a time.
- A view change the client asked for (fit, zoom buttons) eases over `--base`; a change they are
  doing with their fingers or wheel follows them exactly, with no easing.
- A slide that shows a gesture (7.6) plays one timeline of about eight seconds: close on the tool,
  the tap, back to the whole screen, the gesture, then close on the result.
- `prefers-reduced-motion`: everything becomes instant, nothing breathes, and a slide rests on a
  still frame.

## 6. Icons

Two kinds, both line drawings in ink, never filled glyph sets, never emoji and never coloured:

- **Object drawings** on a 64×64 grid, in `src/lib/ui/lineIcons.ts`: `#1A1917` strokes, 1.1px
  with round joins for outlines and .7px with round caps for details; light bodies `#F7F6F2`, dark
  parts `#2A2825` (a window, a door, a control strip), grey niches `#DDD9D0`, white `#FFFFFF` for
  glass and cups, `#8C877E` and `#B7B0A3` for marks on a dark part; a heavier stroke (1.4 to 2.6)
  only for a handle or a base. Coordinates sit on whole or half units so lines stay sharp at tile
  size. For every object the client picks from a card: appliances, coffee, and the landmarks of a
  room (water pipe, gas, boiler, air conditioning, fireplace, radiator, hood outlet). One thing
  has one drawing wherever it appears (gas is the same flame on the hob question and on the
  landmark card). Add one by copying the nearest drawing, keep it to a handful of shapes, check it
  at 26px and 88px.
- **Tool glyphs**, 20×20, 1.5px stroke, round caps, no fill: for tools and actions only (select,
  wall, no wall, window, door, rotate, delete, undo, redo, zoom, fit). The tool that places a mark
  has no glyph: it is a small square in the mark's colour. A tool glyph always has its word next to
  it on phones and wide screens alike, except undo/redo and zoom, whose meaning the glyph carries
  and whose word goes in `aria-label` and the tooltip.

Plain options get no icon.

## 7. Behaviour

### 7.1 States

Every screen defines what the client sees when it is empty, in progress, done, and when something
fails. Empty is never blank: it says the first thing to do. Done is quiet: the arrow becomes
available and nothing else celebrates.

### 7.2 Messages

- A hint is one grey line, Figtree 13px, next to what it is about. It changes with the state
  instead of piling up.
- Something the client must fix is said in ink, in a white plate with a hairline, as a plain
  sentence of what is missing and what to do; the plate offers the way to fix it first and the
  way past it (if there is one) second. No red, no warning icons.
- A question that needs an answer before going on (discard changes, start over, a number that looks
  wrong) is a small plate with two buttons: the safe choice in outline, the other filled ink.
- Rejections (a file too big, the wrong type) are listed by name and reason, and stay until
  dismissed with "Am înțeles".

### 7.3 Values

A value the client typed is ink. A value we derived, prefilled or that came from a drag is grey
italic, and turns ink when the client types it. A value not given yet shows `—` in `--place`. A
number is always shown with its unit. A default may carry over from what the client last typed for
the same kind of thing; it is still grey italic until typed there too. A number is edited where it
is shown, by tapping it; the keyboard never opens by itself on a tool screen.

### 7.4 Tools and canvases

For any screen where the client makes something by hand:

- **Choose a tool, then act.** Nothing is created by touching the canvas unless a making tool is
  on. The resting tool selects and moves. The active tool is filled ink with paper text; the rest
  are grey text on white. The plate always shows the same tools; one that cannot be used yet is
  not dimmed, and tapping it says what to do first.
- **One use, then back to selecting.** A making tool makes one thing and turns itself off; the
  resting tool fills again and the new thing is in focus. Nothing is made twice by accident, and
  one finger is free to move the view almost all the time. A touch that makes nothing leaves the
  tool on and the hint repeats what to do. Tapping the tool again, picking another, or Escape
  turns it off.
- **Focus.** One thing at a time is in focus: the one last touched or just made. It is shown by
  ink weight, a `--wash` fill and handles, never by colour; its number is framed in ink; its own
  plate holds only what that thing needs and sits where section 4 says. Focus ends when the client
  touches something else, taps empty canvas or picks a tool, and survives panning and zooming.
- **Numbers live on the work.** A measure is a chip on the drawing, not a field in a plate. Each
  line of the drawing has one lane for its numbers; when the thing in focus needs more detail,
  that detail replaces the resting number in the same lane rather than stacking beside it. A
  number too narrow for its place steps out on a thin leader; it never shrinks or overlaps.
- **Steps narrow the tools.** When a later step works on the same canvas, its plate holds only the
  resting tool and that step's tool; what earlier steps made is drawn but cannot be changed there.
- **The view is the client's.** It never zooms or pans by itself while the client works. It fits
  the work once when the screen opens or a starting shape is placed, and again only when asked
  ("Încadrează"). The one exception: while a finger or pointer drags near the canvas edge, the
  canvas scrolls under it.
- **Gestures.** Phone: one finger acts with the current tool; two fingers pinch to zoom and drag to
  pan, whatever the tool. Mouse: the wheel zooms around the pointer, dragging empty canvas with the
  select tool pans, Space + drag pans with any tool. Buttons for zoom in, zoom out and fit are always
  there on wide screens; on phones only fit is shown.
- **Undo and redo** are always one tap away while working.
- **Leaving.** The arrow on a tool screen asks once before it leaves ("Gata cu planul?"), with the
  way back to work first. It does not check the work: what the client made is saved as it is.

### 7.5 Keyboard

Every action has a keyboard path on wide screens. Single letters pick options on the questionnaire;
on tool screens they pick tools (named in the tool's tooltip). Escape closes, cancels or leaves a
tool; Enter confirms a typed value; Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo and redo.

### 7.6 Slides that show a gesture

The one kind of tutorial allowed, for tool screens only. A plate over a light scrim (on phones a
sheet from under the top bar down), opened by itself only the first time in a browser and always
skippable ("Sari peste", Escape); the same slides reopen from a link at the end of the hint line,
so there is no second help to keep in step. One slide per tool or mechanic: a stage that is a
small copy of the client's own screen playing the gesture (section 5), the tool's name in the
serif, one paragraph in the device's words, and "Mai departe" as a filled button, the last one
saying what happens next ("Încep să desenez"). The position is a row of short bars, not dots.
Opening or closing the slides changes nothing on the canvas.

## 8. Copy

- Romanian, addressing the client as *tu*, in sentence case.
- Short, concrete, active: say what to do ("Trage ca să desenezi un perete"), not how the system
  works.
- Touch words on touch screens, mouse words with a mouse (see principle 7).
- Units are written after a space: `260 cm`.
- The wording of every question lives in the shared catalog
  (`packages/domain-data/src/catalog/screens.ts`) and follows
  `apps/input-capture-web/COPY-chestionar(1).md`; the design never rewrites it. Text outside the
  catalog (tool screens, messages) is fixed in the ticket that introduces it and then added to the
  copy document.

## 9. What not to do

- No colour other than ink, greys, photographs and the mark colours on a plan (section 2). No
  brass, no red, no green, not even for selection, errors or success. No coloured icons or cards.
- No shadows beyond the picked-option lift and the turning card.
- No rounded pills or large radii; 4px. The round arrow is the only circle in the chrome, so
  positions are bars, not dots.
- No icons on plain options; no emoji.
- No sideways movement between pages.
- No view that moves by itself while the client is working.
- No tours that point around the real screen and no pop-up tips; explain in place, and show a
  gesture only with the slides of 7.6.
- No tool that stays on after it has made its thing, and no tool plate at the bottom of a canvas.
- No lengths in plates; numbers are on the drawing.
- No unstyled browser controls; every button is one of the parts in `components.md`.
