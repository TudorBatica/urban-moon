# Bring existing code comments to the standard

## Description

`docs/code/standards.md` says comments explain why the code behaves as it does because of how the
system works, and never record how a decision was reached. Many existing comments were written
before that rule, and some tell the history of earlier attempts (the floor plan editor in
particular: the comments that came out of the old `engine.js` when it was split, and now live in
the modules under `apps/input-capture-web/src/lib/floorplan/engine/`). Go through every comment in
`apps/` and `packages/`: keep or shorten
the ones that explain behaviour, remove the ones that tell history, and list any that record a
system-wide rule so the architect can decide whether it needs an ADR. No behaviour changes.
