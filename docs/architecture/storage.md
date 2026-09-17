# Architecture: what is stored where

The bucket layout, the manifest, and what the browser keeps. How objects get there: `flow.md`.

---

## The bucket

```
pending/<id>                          empty; written at commit, deleted when the submission is done
failed/<id>                           JSON: stage, code, message, detail, at, version
submissions/<id>/
  uploads/<fileId>.{jpg|png|pdf}      the client's files, named by the server
  uploads/drawing.png                 the drawn plan, when there is one
  manifest.json                       written once at commit
  output/raspunsuri.pdf               the deliverable
  output/build.json                   pages, sections, client documents, warnings, timings, version
  output/delivery.json                what delivery did: the HubSpot file id, url, form and email
  output/done.json                    written last: finished
```

Where a submission stands is read from the objects: `uploads/` only means still uploading or
abandoned; `manifest.json` plus `pending/<id>` means waiting for the worker; `output/done.json`
means finished; `failed/<id>` means the worker gave up. `npm run bucket:ls` prints exactly that.

Nothing is deleted automatically: every submission stays in the bucket.

## `manifest.json`

One self-contained record: `schemaVersion`, `submissionId`, `committedAt`, `appVersion`, `pageUri`,
`locale`, `client` (name, email), `rooms`, the whole `answers` record verbatim, `drawing` (room
snapshot, SVG, the PNG's object name) and `files[]`. Each file carries `fileId`, `kind`
(plan/photo), `group` (space/furniture, photos only), `roomId` (furniture photos only),
`originalName` (sanitised), `contentType` (as sniffed by the server), `size`, `crc32c`, its object
name and `addedAt`. The worker needs nothing else to build the PDF.

The schema: `packages/domain-data/src/schema/manifest.ts`.

## The browser

`um.answers`, `um.cursor`, `um.plans`, `um.photos` in `localStorage`, file blobs in IndexedDB, and
during a send `um.submissionId` and `um.uploads` in `sessionStorage`.
