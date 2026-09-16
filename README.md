# Urban Moon — input capture

The client questionnaire and everything that turns a submission into one PDF, in one npm workspace.

```
apps/
  input-capture-web/     the SvelteKit questionnaire (Cloud Run)
  input-pdf-worker/      works through pending/: builds each committed submission's PDF into the bucket
packages/
  domain-data/           the shared source of truth: question catalog, answer + manifest schemas,
                         upload limits, fixture submissions
  bucket/                the Cloud Storage client both apps use (Google or the emulator)
docs/
  arhitecture.md         the whole design: components, the flow end to end, what is built and what is not
  design.md              the design language of the questionnaire: tokens, type, components, motion
  deployment.md          shipping a new version of the web app or the worker (the release process)
  deploy-web-gcp.md      the one-time Google Cloud setup for the web app
  deploy-worker-gcp.md   the one-time Google Cloud setup for the PDF worker
infra/                   deploy settings (deploy/web.env, deploy/worker.env), bucket lifecycle/CORS,
                         image cleanup, alert policies
compose.yaml             local dependencies only (the Cloud Storage emulator); the apps run on your machine
scripts/bucket.mjs       look into the local bucket
scripts/deploy-web.sh    build, push and deploy the web app (npm run deploy:web)
scripts/deploy-worker.sh build, push and deploy the PDF worker (npm run deploy:worker)
```

## Commands (from the repo root)

```bash
npm install            # one install, one lockfile, workspace packages linked
npm run deps:up        # the Cloud Storage emulator on :4443, with the um-submissions bucket
npm run dev            # the questionnaire on http://localhost:5173
npm run check          # type-check every package
npm test               # every package's tests
npm run build          # build what has a build (the web app)
npm run pdf:demo       # build PDFs from the fixture submissions → apps/input-pdf-worker/out/demo/
npm run worker:dev     # the PDF worker on :3001, working through pending/ every minute
npm run pdf:tick       # make the running worker do one run now
npm run pdf:reprocess -- <id> [--force]   # put a submission back in pending/
npm run bucket:ls      # submissions in the local bucket: uploading, committed, pending, done, failed
npm run bucket:files -- <id>  # every object of one submission, with size, type and date
npm run bucket:pull -- <id>   # download one into out/bucket/<id>/
npm run deps:down      # stop the emulator (uploads are kept) · deps:reset also deletes them
```

Per package: `npm run <script> -w @urban-moon/<package>` (e.g. `-w @urban-moon/input-pdf-worker`).

## A submission, end to end on your machine

```bash
npm run deps:up
cp apps/input-capture-web/.env.example apps/input-capture-web/.env   # once; points the app at the emulator
cp apps/input-pdf-worker/.env.example apps/input-pdf-worker/.env     # once; the same for the worker
npm run dev
npm run worker:dev     # in a second terminal
```

1. Fill in the questionnaire on <http://localhost:5173>, add plans and photos, press **Trimite
   răspunsurile**. Each file goes from the browser straight to the emulator; then the app checks
   them, writes `manifest.json` and the `pending/<id>` marker.
2. `npm run bucket:ls` shows the submission as `pending`; within a minute (or after
   `npm run pdf:tick`) as `done`.
3. `npm run bucket:files -- <id>` lists `output/raspunsuri.pdf`; `npm run bucket:pull -- <id>`
   downloads it into `out/bucket/<id>/`.

## Keeping the web app and the worker in sync

Everything both sides must agree on lives only in `@urban-moon/domain-data`:

1. **One copy.** The question catalog, the answer schema (derived from the catalog), the manifest
   schema, limits and fixtures. The apps import its TypeScript source directly; there is no build
   step and no published version to drift.
2. **Compile time.** `npm run check` type-checks all packages: renaming a question, removing an
   option or changing an answer shape breaks whichever app still uses the old one.
3. **Runtime, at both ends.** The web app validates the manifest before committing it; the worker
   validates it again when reading, and refuses a schema version it does not know
   (`manifest_unsupported`).
4. **Shared fixtures are the contract.** `packages/domain-data/fixtures/submissions/{minimal,full}`
   are validated by domain-data's tests and rendered by the worker's tests. `full` must answer
   every question the catalog can ask — a new question without a fixture answer fails the tests.
5. **Deploy order and versions.** The web app and the worker deploy separately and old manifests
   stay in the bucket, so: additive changes (new question or option) keep `schemaVersion`;
   breaking changes bump it, the worker supports both until old manifests expire, and the worker
   deploys first. See `packages/domain-data/README.md`.
6. **CI** should run `npm run check && npm test` from the root on every push, whatever changed.
