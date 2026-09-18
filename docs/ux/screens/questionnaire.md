# The questionnaire

How the language applies to the question screens (`/?s=<screenId>`), the chapter openers and the
contents (`/cuprins`). The system side of these screens: `docs/architecture/flow.md` steps 1–2.

## One question per screen

- Each screen asks one question (`.q`), with an optional subtitle (`.sub`) and its answer parts
  (`components.md`, Answers). A question longer than ~58 characters sets itself as `.q.sm`.
- The photograph sets the mood of the chapter. Screens with dense answers (appliance cards, long
  lists, the household) use `dense` or drop the photograph.
- The top bar's counter `4 / 16` is the position among the chapter's questions; its digit rolls.
- The arrow is grey until the question is answered, then pops.

## Chapters

- A chapter opens with an `opener` Frame: the chapter title set large, the arrow bouncing once.
- The contents lists chapters as rows (thumbnail, number, serif name, question count, state
  "Gata" / "Aici ai rămas"); the wordmark on every screen leads here.

## Answer kinds

- Single and multiple choice: keyed options; "Altceva" opens a text box as a follow-up, and the
  arrow waits for the text.
- Compound screens: cards of fields; placements (a serif appliance name and a segmented choice).
- Furniture screens (`k13`, `l4`, `d4`, `x3_*`): items with name, length and width, and photos of
  the furniture being kept.
- Coffee and small appliances: object tiles.

## Copy

The wording of every question is in the catalog and follows `COPY-chestionar(1).md`
(`design.md` section 8).
