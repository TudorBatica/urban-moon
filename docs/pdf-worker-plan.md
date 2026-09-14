# PDF worker — implementation plan

Status: plan, 2026-09-14, not started. Implements `docs/pdf-pipeline-design.md` §7 (Cloud Scheduler
calls a single-instance worker every minute; work is found through `pending/` markers).

## Already in place

- `apps/input-pdf-worker` builds the PDF from a submission folder on disk (`buildSubmissionPdf`,
  `pdf:demo`, `pdf:build`).
- The web app's commit writes `submissions/<id>/manifest.json`, then the empty object
  `pending/<id>` (again on a repeat commit).
- `npm run bucket:ls` shows each submission as `uploading · committed · pending · done · failed`.

## What gets built

### 1. A shared bucket client — `packages/bucket` (`@urban-moon/bucket`)

Move `apps/input-capture-web/src/lib/server/bucket.ts` into its own workspace package, used by both
apps. Plain fetch against the Cloud Storage JSON API, so it works with Google and the emulator.

- Kept: `startResumableUpload`, `metadata`, `readHead`, `createOnly`, `put`, `metadataServerToken`.
- Added for the worker: `list(prefix)` (paged, with `timeCreated`), `read(object)` → bytes,
  `delete(object)` (404 is fine), `exists(object)`.
- A `bucketFromEnv(env)` helper both apps share: `GCS_BUCKET`, `STORAGE_EMULATOR_HOST`,
  `GCS_ACCESS_TOKEN`, else the Cloud Run metadata server token.
- The web app's `$lib/server/config.ts` becomes a thin wrapper around it; its tests move along.

### 2. Reading a submission from the bucket — `src/storage/bucket.ts`

`bucketSubmission(bucket, id)` implements the existing `SubmissionSource` (`manifest()`,
`read(object)`) over `submissions/<id>/`, next to the disk one. `buildSubmissionPdf` is unchanged.

### 3. One pass through `pending/` — `src/run.ts`

`runOnce({ bucket, deliver, now, budgetMs = 20 min, log })` → `{ processed, failed, skipped, left }`:

```
list pending/, oldest marker first
for each id:
  over the time budget          → stop (left += rest); the next run continues
  output/done.json exists       → delete the marker; log job_skipped_done
  marker older than 15 min      → log submission_waiting (ERROR)
  log job_started
  build: bucketSubmission → buildSubmissionPdf
         write output/raspunsuri.pdf, output/build.json (report: pages, sections, sizes, timings)
  deliver(manifest, pdf)        → output/delivery.json
  write output/done.json { finishedAt, pages, bytes }; delete the marker; log submission_delivered
  on error:
    transient bucket errors (network, 429, 5xx) are retried 3× with backoff inside the step
    otherwise: write failed/<id> { stage: build|deliver, code, message, at }; delete the marker
               log pdf_failed (ERROR) with the BuildError code, or delivery_failed
log run_summary { processed, failed, skipped, left, durationMs } only when pending/ was not empty
```

`BuildError` codes (`manifest_invalid`, `object_unreadable`, …) become the `code` in `failed/<id>`.

### 4. Delivery stub — `src/deliver/`

`deliver()` writes `output/delivery.json` as `{ "hubspot": null }` and logs `delivery_skipped`.
The interface already takes the manifest and the PDF bytes, so HubSpot slots in later without
touching `run.ts`.

### 5. HTTP server — `src/server.ts` (`node:http`, no framework)

- `POST /run` → one `runOnce`, answers `200 { processed, failed, skipped, left }`. While a run is in
  progress, another `/run` gets `429` (the local stand-in for `max-instances=1`).
- `GET /healthz` → `200 { ok: true }`.
- Env: `PORT` (default 3001), the bucket settings above, `WORKER_TICK` (seconds; when set, the
  server calls its own run on that interval — Cloud Scheduler on your machine; unset in the cloud).
- No auth in code: on Cloud Run, IAM (`--no-allow-unauthenticated`) guards it.

### 6. Scripts

| Where | Script | Does |
|---|---|---|
| worker | `dev` | `tsx watch src/server.ts` with `WORKER_TICK=60` and the emulator settings |
| worker | `start` | `node`-runnable server, no tick (what the container runs) |
| worker | `pdf:tick` | `POST http://localhost:3001/run` once and print the answer |
| worker | `pdf:reprocess -- <id> [--force]` | move `failed/<id>` → `pending/<id>` (or just write the marker); `--force` deletes `output/` first |
| root | `worker:dev`, `pdf:tick`, `pdf:reprocess` | aliases |

Existing `pdf:demo` and `pdf:build` (disk) stay.

### 7. Tests (vitest, an in-memory bucket)

- nothing pending → no writes, no `run_summary`
- one pending submission (the `full` fixture copied into the memory bucket) → `raspunsuri.pdf`,
  `build.json`, `delivery.json`, `done.json` written; marker gone
- `done.json` already there → skipped, marker removed, no build
- invalid manifest → `failed/<id>` with `stage: build, code: manifest_invalid`; marker gone
- missing upload → `failed/<id>` with `object_unreadable`
- a transient bucket error on a read → retried, then succeeds
- time budget reached → stops, `left` counted, markers kept
- marker older than 15 min → `submission_waiting` logged
- `/run` while running → 429
- reprocess: `failed/` → `pending/`; `--force` clears `output/`
- `packages/bucket`: request shapes for list/read/delete against a fake fetch

### 8. Checked by hand, locally

1. `npm run deps:up`, `npm run dev`, `npm run worker:dev`.
2. Fill in the questionnaire → `bucket:ls` shows `pending`.
3. Within a minute (or `npm run pdf:tick`) → `done`; `bucket:files -- <id>` lists `output/raspunsuri.pdf`.
4. Break a manifest in the bucket, reprocess it → `failed`; the log shows `pdf_failed`.
5. Kill the worker mid-build → the marker stays; the next tick builds it.

## Not in this step

HubSpot delivery (design §9), `qpdf` for very large client PDFs, the worker's Dockerfile, the
Cloud Scheduler job, service accounts and alert policies (design §15, §11).

## Open questions

1. `packages/bucket` as a shared package (proposed) or a copy of the client inside the worker?
2. Write `pending/` markers for the two submissions already in the local bucket, so the first tick
   builds them?
