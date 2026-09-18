# Drawing 4: landmarks in the contract and in the architect's PDF

## Description

Fourth of five tickets that rebuild the drawing experience. Landmarks are what a room has that a
plan cannot show (water, gas, the boiler, air conditioning, a fireplace, a radiator, the hood's
outlet); the client will place them on the drawn plan (`drawing-5-landmarks.md`). This ticket
makes the system able to carry them: the room snapshot in the manifest, the shared catalog of
kinds, and the list in the PDF. Nothing the client sees changes.

**Depends on** nothing; it can be built at any time, in parallel with tickets 1 to 3, and must be
built (and its worker deployed) before ticket 5. On its own it is shippable: the new field is
optional, nothing writes it yet, and every existing manifest renders exactly as before.

---

## Technical plan

### `packages/domain-data`

Additive; `MANIFEST_SCHEMA_VERSION` stays 1 (the versioning rules: `packages/domain-data/README.md`).

- `src/schema/room.ts`: `RoomSnapshotSchema` gains `landmarks`, optional, an array of
  `RoomLandmarkSchema`:

  `{ id: string, kind: LandmarkKind, wallId: string, offsetFromStartCm: number, face: 'in' | 'out', gapBeforeCm: number, gapAfterCm: number }`

  - `offsetFromStartCm` runs from the wall's `from` to the mark's near edge, like a segment's.
  - `face` uses the door's convention: `in` is the side a door with `swing: 'in'` opens into (the
    room side); `out` is the other face of the wall.
  - `gapBeforeCm` and `gapAfterCm` are the clear distances from the mark's two edges to the first
    thing on each side along that wall (an opening's jamb, another landmark, a corner, a free end,
    the start of a side with no wall), "before" being toward the wall's `from`. They are computed
    by the editor at save time so the worker prints distances without redoing geometry. Both are
    non-negative.
  - A missing `landmarks` reads as none, in both apps.
- A landmark catalog next to the question catalog, browser-safe (no zod): `LANDMARK_KINDS` in this
  order, each with its Romanian `label`: `water` "Țeavă de apă", `gas` "Gaz", `boiler` "Centrală",
  `airConditioning` "Aer condiționat", `fireplace` "Șemineu", `radiator` "Calorifer", `hoodVent`
  "Evacuare hotă"; and `LANDMARK_SIZE_CM = 30`. Exported from the package root with the
  `RoomLandmark` and `LandmarkKind` types. Colours, icons and any other wording are the web app's.
- Schema rules: a landmark's `wallId` is a wall of the same snapshot; ids are unique; the offset
  plus the size fits within the wall's length.
- `fixtures/submissions/full/manifest.json`: its drawing gains at least two landmarks of different
  kinds, one on each face, on different walls. `minimal` stays without.
- `npm run schema -w @urban-moon/domain-data` regenerates `json-schema/manifest.schema.json`.
- The package README's import table mentions the catalog.

### `apps/input-pdf-worker`

`src/generation/sections/drawing.ts`:

- the summary line gains `Repere: <n>` when there are any;
- after "Pereți", a list "Repere", one line per landmark, ordered by wall index then by offset:

  `<label>: peretele <n> (<heading>), <pe partea camerei | pe partea cealaltă a peretelui>, la <gapBefore> cm și <gapAfter> cm de elementele vecine`

  a zero gap prints as `lipit`. Labels come from the catalog.
- a manifest without `landmarks`, or with an empty list, renders exactly as today.

This wording is for the architect, not the client; it is the architect agent's, not ux's.

### The web app

Only what the compiler asks for: `$lib/types` re-exports the new types. The commit already passes
`drawing.room` through the shared schema, so a snapshot with landmarks is accepted and one with a
bad `wallId` is refused as `commit_rejected`; one test in `src/lib/server/commit.test.ts` proves
each.

### Unit tests

- domain-data: a snapshot with valid landmarks passes; an unknown kind, an unknown `wallId`, a
  duplicate id, a mark that does not fit its wall and a negative gap are refused; both fixtures
  stay valid; a manifest with no `landmarks` stays valid; the JSON schema matches.
- worker: the build test renders `full` and finds the "Repere" heading, the count and one line in
  the exact wording; a copy of `full` with `landmarks` removed builds with no "Repere" text.
- web: the two commit cases above.

### For qa

No journey changes here. The journey that places a landmark and follows it to the PDF belongs to
ticket 5.

### Deploy

**Worker first**, then the web app, after the full e2e tier (a `domain-data` change). Either order
is safe (both apps strip snapshot keys they do not know), and until ticket 5 no manifest carries
landmarks; deploying the worker now is what lets ticket 5 deploy the web app alone.

### Rules and scope

`docs/code/standards.md`. Out of scope: placing landmarks, drawing them on the exported plan image
(both ticket 5).

## How to verify it once delivered

1. `npm run check` and `npm test` pass; the domain-data, worker and commit tests above exist.
2. `npm run schema -w @urban-moon/domain-data` leaves no diff.
3. Build the `full` fixture's PDF with the worker's local CLI (`apps/input-pdf-worker/README.md`):
   the drawn-plan page shows `Repere: 2` and the two lines, in Romanian with diacritics, in the
   wording above. Build `minimal`: unchanged from before the ticket.
4. The client-facing app is unchanged: a send with a drawing still works end to end locally.

## After it is built

The architect adds `landmarks` to the manifest's description in `docs/architecture/storage.md` and
the landmark list to step 11 of `docs/architecture/flow.md`. Then this ticket is deleted.
