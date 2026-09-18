# Testing

How the system is tested beyond unit tests: the end-to-end suite in `e2e/`, what it runs against,
how journeys are written and tracked, which tier runs when. Owned by the qa agent. Unit tests
follow `standards.md`; what a submission goes through, which every journey is checked against, is
`../architecture/flow.md`.

---

## Two kinds of tests

| | Unit tests | End-to-end journeys |
|---|---|---|
| Where | next to the code, `*.test.ts` | `e2e/journeys/*.spec.ts` |
| Runner | vitest | Playwright Test, Chromium |
| Services | none: fakes, `memoryBucket()`, fixtures | the whole local system, started by the suite |
| Prove | one module does what it says | a client's journey works through the real apps, the bucket and the (fake) HubSpot |
| Run by | `npm test` | `npm run e2e` (smoke tier), `npm run e2e:full` |
| Owner | the dev, with the code | the qa agent |

A journey is written when a unit test cannot prove the thing: the browser really sends bytes to
the bucket, the worker really finds the marker, the PDF really reaches the form. Everything else
stays a unit test; the e2e suite is small on purpose.

## The system under test

`npm run e2e` starts, on its own ports and its own bucket, everything a submission goes through:

| Part | How the suite runs it | Address |
|---|---|---|
| Cloud Storage emulator | `docker compose up -d` if it is not already answering; never stopped by the suite | `localhost:4443`, bucket **`um-e2e`** |
| Web app | the production build (`npm run build`, then `node build`), as the container runs it | `http://localhost:5180` |
| PDF worker | `tsx src/main.ts`, no tick: journeys trigger `POST /run` themselves | `http://localhost:5181` |
| HubSpot fake | `e2e/hubspot-fake/`, standing in for the Files API and the form | `http://localhost:5182` |

The web app and the worker get every setting from `e2e/playwright.config.ts` (`GCS_BUCKET=um-e2e`,
`STORAGE_EMULATOR_HOST`, `HUBSPOT_TOKEN=e2e-token`, `HUBSPOT_API_URL=http://localhost:5182`,
`PUBLIC_CALENDLY_URL` empty). No `.env` is read, so a developer's `.env` can never leak in, and a
real HubSpot token cannot either. The bucket `um-e2e` is created if missing and **emptied at the
start of every run**, not at the end: after a failure, `GCS_BUCKET=um-e2e npm run bucket:ls` and
`bucket:files` show what the journey left. Running servers are reused (`reuseExistingServer`), so
`--ui` and repeated runs do not restart the stack; `E2E_SKIP_BUILD=1` reuses the last web build
while writing journeys.

The developer's own emulator bucket (`um-submissions`), `.env` files and `npm run dev` are not
touched.

## The HubSpot fake

`e2e/hubspot-fake/` is a small `node:http` server that speaks exactly what
`apps/input-pdf-worker/src/deliver/hubspot.ts` calls, and nothing more:

- `POST /files/v3/files`: checks the bearer token and the upload options (`PUBLIC_NOT_INDEXABLE`,
  a folder path), keeps the bytes, answers `{id, name, url}` with a URL on the fake itself.
- `GET /f/<fileId>`: the bytes, unauthenticated, with `content-length`: the read-back step.
- `POST /submissions/v3/integration/secure/submit/<portal>/<form>`: checks the token and the
  fields, records the submission.

Two inspection endpoints make it a test double: `GET /__e2e/records/<submissionId>` returns what
the fake received for one submission (upload, reads, form submission), and `POST /__e2e/rules`
makes one step fail for one submission (`{submissionId, step, status, times}`), so failure paths
run in parallel with everything else. A submission is recognised by its file name
(`intake-<submissionId>.pdf`), then by the file's URL. `DELETE /__e2e/records` clears everything;
the suite calls it at the start of a run.

The fake has unit tests (`e2e/hubspot-fake/*.test.ts`, run by `npm test`). When `hubspot.ts`
changes what it sends, the fake changes with it, in the same ticket.

## Writing a journey

- **One file per journey area** in `e2e/journeys/`: `questionnaire.spec.ts`, `send.spec.ts`,
  `delivery.spec.ts`, ... Journeys are `*.spec.ts`; unit tests anywhere are `*.test.ts`; neither
  runner picks up the other's files.
- **Titles are sentences**: what the client or the system does, and what is true afterwards.
  `npx playwright test --list -c e2e` prints the catalog of every test case; the titles must read
  as one.
- **Tags** select tiers and widths: `@smoke` for the pre-deploy set, `@phone` for a test that also
  runs at phone width. Nothing else is encoded in a tag.
- **Assert the outside**: what the client sees on screen, the objects in the bucket, the fake's
  records, the worker's answer to `/run`. Never the app's internals: no `localStorage` reads, no
  Svelte state. The submission id comes from the commit response (`waitForResponse` on
  `/api/submissions/<id>/commit`), never from session storage.
- **Selectors**: `getByTestId` first; the app's `data-testid`s are kebab-case, stable, and part of
  its contract with the suite: a dev changes one only when the ticket says so. Where there is no
  test id, `getByRole` with its accessible name (options are radios and checkboxes with their
  label). Never CSS classes, never the Romanian copy as a selector; when a screen needs a test id,
  the qa asks the dev for it in its summary.
- **Wait on state, never on time**: `expect.poll` on the bucket, `waitForResponse` on the
  commit, the worker helper that polls for `output/done.json` or `failed/<id>`. No `waitForTimeout`.
- **Every test stands alone**: a fresh browser context (the default), its own client email
  (`<test>-<random>@e2e.invalid`, a reserved domain that can never become a real contact), its own
  submission. Tests share nothing in the bucket or the fake; the suite runs them in parallel.
- **No retries, no skips, no `fixme`**: `retries` is 0. A test that does not pass every time is a
  finding (against the code or against the test), fixed or deleted, never retried into green.
- **Seeded state is allowed to get somewhere fast**, never to assert: a journey about sending may
  seed `um.answers` from a domain-data fixture through `addInitScript` and go straight to
  `/planuri`; a journey about the questionnaire clicks through it.
- **Helpers live in `e2e/lib/`** and speak the system's language: `answerScreen`, `uploadPlan`,
  `send`, `runWorker`, `waitForSubmission`, `hubspot.records`, `hubspot.rule`. A journey reads as
  the flow doc's steps.
- Code under `e2e/` follows `standards.md` (strict TypeScript, no doc references, comments say why)
  and is reviewed like any other code.

## Test data

- **Files**: `packages/domain-data/fixtures/submissions/*/uploads/` first (a small plan PDF, phone
  photos with EXIF rotation, a PNG). A file only a journey needs (a `.txt` for the type
  rejection, a corrupt PDF) lives in `e2e/fixtures/files/`, small. Files that must be big (an
  image over 10 MB) are generated at the start of the run into `e2e/.tmp/` (ignored), never
  committed.
- **Answers**: seeded from the `answers` of a domain-data fixture manifest, so a seed can never
  drift from the catalog (domain-data's tests keep the fixtures valid). The client's email is
  replaced per test.
- **A drawn plan**: `e2e/fixtures/state/drawing.json`, one `um.plans` `drawing` entry captured
  from the editor; recaptured when the drawing model changes. The editor itself is driven for
  real in the drawing journey.

## Tracking test cases

The test cases are the spec files: the catalog is `npx playwright test --list -c e2e`, and the
history of a case is its git history. What is kept by hand is the **journey map** below: which
step of `../architecture/flow.md` is covered by which spec file, in which tier. The qa updates it
in the same change as the journey; the reviewer sends back a new journey that is not on the map.

| Flow step (`flow.md`) | Spec file | Tier |
|---|---|---|
| 1–2 The questionnaire, rooms decide the chapters | `questionnaire.spec.ts` | smoke (first chapter at both widths, resume, summary edit link), full (unpicking a room, `/cuprins`) |
| 3 The plans step, limits and rejections | `plans.spec.ts` | full |
| 4 Drawing a plan | `drawing.spec.ts` | full |
| 5–8 Summary, consent, send, thanks | `send.spec.ts` | smoke (one room, both widths), full (three rooms, start over) |
| 6 Uploads survive a dropped chunk | `send-resilience.spec.ts` | full |
| 7 The commit refuses a missing file, repeats are idempotent | `send-resilience.spec.ts` | full |
| 9–11 The worker builds the PDF | `send.spec.ts` (built, page count), `worker.spec.ts` (degraded PDF) | smoke / full |
| 12 Delivery to HubSpot | `send.spec.ts` (file, read-back, form) | smoke |
| 13 Failures: HubSpot down, unreadable file, re-run | `delivery.spec.ts` | smoke (form down, `pdf:reprocess`), full (upload 4xx/5xx, unreadable file) |

Not covered by journeys, on purpose: Calendly (external, `PUBLIC_CALENDLY_URL` stays empty), the
Scheduler and Cloud Run themselves (`../operations/deployment.md`, the checks after a deploy), and
the emulator's known differences from Google (proven in unit tests against a fake fetch:
`packages/bucket/README.md`).

## Tiers and when they run

| Tier | Command | Contains | Budget |
|---|---|---|---|
| **smoke** | `npm run e2e` | the `@smoke` tests: one send end to end with delivery, the first chapter of the questionnaire, one delivery failure and its re-run; those also tagged `@phone` run at phone width too | 2 minutes after the web build |
| **full** | `npm run e2e:full` | everything at desktop width, and every `@phone` test again at phone width | 10 minutes |

- **Before every deploy**: `scripts/deploy-web.sh` and `scripts/deploy-worker.sh` run the smoke
  tier after `npm run check` and `npm test`; `--full-e2e` runs the full tier instead. A change to
  the send protocol, the worker's run or delivery, or `packages/domain-data` deploys after the
  full tier (`../operations/deployment.md`).
- **After a build passes review**: the qa runs the journeys the ticket names, then the smoke tier.
- **While writing a journey**: `npm run e2e -- --ui`, or `npx playwright test -c e2e
  journeys/send.spec.ts --headed`. `npm run e2e:report` opens the last HTML report.
- **CI**, when it exists: smoke on every push, full nightly (`../backlog/ci.md`).

The budgets are enforced by keeping the tiers small, not by cutting timeouts: a new `@smoke` test
replaces or extends one, it does not just add. Playwright runs with 4 workers; the worker builds
2 PDFs at a time; a whole one-room send takes a few seconds.

## When a journey fails

In this order:

1. **The trace** (`retain-on-failure`): `npm run e2e:report`, open the failed test, read what the
   page showed and which request failed.
2. **The bucket**: `GCS_BUCKET=um-e2e npm run bucket:ls`, then `bucket:files -- <id>`; a
   `failed/<id>` says the stage and code (`apps/input-pdf-worker/README.md`).
3. **The fake**: `curl localhost:5182/__e2e/records/<id>` while the servers are still up.
4. **The servers' output**: the worker and the fake log one JSON line per event to the Playwright
   output.

Then decide which it is: a bug in the code (a finding for the dev, with the evidence), a wrong
journey (fix it), or the harness (fix it). A journey is never made to pass by loosening what it
asserts.
