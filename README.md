# Urban Moon — input capture

The client questionnaire and everything that turns a submission into one PDF, in one npm workspace.

```
apps/
  input-capture-web/     the SvelteKit questionnaire (Cloud Run)
  input-pdf-worker/      works through pending/: builds each committed submission's PDF and delivers it to HubSpot
packages/
  domain-data/           the shared source of truth: question catalog, answer + manifest schemas,
                         upload limits, fixture submissions
  bucket/                the Cloud Storage client both apps use (Google or the emulator)
docs/
  README.md              the map: where things are, which doc to read when
  architecture/          how the built system works: overview, flow, storage, security; adr/ for decisions
  backlog/               one file per piece of work not built yet
  code/                  coding standards
  operations/            infrastructure inventory, deploying, the runbook, observability
  ux/                    the design language of the questionnaire
infra/                   deploy settings (deploy/web.env, deploy/worker.env), bucket CORS, image cleanup,
                         alert policy templates (not applied yet)
CLAUDE.md                what every agent loads: the system in brief, the rules for all agents
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

How the web app and the worker stay in agreement on the manifest: `docs/architecture/overview.md`.
