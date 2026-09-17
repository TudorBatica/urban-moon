# @urban-moon/domain-data

The questionnaire's shared source of truth, used by `input-capture-web` and `input-pdf-worker`.

| Import | What | Runtime deps |
|---|---|---|
| `@urban-moon/domain-data` | question catalog (`S`, `ROOMS`, `CHAPTER_LABEL`, predicates, helpers such as `visibleScreens`, `activeFollowUp`), room ids, limits (`ACCEPTED_CONTENT_TYPES`, `MAX_IMAGE_BYTES`, `sniffContentType`, …), types (`Answers`, `RoomSnapshot`, `Manifest`, …) | none — safe for the browser bundle |
| `@urban-moon/domain-data/schema` | zod schemas: `AnswersSchema` (derived from the catalog), `ManifestSchema`, `parseManifest`, `answerKeys()` | zod — app server and worker |
| `@urban-moon/domain-data/fixtures/*` | fixture submissions laid out like the bucket: `submissions/<name>/manifest.json` + `uploads/` | — |

```
src/catalog/      screens.ts · rooms.ts · predicates.ts — the questions, options, labels, visibility
src/schema/       answers.ts (catalog → schema) · manifest.ts · room.ts · json-schema.ts
src/limits.ts     accepted types, size and count limits, magic-byte sniffing
src/types.ts      shared types; the ones with a schema are inferred from it
fixtures/         submissions/minimal, submissions/full (every question answered, every file kind)
json-schema/      manifest.schema.json — generated, for docs and non-TypeScript consumers
```

## Scripts

```bash
npm run check -w @urban-moon/domain-data    # tsc
npm test -w @urban-moon/domain-data         # schema ↔ catalog coverage, fixtures, manifest rules
npm run schema -w @urban-moon/domain-data   # regenerate json-schema/manifest.schema.json
```

## Adding or changing a question

1. Edit the catalog in `src/catalog/screens.ts`. The answer schema follows on its own.
2. Add an answer for it to `fixtures/submissions/full/manifest.json` (the coverage test lists what
   is missing).
3. `npm run schema -w @urban-moon/domain-data` if the manifest's JSON Schema changed (a test
   compares it with the committed file).
4. `npm run check && npm test` from the root: the web app and the worker must both still pass.

## Versioning the manifest (`schemaVersion`)

Manifests written by an older web app can still be waiting in the bucket, and the two apps deploy
separately.

- **Additive** — a new question, option, optional field: keep `schemaVersion`. Old manifests stay
  valid (new keys are optional); the worker renders what is there.
- **Breaking** — renaming or removing a question id or option value, changing an answer's shape,
  making a field required: bump `MANIFEST_SCHEMA_VERSION`, keep the previous schema importable,
  teach the worker both versions, and deploy the worker first. Submissions are never deleted from
  the bucket, so the worker keeps supporting every version it has seen.
- Answers to questions that no longer exist are stripped by `AnswersSchema` (`StrictAnswersSchema`
  refuses them, for tests).
