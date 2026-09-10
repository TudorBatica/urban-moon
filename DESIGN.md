# Design language — Urban Moon configurator

The configurator should feel the way a good travel app feels: warm, calm, obviously
tappable, with objects on the screen instead of diagrams. This document is the reference
for anyone adding a screen, a control or an icon. The tokens live in `src/app.css`, the
icon set in `tools/icons/clay.mjs`.

## 1. Principles

1. **Layers, not lines.** Surfaces separate by elevation and tone, never by a thin border
   alone. Paper background, white cards floating on a soft shadow, cream panels for
   chapters. If two things look the same distance from the viewer, one of them is wrong.
2. **Contrast is not optional.** Every piece of text passes 4.5:1 on its surface.
   Secondary text is `--smoke` (#5E5A52) at 14px or larger. `--ash` is only for labels
   that are already bold, and never below 13px.
3. **One weight of voice.** One typeface, used heavy for headlines and medium for
   everything else. The serif survives only in the wordmark.
4. **Objects, not outlines.** Icons are small clay objects with volume, one light and one
   shadow. Never single-stroke line art, never emoji.
5. **One action per screen.** One dark pill button. Back is text. Nothing else competes.
6. **A limited palette, so a full screen stays calm.** Seven neutrals, one accent, and a
   rule for when the accent may appear (see Icons).

## 2. Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#FAF8F4` | page background |
| `--white` | `#FFFFFF` | cards, inputs, pills |
| `--cream` | `#FBF7F0` | fill of a selected card |
| `--brass-tint` | `#F5EFE3` | follow-up boxes, thumbnails |
| chapter panel | `linear-gradient(135deg, #F7EFE1, #FBF6EE)` | chapter cards, the "done" box |
| `--ink` | `#1C1A17` | headlines, labels, the primary button, selection outline |
| `--smoke` | `#5E5A52` | secondary text, hints (≥ 14px) |
| `--ash` | `#77726A` | tertiary labels (bold, ≥ 13px) |
| `--line` | `#E8E2D7` | resting borders, empty progress |
| `--line-strong` | `#D6CFC2` | hover borders, dashed borders |
| `--brass` | `#B69A5E` | progress fill, ticks, done steps |
| `--brass-deep` | `#7F714A` | eyebrow text ("Bucătărie · 14 din 17"), small brass labels |

Radii: `--r-card` 18px (option cards, inputs at 14px), `--r-panel` 28px (chapter
and done panels), `--r-pill` 999px (buttons, pills, chips, progress).

Shadows (all warm-tinted, never pure black):

- rest `--shadow`: `0 1px 2px rgba(28,26,23,.04), 0 8px 24px rgba(28,26,23,.07)`
- hover `--shadow-lift`: `0 2px 4px rgba(28,26,23,.05), 0 14px 32px rgba(28,26,23,.11)`
- selected `--shadow-on`: `0 1px 2px rgba(28,26,23,.06), 0 12px 28px rgba(28,26,23,.10)`
- primary button: `0 8px 20px rgba(28,26,23,.18)`

Motion: `--ease` is `cubic-bezier(.22,.61,.36,1)`. Cards lift 2px on hover over
180ms; icons on a hovered card rise 2px and tilt −2°; ticks pop in over 220ms. Everything
is disabled under `prefers-reduced-motion`.

## 3. Typography

**Plus Jakarta Sans** (Google Fonts, 400–800) for everything. **Playfair Display 600**
for the wordmark only. Load nothing else.

| Role | Size | Weight | Tracking | Color |
| --- | --- | --- | --- | --- |
| Chapter title (`.chapter h2`) | clamp(1.9rem, 5vw, 2.9rem) | 800 | −.025em | ink |
| Question (`.q-title`) | clamp(1.55rem, 4.2vw, 2rem) | 700 | −.015em | ink |
| Section heading (`.heading`, `.block-head h3`) | 1.15–1.35rem | 700 | −.01em | ink |
| Option label (`.tile .lbl`) | .95rem | 600 | 0 | ink |
| Hint (`.tile .hint`, `.q-sub`) | .84–.95rem | 400 | 0 | smoke |
| Eyebrow / meter label | .82rem | 700 | .01em | brass-deep |
| Chip, pill, button | .82–.95rem | 600–700 | 0 | as surface |

Headlines use `text-wrap: pretty`. Questions cap at 26ch so they wrap into two or three
strong lines rather than one long one.

## 4. Layout and chrome

- Content column: 920px max, side padding `clamp(20px, 4vw, 32px)`.
- **Header**: wordmark left, "Începe din nou" as an outlined pill on the right.
- **Journey** (`.rail`): one chip per chapter, in order. Numbered circles are drawn by CSS
  counters so the chip's text content is only the label (the e2e tests read it). Done =
  brass circle with a white check, current = ink circle, upcoming = outlined. Connectors
  between chips turn brass when done.
- **Progress** (`.meter`): one 4px segment per chapter; done chapters are full, the current
  one fills as questions are answered. Under it, the eyebrow `Bucătărie · 14 din 17` in
  brass-deep with a brass dot.
- **Footer** (`.nav`): sticky, paper gradient fade above it. Back as underlined text on the
  left, the primary pill on the right with an arrow.

## 5. Components

**Option card** (`.tile`) — white, 18px radius, 1px `--line` border, `--shadow`, icon 56px
above a 600-weight label and a 14px hint. States:

- hover: lift 2px, `--shadow-lift`, `--line-strong` border, icon tilts
- selected (`.on`): ink outline (1px border + 1px inset ring), `--cream` fill, brass tick
  top-right
- dimmed (`.dim`): 45% opacity when a `max` has been reached

Variants: `.tiles.rows` (single choice with ≤ 4 options) lays each option out as a
full-width row with the icon on the left. `.tile.quiet` (the exclusive "Nu" of a multi
choice) spans the grid, sits under the other options, and uses a dashed border with no
shadow, so it reads as a different kind of answer.

**Chapter card** (`.chapter`) — cream gradient panel, 28px radius, a soft white radial
glow behind the icon, eyebrow pill ("4 întrebări · cam un minut"), 800-weight title, one
sentence of blurb, and the room's icon at up to 240px on the right (above the text on
phones).

**Appliance deck** (`.acard`) — same surface as option cards at 20px radius; the flip
animation is unchanged. Option pills inside (`.opt`) are the same as `.pill`.

**Pills** (`.pill`, `.opt`, `.chipbtn`) — full-radius, 44px minimum height, 1.5px border.
Selected = ink border with a `--cream` fill. Suggestion chips (`.chipbtn`) are dashed
until hovered.

**Stepper** — 40px round buttons, bold value.

**Inputs** — 14px radius, 1.5px border, ink border and a 3px soft ring on focus.

**Buttons** — `.btn` is the only primary: ink pill, 52px tall, white 700 text, arrow on
the right, warm shadow. `.btn.ghost` is underlined text. There is no secondary button.

## 6. Icons

The set is built from `tools/icons/clay.mjs` by `node tools/icons/build.mjs`, which
writes `src/lib/questions/icons.ts` and `src/lib/plans/icons.ts`. Edit the source, run
the build, commit both. Each icon is an inline SVG on a 64×64 grid, sized by its
container (`.ico` sets width and height).

Style rules, so that any number of icons on one screen still look like one family:

- **Nine materials, each a vertical gradient (light top, dark bottom):** cream, sand,
  sandDark, brass, terra, charcoal, white, glass, muted. Solid helper colors exist for
  thin details only.
- **One light source**, top-left: a small white ellipse highlight at about 45–65% opacity
  on the main body.
- **One soft shadow** under the object: a blurred ellipse at 13% ink.
- **Terracotta is the only accent, and it means warmth**: fire, food, drink, textiles, a
  rug, a doormat. It never marks a button, knob, handle or light. Those are brass.
- **Casings are cream or charcoal**, wood is sand, metal is brass, glass is glass.
- **Muted grey is for negative answers** ("Nu", "Nu bem cafea", "mâncăm în altă parte"):
  a grey ring or object with a diagonal slash.
- Keep an icon to 4–10 shapes. If it needs more to be legible at 56px, simplify the idea.
- Draw for the smallest size it appears at: 28–30px in pills, 44–56px in cards, 240px in
  chapter cards.

Adding an icon: copy the nearest existing entry in `clay.mjs`, reuse its sub-drawings
(`doorBody`, `ovenBody`, `washerBody`, `column`, `bin`...), keep the material rules,
run the build, and check it beside its neighbours on the screen where it will appear.

## 7. Copy

Address the user as *tu*. Questions are short and direct, hints are a half sentence in
lower case. Multi-choice screens say "Poți alege mai multe." when they have no other
subtitle. The eyebrow always names the chapter and the position: `Bucătărie · 12 din 17`.

## 8. What not to do

- No borders as the only separator between a card and the page.
- No text below 13px, no grey text below 4.5:1.
- No thin-stroke icons mixed into the clay set, and no emoji.
- No second accent color. If a screen looks like it needs one, reduce terracotta instead.
- No one-corner radius, no square corners: every surface is 18px, 28px or a pill.
- No new fonts.
