# The plans step

`/planuri`: the client says they measured, adds their plans (files or a drawing) and photos of the
space. The system side: `docs/architecture/flow.md` step 3.

## Layout

A `dense` Frame; the top bar says "Planuri". Title: "Planul pentru <cameră>" for one room,
"Planurile camerelor" for more.

## States

1. **Not measured.** A note ("Înainte de plan, măsoară spațiul.") and the checkbox option "Am
   măsurat spațiul". Everything below is visible but dimmed and inert.
2. **Measured.** The tick draws, the note folds away, the subtitle "Măsurat de tine. Mergem mai
   departe." fades in and the actions wake up.
3. **Adding plans.** Side by side (stacked on phones): the drop action to upload, and, for one
   room only, the drop action "Desenează planul" that opens the drawing editor
   (`screens/drawing.md`; once redesigned, the editor is followed by the ceiling height and the
   landmarks before the client is back here). A saved drawing replaces that action with the drawing card
   ("Modifică", "Șterge"). Files appear as rows; refused files as rejections.
4. **Photos.** "Ai imagini cu spațiul tău?" and the photo field.
5. **Done.** The arrow becomes available once there is at least one file or a drawing.

## Known gaps

- Deleting the drawing asks with the browser's own `confirm()` dialog, not a note
  (`design.md` 7.2).
