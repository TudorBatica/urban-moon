# Urban Moon — input capture

The client questionnaire and everything that turns a submission into one PDF, in one npm workspace.

```
apps/
  input-capture-web/     the SvelteKit questionnaire (deployed to Cloudflare today)
  input-pdf-worker/      builds the submission PDF from a committed manifest and its files
packages/
  domain-data/           the shared source of truth: question catalog, answer + manifest schemas,
                         upload limits, fixture submissions
docs/
  pdf-pipeline-design.md the upload → manifest → PDF → HubSpot design
  deployment.md          shipping a new version of the web app (the release process)
  deploy-web-gcp.md      the one-time Google Cloud setup
  pdf-worker-plan.md     the next step for the worker
infra/                   deploy settings (deploy/web.env), bucket lifecycle/CORS, image cleanup, alert policies
compose.yaml             local dependencies only (the Cloud Storage emulator); the apps run on your machine
scripts/bucket.mjs       look into the local bucket
scripts/deploy-web.sh    build, push and deploy the web app (npm run deploy:web)
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
npm run bucket:ls      # submissions in the local bucket, committed or still uploading
npm run bucket:files -- <id>  # every object of one submission, with size, type and date
npm run bucket:pull -- <id>   # download one into out/bucket/<id>/
npm run deps:down      # stop the emulator (uploads are kept) · deps:reset also deletes them
```

Per package: `npm run <script> -w @urban-moon/<package>` (e.g. `-w @urban-moon/input-pdf-worker`).

## A submission, end to end on your machine

```bash
npm run deps:up
cp apps/input-capture-web/.env.example apps/input-capture-web/.env   # once; points the app at the emulator
npm run dev
```

1. Fill in the questionnaire on <http://localhost:5173>, add plans and photos, press **Trimite
   răspunsurile**. Each file goes from the browser straight to the emulator; then the app checks
   them and writes `manifest.json`.
2. `npm run bucket:ls` shows the submission as `✓ committed`.
3. `npm run bucket:pull -- <id>`, then
   `npm run pdf:build -w @urban-moon/input-pdf-worker -- --dir ../../out/bucket/<id>` builds its PDF.

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
