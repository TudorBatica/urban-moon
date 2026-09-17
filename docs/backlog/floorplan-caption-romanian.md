# Romanian caption on the exported floor plan

## Description

`apps/input-capture-web/src/lib/floorplan/export.ts` writes
`All dimensions in cm · Ceiling <n> cm · outline not closed` into the SVG/PNG footer (and
`export.test.ts` asserts it), while everything else the client sees, the editor included, is
Romanian. The caption also ends up in the PDF. Translate it.
