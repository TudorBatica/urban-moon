# Design language — Urban Moon configurator

Calm and editorial: a warm paper page, one interior photograph per screen, a light serif
asking the question, and answers that feel like keys you press. The source of truth is the
two mockups, `urban-moon-screens(1).html` (screens, web and phone) and
`urban-moon-motion.html` (motion). Tokens live in `src/app.css`; the parts in `src/lib/ui/`.

## 1. Principles

1. **One question, one photograph.** The photograph sets the mood; it never carries
   information. Dense screens (appliance cards, long lists, the household) drop it.
2. **Ink on paper.** Near-black on warm off-white, hairlines to separate, no shadows except the
   one lift of a picked option and the turning card. No accent colour.
3. **The serif asks, the sans answers.** Questions and headings are Newsreader Light; every
   answer, label and control is Figtree.
4. **Nothing moves without a reason** (see Motion). The drawn outline means "something new to
   answer here"; the grey arrow says the same on a second channel.
5. **One way forward.** A round black arrow bottom-right, never with words in it (what it does
   goes in `aria-label` and the tooltip); "Înapoi" is grey text bottom-left.

## 2. Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#F5F4F0` | page |
| `--white` | `#FFFFFF` | option cells, tiles, text boxes |
| `--ink` | `#141414` | text, selection, the arrow, segment indicator |
| `--soft` | `#5A5955` | subtitle (serif), secondary text |
| `--grey` | `#7A7975` | labels, counter, "Înapoi", hints |
| `--hair` | `#E0DFD9` | resting borders and rules |
| `--line-strong` | `#CFCEC8` | key boxes, segment and stepper borders |
| `--wash` | `#ECEBE6` | photo placeholder, drag-over |
| `--off` | `#C9C8C2` | the arrow while it waits |
| `--place` | `#B5B4AE` | placeholders, "Fără răspuns" |

Radius is 4px everywhere (3px on keys and chips). The old brass/stone tokens remain only
because the floorplan editor and the dev inbox still read them.

## 3. Typography

Newsreader (opsz, 300/400), Figtree (400–600), Playfair Display 600 for the wordmark only.

| Role | Style |
| --- | --- |
| Question `.q` | Newsreader 300, 34px / 1.12 (27px on phones), −.012em, max 18ch |
| Long question `.q.sm` | 26px (24px), used automatically past ~58 characters |
| Chapter opener `.q.xl` | clamp(44px, 6vw, 72px) |
| Section question `.q2` | Newsreader 300, 22px |
| Subtitle `.sub` | Newsreader 300, 17px, `--soft` |
| Option label | Figtree 15.5px; hint 12.5px `--grey` |
| Field label `.fl` | Figtree 13px `--grey` |
| Eyebrow | Figtree 12px, uppercase, .12em |
| Wordmark `.wm` | Playfair Display 600, 14px, uppercase, .14em |

A hyphenated word in a question never breaks at its hyphen ("să-l").

## 4. Frame

`Frame.svelte` is every page's shell: photograph + side. Modes:

- `art` — photograph 42% wide, sticky, full height; content centred in the side, max 560px.
- `dense` — photograph 34%, for screens with more content.
- `opener` — photograph 50%; the chapter title set large.
- `noart` — no photograph; the side is a centred 720px column.

On phones (≤ 860px) the order becomes: top bar, photograph (190px, or up to 52vh on an
opener), content, bottom bar. The top bar is the wordmark (links to the contents) and the
counter `4 / 16` — the position among the chapter's questions — or a word ("Planuri",
"Cuprins", "Trimitere"). The bottom bar is sticky over a paper fade.

Photographs are Unsplash ids in `src/lib/ui/images.ts`; `artFor(screen)` picks the photograph
and mode per screen. Choose new ones to match: natural light, muted palette, uncluttered, no
faces, no text.

## 5. Components

- **Keyed options** (`Keyed.svelte`) — white cells with a letter key; picked = ink border, lift
  of 1px, the key fills and a check draws in it. Pressing the letter picks it. Variants: `list`,
  `grid` (two columns, for more than seven options), `row` (compact chips). With a `max`, the
  rest dim to 45%.
- **Rooms** — one joined two-column grid; picked cells fill ink.
- **Segmented** (`Seg.svelte`) — up to four short options; an ink indicator slides under the
  pick. Two options sit inline at the end of a row (`mini`). Multi-choice segments fill each
  picked cell.
- **Counter row** (`CountRow.svelte`) — label left, − value + right; the digits roll.
- **Field** (`Field.svelte`) — a label and a line to write on; the line darkens on focus. Free
  text uses a white box (`.ta`) with suggestion chips (`.tags`).
- **Follow-up** (`Reveal.svelte`) — opens by height, its content rises, an ink outline draws
  round it and breathes until answered, then settles into a plain ink border.
- **Object tiles** (`.tile`) — square white tiles with a line drawing, a small ink tick in the
  corner; used wherever every option has a drawing: the coffee (single choice, three to a row)
  and the small appliances (`.tiles.small`, multiple choice, four to a row, three on phones).
- **Appliance cards** (`.acard`) — square tiles (rows on phones). A card with options turns
  over 180° onto them; options arrive 60ms apart; × turns it back. One-at-a-time sections dim
  the others.
- **Placement** — one block per appliance: a serif name and a segmented choice.
- **Plans** — `.drop` actions side by side (draw / upload), files as rows with a document
  glyph, photos as a thumbnail grid, notes as a text block with an ink rule on the left.
- **Contents** (`/cuprins`) — chapters as rows: thumbnail, number, serif name, question count,
  state ("Gata", "Aici ai rămas").

## 6. Motion

From `urban-moon-motion.html`, implemented in `src/lib/ui/motion.ts` and `app.css`:

- Three durations: `--fast` 180ms (touch feedback), `--base` 320ms (states), `--slow` 560ms
  (what appears or disappears). One exit curve `cubic-bezier(.2,.7,.2,1)`; one with a slight
  recoil `cubic-bezier(.34,1.4,.4,1)` for confirmations.
- Between questions the movement is vertical: the current page rises 12px and fades, the next
  comes up 16px from below 120ms later; going back reverses it. The photograph crossfades and
  settles with a slow 4% zoom over 1.2s; it never slides. The counter's digit rolls.
- Checks draw (stroke), ticks scale in on the recoil curve, the segment indicator slides, the
  arrow pops when it becomes available and nudges right on hover. On a chapter opener, one
  second after it arrives, the arrow bounces once. The bounce moves a wrapper, never the
  button, so a browser without the animation just shows a still, working button. Buttons scale to .94–.985 when
  pressed.
- `prefers-reduced-motion`: everything becomes instant and the outline stops breathing.

## 7. Icons

Line drawings on a 64×64 grid, in `src/lib/ui/lineIcons.ts` (`lineIcon(name)`): light bodies
`#F7F6F2`, dark parts `#2A2825`, grey niches `#DDD9D0`, 1.1px ink strokes, .7px details.
Only appliances (large and small) and coffee are drawn; everything else is words. `lineMap.ts` maps the icon
names in the question data to this set. Add an icon by copying the nearest drawing, keep it
to a handful of shapes, and check it at 26px and 88px.

## 8. Copy

Address the user as *tu*. The wording of every question lives in `src/lib/questions/screens.ts`
and follows `COPY-chestionar(1).md`; the design never rewrites it.

## 9. What not to do

- No colour other than ink, greys and the photographs.
- No shadows beyond the picked-option lift and the turning card.
- No rounded pills or large radii; 4px.
- No icons on plain options; no emoji.
- No sideways movement between questions.
