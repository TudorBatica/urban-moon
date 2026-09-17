# Deploying

How to ship a new version of the web app (`apps/input-capture-web`) and the PDF worker
(`apps/input-pdf-worker`) to Cloud Run. There is no CI pipeline: this page is the release process,
and `scripts/deploy-web.sh` and `scripts/deploy-worker.sh` are the pipeline. What they deploy onto:
`infrastructure.md`. When something goes wrong after a deploy: `runbook.md`.

## At a glance

```bash
git switch main && git pull
npm ci
npm run deploy:web        # the questionnaire
npm run deploy:worker     # the PDF worker
```

Each deploy runs the type check and tests, builds a Docker image tagged with the git version, pushes
it to Artifact Registry and creates a new Cloud Run revision with every setting from its file in
`infra/deploy/`. The script then checks the new revision's health endpoint, and the revision takes
all traffic. It takes a few minutes, mostly the image build.

## Before you deploy

- **On the commit you mean to ship.** The scripts refuse uncommitted changes. The image tag is
  `git describe --always --dirty` (e.g. `daf8ee8`). The web app records it in every submission's
  `manifest.json` as `appVersion`; the worker records it in `build.json`, `done.json` and
  `failed/<id>`; each Cloud Run revision carries it as `APP_VERSION`. So any submission, PDF or
  revision maps back to a commit.
- **`npm ci`**, so the checks run against the lockfile.
- **On this machine:** Docker running and `gcloud` logged in (`gcloud auth login`). On a machine
  that has never deployed, let Docker push to the registry once:
  `gcloud auth configure-docker europe-west1-docker.pkg.dev`.
- **Which one, and in what order.** A change under `apps/input-capture-web` deploys the web app; under
  `apps/input-pdf-worker` the worker; under `packages/` usually both. When the manifest changes
  (`packages/domain-data`), **deploy the worker first**: it must read what the new web app writes
  (`../architecture/overview.md`, *How the two apps stay in agreement*).

---

## The web app

### `npm run deploy:web`

| Option | Use |
|---|---|
| *(none)* | Deploy; the new revision takes all traffic. |
| `-- --candidate` | Deploy without traffic, on its own URL (below). |
| `-- --dry-run` | Print the build, push and deploy commands with the current settings; change nothing. |
| `-- --skip-checks` | Skip `npm run check` / `npm test` (e.g. you just ran them). |
| `-- --allow-dirty` | Deploy uncommitted changes. The version ends in `-dirty` and maps to no commit; avoid. |
| `DEPLOY_ENV=… npm run deploy:web` | Use another settings file (e.g. a staging project). |

What it does, in order:

1. **Preflight.** Checks that gcloud and Docker are ready and the tree is clean. Reads the running
   service: its URL, and which revision is serving (for rollback).
2. **Check and test.** Runs `npm run check` and `npm test` for the whole workspace.
3. **Build** `europe-west1-docker.pkg.dev/<project>/urban-moon/input-capture-web:<version>` for
   `linux/amd64`.
4. **Push** it.
5. **Deploy** a revision with the image, the service account, the sizing and the env vars from the
   settings file (`GCS_BUCKET`, `APP_VERSION`, `BODY_SIZE_LIMIT`, `PUBLIC_CALENDLY_URL`, `ORIGIN`).
   Env vars are set as a whole, so the service always matches the file.
6. **Smoke test.** Calls `/api/health` for up to 30 s. If that fails, the script prints the logs
   and rollback commands and exits with an error. The new revision is already serving at that
   point, so roll back (below).
7. **Summary.** Prints the version, the new revision, the URL and the revision it replaced.

### Settings: `infra/deploy/web.env`

| Key | Meaning |
|---|---|
| `PROJECT_ID`, `REGION`, `SERVICE`, `REPO` | Where it goes. |
| `BUCKET`, `SERVICE_ACCOUNT` | The submissions bucket and the identity the app runs as. |
| `WEB_ORIGIN` | The site's public address. Empty means the service's `run.app` URL. |
| `PUBLIC_CALENDLY_URL` | The booking step's Calendly link. Empty means no booking step. |
| `BODY_SIZE_LIMIT` | Largest request the server accepts. |
| `CPU`, `MEMORY`, `CONCURRENCY`, `TIMEOUT` | Per-instance sizing. |
| `MIN_INSTANCES`, `MAX_INSTANCES` | Scaling. `MAX_INSTANCES` is the cost ceiling; `MIN_INSTANCES` above 0 is billed around the clock. |

To change a setting: edit the file, commit, deploy. Don't change settings in the console: the
next deploy puts the file's values back.

### Trying a version before it takes traffic

```bash
npm run deploy:web -- --candidate
```

The revision runs next to the live one at a fixed tag URL: `https://candidate---<service host>`.
The script prints it. When it looks right:

```bash
gcloud run services update-traffic input-capture-web --project=urban-moon-508616 --region=europe-west1 --to-latest
```

Sending files from the candidate URL needs that URL in the bucket's CORS origins (see
*Changing the site's address*); everything else works without it. A later candidate replaces the
tag.

### After a deploy

- **Automatic:** the health check passed.
- **By hand, for changes that touch the flow:** fill in the questionnaire on a phone with a photo
  and a drawn plan and send it. Then:

  ```bash
  gcloud storage ls gs://urban-moon-intake/pending/          # the new submission's marker
  gcloud run services logs read input-capture-web --project=urban-moon-508616 --region=europe-west1 --limit=30
  ```

  The log should show `upload_session_created` per file, then `submission_committed`. Within a
  minute or two the worker turns the marker into `submissions/<id>/output/raspunsuri.pdf`.

### Rolling back

Every deploy keeps the previous revisions, each with its own image and env vars. To send traffic
back to one of them (seconds, no rebuild):

```bash
gcloud run revisions list --service=input-capture-web --project=urban-moon-508616 --region=europe-west1
gcloud run services update-traffic input-capture-web --project=urban-moon-508616 --region=europe-west1 \
  --to-revisions=input-capture-web-00012-xyz=100
```

Then fix the problem and deploy again; the next deploy takes all traffic as usual. A rollback does
not touch the bucket: submissions made on the bad version stay, with their `appVersion`.

### Changing the site's address

When the site gets a new address (a custom domain, or a candidate URL you want to send files from):

1. Set `WEB_ORIGIN` in `infra/deploy/web.env` to the public address, commit, deploy.
2. Allow the browser to upload from every address in use:

   ```bash
   export WEB_ORIGINS='https://example.ro", "https://candidate---input-capture-web-xxxxx.europe-west1.run.app'
   envsubst < infra/gcs/cors.template.json > /tmp/cors.json
   gcloud storage buckets update gs://urban-moon-intake --cors-file=/tmp/cors.json
   ```

---

## The PDF worker

### `npm run deploy:worker`

| Option | Use |
|---|---|
| *(none)* | Deploy; the new revision takes all traffic, i.e. the next Scheduler call. |
| `-- --dry-run` | Print the build, push and deploy commands with the current settings; change nothing. |
| `-- --skip-checks` | Skip `npm run check` / `npm test`. |
| `-- --allow-dirty` | Deploy uncommitted changes; the version ends in `-dirty`. Avoid. |
| `DEPLOY_ENV=… npm run deploy:worker` | Use another settings file. |

There is no `--candidate`. A candidate revision would have its own instance, so calling its `/run`
could build the same submissions as the live revision at the same moment.

What it does, in order:

1. **Preflight**, **check and test**, as for the web app.
2. **Build** `…/urban-moon/input-pdf-worker:<version>` from `apps/input-pdf-worker/Dockerfile`, and
   **push** it.
3. **Deploy** a revision: private (`--no-allow-unauthenticated`), one instance, one request at a
   time, the sizing and the env vars from the settings file (`GCS_BUCKET`, `APP_VERSION`,
   `PDF_CONCURRENCY`, `RUN_BUDGET_SECONDS`, `NODE_OPTIONS`, and the HubSpot settings), and the
   `hubspot-token` secret mounted as `HUBSPOT_TOKEN`.
4. **Smoke test.** Calls `/health` with your identity token for up to 30 s; on failure, prints the
   logs and rollback commands and exits with an error.
5. **Scheduler job.** Reports whether `pdf-run` exists, is enabled and calls this service's `/run`.
   A paused or missing job means nothing gets processed, so read this line.
6. **Summary.** Version, new revision, URL, the revision it replaced.

**Pause processing around a deploy.** While a run is in progress, the old revision finishes its
request (up to `TIMEOUT`) and the next call goes to the new one, so two runs can overlap. A
submission built by both is delivered to HubSpot twice. Pause the Scheduler job first:

```bash
gcloud scheduler jobs pause pdf-run --project=urban-moon-508616 --location=europe-west1
# wait for the current run to end: the last run_summary in the logs, or no request in progress
npm run deploy:worker
gcloud scheduler jobs resume pdf-run --project=urban-moon-508616 --location=europe-west1
```

### Settings: `infra/deploy/worker.env`

| Key | Meaning |
|---|---|
| `PROJECT_ID`, `REGION`, `SERVICE`, `REPO` | Where it goes. |
| `BUCKET`, `SERVICE_ACCOUNT` | The submissions bucket and the identity the worker runs as. |
| `SCHEDULER_JOB` | The job the script checks after deploying. |
| `PDF_CONCURRENCY` | Submissions built at the same time in one run. Each holds its files and its PDF in memory: lower it (or raise `MEMORY`) if the container runs out of memory. |
| `RUN_BUDGET_SECONDS` | A run starts no new submission after this long; the next run continues. Must stay below `TIMEOUT` (the script checks). |
| `CPU`, `MEMORY` | Per-instance sizing, billed only while a run is in progress. |
| `NODE_HEAP_MB` | Node's heap limit, kept below `MEMORY`. |
| `TIMEOUT` | Longest a `/run` request may take, in seconds. At most 1800 (the Scheduler job's deadline). |
| `HUBSPOT_SECRET` | The Secret Manager secret holding the private app token, mounted as `HUBSPOT_TOKEN`. Empty: the worker builds PDFs and delivers nothing. |
| `HUBSPOT_PORTAL_ID`, `HUBSPOT_FORM_ID` | The account and the form the client's PDF is submitted to. Not secret. |
| `HUBSPOT_FOLDER_PATH` | File Manager folder for the uploaded PDFs. |

Not settings, fixed in the script: private, `--concurrency=1`, `--min-instances=0`,
`--max-instances=1`. The design relies on them to never run twice at once.

### After a deploy

- **Automatic:** `/health` answered, and the Scheduler line says `enabled, calls …/run`.
- **A run now, instead of waiting for the minute:**

  ```bash
  gcloud scheduler jobs run pdf-run --project=urban-moon-508616 --location=europe-west1
  gcloud run services logs read input-pdf-worker --project=urban-moon-508616 --region=europe-west1 --limit=20
  ```

  With nothing pending, the request log shows `POST /run 200` and the worker logs nothing else.
- **For changes to the PDF or delivery:** send a questionnaire (or re-run a finished submission
  with `--force`, `runbook.md`) and open the result:

  ```bash
  gcloud storage cp gs://urban-moon-intake/submissions/<id>/output/raspunsuri.pdf .
  ```

### Rolling back

As for the web app:

```bash
gcloud run revisions list --service=input-pdf-worker --project=urban-moon-508616 --region=europe-west1
gcloud run services update-traffic input-pdf-worker --project=urban-moon-508616 --region=europe-west1 \
  --to-revisions=input-pdf-worker-00004-abc=100
```

Submissions that failed on the bad version stay in `failed/`; after the rollback or the fix,
re-run them (`runbook.md`).
