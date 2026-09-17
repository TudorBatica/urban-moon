# 0002: All Cloud Storage access goes through `packages/bucket`

Status: accepted, 2026-09-17.

## Context

Both apps depend on the bucket: the web app opens resumable upload sessions, checks objects and
writes the manifest create-only; the worker lists `pending/`, reads uploads and writes outputs and
markers. Locally they run against `fake-gcs-server`, which differs from Google: a status query
finalises an upload, `ifGenerationMatch=0` is ignored, and `Range` is not exposed to the browser.
The worker's logic and the web app's commit are tested without any service.

## Decision

All Cloud Storage access, in every app and script that is part of the system, goes through the
`Bucket` interface of `packages/bucket`: a small client over plain `fetch` against the JSON API.

- No Google Cloud Storage SDK, and no second client.
- Tests use `memoryBucket()` from `@urban-moon/bucket/memory`, which follows the same rules.
- A new need (another operation, another header) is added to `packages/bucket` and its tests.

## Alternatives

- **The Google Cloud Storage SDK in each app.** Rejected: the emulator's differences would be
  handled in two places, the apps' tests would need to fake the SDK, and the request shapes the
  system relies on (resumable sessions for the browser, create-only writes) would sit behind a
  library instead of in code this repo tests.

## Consequences

- The same code path runs against Google and the emulator; the differences are handled once.
- One in-memory implementation serves every test, so whole runs and commits are tested without
  Docker or a network.
- The client only does what the system uses: no streaming (objects are held in memory), and every
  new operation is written and tested here.
