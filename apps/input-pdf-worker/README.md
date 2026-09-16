# @urban-moon/input-pdf-worker

Works through `pending/` in the bucket: for each committed submission it builds one PDF from
`manifest.json` and the uploaded files, stores it next to the submission and marks the submission
done (or failed, with the reason). HubSpot delivery is not built yet: delivery records that nothing
was sent.

What a run does, and where it sits in the whole system: `../../docs/arhitecture.md`. Deploying:
`../../docs/deployment.md`.

## Run it

```bash
npm run deps:up                                                    # from the repo root: the bucket emulator
cp apps/input-pdf-worker/.env.example apps/input-pdf-worker/.env   # once
npm run dev                                                        # the questionnaire, to send a submission
npm run worker:dev                                                 # the worker on :3001, running every minute
```

Send a submission from the questionnaire. Within a minute (or at once with `npm run pdf:tick`)
`npm run bucket:ls` shows it as `done`, and `npm run bucket:files -- <id>` lists
`output/raspunsuri.pdf`.

| Command (from the repo root) | Does |
|---|---|
| `npm run worker:dev` | the server with `WORKER_TICK=60`: a run at start, then every minute; restarts on code changes |
| `npm run pdf:tick` | `POST /run` once and print the answer (`WORKER_URL`, default `http://localhost:3001`) |
| `npm run pdf:reprocess -- <id>` | put a submission back in `pending/`, removing `failed/<id>` |
| `npm run pdf:reprocess -- <id> --force` | the same, after deleting its `output/`: a full rebuild |
| `npm run pdf:demo` | build PDFs from the fixture submissions on disk → `out/demo/`, no services |
| `npm run pdf:build -w @urban-moon/input-pdf-worker -- --dir <folder>` | build one submission folder on disk |

`pdf:demo` and `pdf:build` run the generator directly against a folder laid out like the bucket
(`manifest.json` + `uploads/`), which is the fast loop for layout work.

## Settings (environment; `.env` locally)

| Variable | Default | |
|---|---|---|
| `GCS_BUCKET` | — | required |
| `STORAGE_EMULATOR_HOST` | — | the local emulator; unset in production |
| `GCS_ACCESS_TOKEN` | — | a real bucket from a laptop (`gcloud auth print-access-token`); otherwise the service account's token |
| `PORT` | 3001 | Cloud Run sets 8080 |
| `PDF_CONCURRENCY` | 2 | submissions built at the same time |
| `RUN_BUDGET_SECONDS` | 1200 | a run starts no submission after this long |
| `WORKER_TICK` | — | seconds between self-triggered runs; local only |
| `APP_VERSION` | dev | recorded in `build.json`, `done.json`, `failed/<id>` |

Each submission being built holds its files and the finished PDF in memory (pdf-lib), so peak use
grows with `PDF_CONCURRENCY` × the largest submissions. Typical submissions take well under a
second and a few tens of MB.

## Implementation notes

- **The generator is pure**: `buildSubmissionPdf(source)` takes a `SubmissionSource` (`manifest()`,
  `read(object)`) and returns bytes plus a report. The bucket and the disk are two adapters, which
  is why a fixture folder renders exactly like a real submission.
- **Fonts** (Figtree, Newsreader) are embedded and subset per document: the standard PDF fonts
  cannot encode ă, ș, ț.
- **Client documents are never re-rendered**: a client PDF's pages are copied unchanged and stamped
  along their visual bottom edge, respecting rotation and page size.
- **`tsx` runs the TypeScript directly**, in development and in the container; there is no build
  step and no bundler.
- **The tests use an in-memory bucket** (`@urban-moon/bucket/memory`) and the shared fixtures, so a
  whole run — markers, outputs, failures, retries, concurrency — is exercised without Docker.

## Failure codes

| Code (in `failed/<id>` and the log) | Meaning | Result |
|---|---|---|
| `manifest_unreadable` | manifest.json missing or not JSON | failed |
| `manifest_unsupported` | unknown `schemaVersion` | failed |
| `manifest_invalid` | does not match the schema (issues in `detail`) | failed |
| `object_unreadable` | a declared file cannot be read | failed |
| `bucket_error` | a bucket call still failing after the retries | failed |
| `unexpected` | anything else (a generator bug, a delivery exception) | failed |
| `client_pdf_unreadable` (warning) | a client PDF is corrupt, encrypted or empty | done: separator page with the reason, original attached |
| `client_image_unreadable` (warning) | an image cannot be decoded | done, with a note in its place |

After fixing the cause: `npm run pdf:reprocess -- <id>`.

## Code

```
src/main.ts               the process: config, server, local tick, SIGTERM
src/server.ts             POST /run (429 while running), GET /health
src/run.ts                runOnce: one pass through pending/
src/deliver/              delivery; a stub until HubSpot
src/reprocess.ts          back to pending/ (the pdf:reprocess script)
src/retry.ts              retries on transient bucket errors
src/objects.ts            object names: pending/, failed/, output/
src/config.ts             settings from the environment
src/storage/              SubmissionSource: bucket and disk adapters
src/build/index.ts        buildSubmissionPdf(source) → { bytes, manifest, report }
src/build/answers.ts      catalog + answers → questions and answer lines
src/build/sections/       cover · contents · answers · drawing · plans · photos
src/build/images.ts       JPEG/PNG embedding, EXIF orientation, contained drawing
src/build/stamp.ts        the client-document strip along the visual bottom edge
src/build/layout.ts       text wrapping and a flowing page writer
src/build/theme.ts        page size, margins, type scale, colours
src/build/fonts.ts        font loading and subsetting
src/log.ts                one JSON log line per event
src/cli.ts                pdf:build
scripts/                  pdf-demo · pdf-tick · pdf-reprocess
fonts/                    Figtree, Newsreader (OFL)
Dockerfile                the image, built from the repo root with its own Dockerfile.dockerignore
```

The bucket client is `../../packages/bucket`, shared with the web app.
