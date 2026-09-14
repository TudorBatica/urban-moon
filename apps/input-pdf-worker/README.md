# @urban-moon/input-pdf-worker

Builds one PDF per committed submission from its `manifest.json` and uploaded files. Today it
reads submission folders on disk; the bucket source, `POST /run` (called every minute by Cloud
Scheduler, working through `pending/`) and HubSpot delivery come next (see
`docs/pdf-pipeline-design.md` §7).

## Try it

```bash
npm run pdf:demo                              # from the repo root: every fixture submission
npm run pdf:demo -w @urban-moon/input-pdf-worker -- --dir path/to/submission [--dir …]
npm run pdf:build -w @urban-moon/input-pdf-worker -- --dir path/to/submission [--out file.pdf]
```

`pdf:demo` writes to `out/demo/<name>.pdf` and prints pages, size, time, sections and any
warnings. `pdf:build` is the worker's own entry point: it writes `<dir>/output/raspunsuri.pdf` and
logs one JSON line (`pdf_generated` or `pdf_failed`).

A submission folder looks like the bucket:

```
<submission>/
  manifest.json          validated with @urban-moon/domain-data/schema
  uploads/<fileId>.pdf|jpg|png
  uploads/drawing.png    when the client drew the plan
```

## What the PDF contains

1. Cover — client, date, rooms, counts, submission id.
2. Contents — sections and every client document with its page numbers.
3. Answers — every question the client could see, grouped by chapter, labels from the catalog.
4. The drawn plan — the image, ceiling height, walls, doors and windows.
5. Uploaded plans — client PDFs get a separator page, then their pages copied unchanged, each
   stamped *"Document încărcat de client · <file> · pagina x din n"* along its visual bottom edge
   (rotation and page size respected); image plans get a page of their own, stamped the same way.
6. Photos — photos of the space, then furniture kept per room; two per row, EXIF rotation applied.

Fonts: Figtree and Newsreader, embedded (the standard PDF fonts cannot encode ă, ș, ț).

## Failures

| Code | Meaning | Build |
|---|---|---|
| `manifest_unreadable` | manifest.json missing or not JSON | fails |
| `manifest_unsupported` | unknown `schemaVersion` | fails |
| `manifest_invalid` | does not match the schema (issues in `detail`) | fails |
| `object_unreadable` | a declared file cannot be read | fails |
| `client_pdf_unreadable` (warning) | a client PDF is corrupt, encrypted or empty | continues: separator page with the reason, original attached to the PDF |
| `client_image_unreadable` (warning) | an image cannot be decoded | continues with a note in its place |

## Code

```
src/build/index.ts        buildSubmissionPdf(source) → { bytes, manifest, report }
src/build/answers.ts      catalog + answers → questions and answer lines
src/build/sections/       cover · contents · answers · drawing · plans (client PDFs, image plans) · photos
src/build/images.ts       JPEG/PNG embedding, EXIF orientation, contained drawing
src/build/stamp.ts        the client-document strip along the visual bottom edge
src/build/layout.ts       text wrapping and a flowing page writer
src/storage/              SubmissionSource interface · disk adapter
src/log.ts                one JSON log line per event (Cloud Logging reads severity/message)
src/cli.ts                pdf:build
scripts/pdf-demo.ts       pdf:demo
fonts/                    Figtree, Newsreader (OFL)
```

Next steps from the design doc (§7): a bucket `SubmissionSource`, `POST /run` working through
`pending/` (→ `output/done.json`, or `failed/`), `pdf:reprocess`, HubSpot delivery, `qpdf` for very
large client PDFs, and a Dockerfile.
