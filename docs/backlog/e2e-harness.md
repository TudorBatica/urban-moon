# The e2e harness: Playwright over the whole local system

## Description

There are no end-to-end tests. Build the harness that every journey will run in, as designed in
`docs/code/testing.md`: a Playwright workspace at `e2e/` that starts the web app, the worker and
the emulator bucket on their own ports and bucket, plus one journey that proves the harness works
end to end. The HubSpot fake is the next ticket (`e2e-hubspot-fake.md`); until it is built the
worker runs without `HUBSPOT_TOKEN`, so delivery is skipped and `delivery.json` is `{"hubspot":
null}`.

Owner: the qa agent, reviewed by the code-reviewer. Nothing in `apps/` or `packages/` changes.

### The workspace

- `e2e/package.json`: `@urban-moon/e2e`, private, with `@playwright/test` (current 1.x),
  `@types/node`, `typescript`, `vitest`; dependencies on `@urban-moon/bucket` and
  `@urban-moon/domain-data` (workspace links) for the helpers; `pdf-lib` to open the built PDF.
  Scripts: `check` (`tsc --noEmit`), `test` (vitest, `**/*.test.ts`, no services; empty until
  the fake), `e2e` (`playwright test --grep @smoke`), `e2e:full` (`playwright test`),
  `e2e:report` (`playwright show-report`).
- Root `package.json`: add `"e2e"` to `workspaces`; scripts `e2e`, `e2e:full`, `e2e:report`
  delegating with `-w @urban-moon/e2e --`, so `npm run e2e -- --ui` and
  `npm run e2e:full -- journeys/send.spec.ts` pass through. `npm run check` and `npm test` pick
  the workspace up on their own (`--workspaces --if-present`).
- Root `.dockerignore`: add `e2e`. The images' `npm ci` ignores a workspace folder that is not in
  the build context, so the Dockerfiles stay as they are.
- `e2e/tsconfig.json` strict, like the packages. `e2e/.tmp/` for generated files and logs,
  ignored by git (`.gitignore` already ignores `test-results`, `playwright-report`, `blob-report`).
- One-time on a machine: `npx playwright install chromium` (`--with-deps` on a fresh Linux).
  Document it in the root `README.md` commands.

### `e2e/playwright.config.ts`

- `testDir: 'journeys'`, `testMatch: '**/*.spec.ts'`, `fullyParallel: true`, `workers: 4`,
  `retries: 0`, `timeout: 60_000`, `expect.timeout: 10_000`, reporter `list` plus `html`
  (`open: 'never'`), `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, no video.
- Projects: `desktop` (Desktop Chrome, 1280×800) running everything; `phone` (`devices['Pixel
  7']`, Chromium) running only tests tagged `@phone` (`grep: /@phone/`).
- `baseURL: http://localhost:5180`.
- `webServer`, three entries, all `reuseExistingServer: true`:
  1. **web**: `npm run build -w @urban-moon/input-capture-web && node apps/input-capture-web/build`
     from the repo root, or only `node apps/input-capture-web/build` when `E2E_SKIP_BUILD` is set;
     `url: http://localhost:5180/api/health`; env `PORT=5180`, `ORIGIN=http://localhost:5180`,
     `GCS_BUCKET=um-e2e`, `STORAGE_EMULATOR_HOST=http://localhost:4443`, `PUBLIC_CALENDLY_URL=`,
     `APP_VERSION=e2e`. `PUBLIC_*` variables are read at build time by SvelteKit, so they are set
     on the build command too.
  2. **worker**: `npx tsx apps/input-pdf-worker/src/main.ts` from the repo root (no `.env`, no
     `WORKER_TICK`); `url: http://localhost:5181/health`; env `PORT=5181`, `GCS_BUCKET=um-e2e`,
     `STORAGE_EMULATOR_HOST`, `APP_VERSION=e2e`, `PDF_CONCURRENCY=2`. The HubSpot variables are
     added by the fake's ticket.
  3. **hubspot fake**: added by the fake's ticket.
  The env is written in the config, never read from a `.env` file: nothing from a developer's
  `.env` may reach the suite.
- `globalSetup`: if `http://localhost:4443/storage/v1/b` does not answer, run `docker compose up
  -d` from the repo root and wait for it (up to 30 s); create the bucket `um-e2e` if it does not
  exist (`POST /storage/v1/b`, 409 is fine: this is the one raw call, emulator administration, not
  object access); empty it through `@urban-moon/bucket` (`list('')`, then `delete`). Generate the
  big files journeys need into `e2e/.tmp/` (an 11 MB PNG for the size rejection; a valid PNG
  header followed by padding is enough for the browser-side check). No `globalTeardown`: the
  emulator keeps running, the bucket keeps the run's objects for inspection.

### `e2e/lib/`

Helpers that read like the flow, each small and typed:

- `env.ts`: the addresses, the bucket name, the fixture paths.
- `bucket.ts`: `bucket()` (a `@urban-moon/bucket` client for `um-e2e`), `objectsOf(id)`,
  `readJson(object)`, `exists(object)`, `emptyBucket()`.
- `state.ts`: `seedAnswers(page, answers, {email})` through `page.addInitScript`, writing
  `um.answers` (and `um.cursor`) before the app loads; `fixtureAnswers('minimal' | 'full')`
  reading a domain-data fixture manifest's `answers`.
- `app.ts`: page helpers: `openScreen(page, id)` (`/?s=<id>`), `pickOption(page, label)`
  (`getByRole('radio' | 'checkbox', {name})`), `next(page)` (`getByTestId('next')`),
  `tickMeasured(page)`, `uploadPlans(page, files)` (`setInputFiles` on `file-input` inside
  `dropzone`), `addPhotos(page, group, files)` (`photos-<group>`), `send(page)`: ticks
  `submit-consent`, clicks `submit-button`, waits for the commit response and returns
  `{submissionId, response}`; `expectThanks(page)`.
- `worker.ts`: `runWorker()`: `POST http://localhost:5181/run`; on 429 (another test's run is in
  progress, and it may already be building ours) wait 250 ms and try again, up to 60 s; returns
  the run summary. `waitForSubmission(id, 'done' | 'failed', timeoutMs = 30_000)`: polls the
  bucket every 250 ms for `submissions/<id>/output/done.json` or `failed/<id>` and returns the
  parsed object; fails with the objects that exist when it times out.
- `pdf.ts`: `openPdf(bytes)` with pdf-lib, `pageCount`.
- `ids.ts`: `testEmail(prefix)` → `<prefix>-<8 hex>@e2e.invalid`.

### The proving journey: `e2e/journeys/send.spec.ts`

One test, tagged `@smoke @phone`, "sends one room with a plan and a photo, and the worker builds
the PDF":

1. Seed the `minimal` fixture's answers with a fresh email; open `/planuri`.
2. Tick the measuring box; upload `plan-bucatarie.pdf` (from the `full` fixture's uploads) as a
   plan; add `photo-spatiu-1.jpg` as a photo of the space; the counter shows one file.
3. Open `/rezumat`: the client's name and the file are listed. Send. The commit answers `ok` with
   the submission id; the thanks page shows.
4. Bucket: `submissions/<id>/manifest.json` exists, has two files and `client.email` equal to
   the test's; `pending/<id>` exists.
5. `runWorker()`, then `waitForSubmission(id, 'done')`. `output/raspunsuri.pdf` opens and has at
   least 5 pages (cover, contents, answers, the plan's separator and page, photos);
   `output/build.json` exists; `output/delivery.json` is `{"hubspot": null}` until the fake
   exists; `pending/<id>` is gone; there is no `failed/<id>`.

It passes on desktop and phone, and passes twice in a row from `npm run e2e` with the stack left
running in between.

### Docs

- The root `README.md`: the `e2e/` line in the tree and the three commands (already written;
  make them true), plus the one-time browser install.
- `e2e/README.md`: how to run it, the ports and the bucket, the settings the config sets, the
  code map, `E2E_SKIP_BUILD`. Conventions stay in `docs/code/testing.md` and are not repeated.

### Out of scope

The HubSpot fake, the other journeys, the deploy scripts and CI: their own tickets.
