# Deploying the web app

How to ship a new version of `apps/input-capture-web` to Cloud Run. There is no CI pipeline: this
page is the release process, and `scripts/deploy-web.sh` is the pipeline. The one-time Google Cloud
setup is in `docs/deploy-web-gcp.md`.

## At a glance

```bash
git switch main && git pull
npm ci
npm run deploy:web
```

A deploy runs the type check and tests, builds a Docker image tagged with the git version, pushes
it to Artifact Registry and creates a new Cloud Run revision. The revision gets every setting from
`infra/deploy/web.env`. The script then checks `/api/health` and the new revision takes all traffic.
It takes a few minutes, mostly the image build.

## Before you deploy

- **On the commit you mean to ship.** The script refuses uncommitted changes. The image tag is
  `git describe --always --dirty` (e.g. `daf8ee8`), every submission's `manifest.json` records it
  as `appVersion`, and the Cloud Run revision carries it as `APP_VERSION`. So any submission or
  revision maps back to a commit.
- **`npm ci`**, so the checks run against the lockfile.
- **On this machine:** Docker running and `gcloud` logged in (`gcloud auth login`). On a machine
  that has never deployed, let Docker push to the registry once:
  `gcloud auth configure-docker europe-west1-docker.pkg.dev`.

## `npm run deploy:web`

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

## Settings — `infra/deploy/web.env`

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

## Trying a version before it takes traffic

```bash
npm run deploy:web -- --candidate
```

The revision runs next to the live one at a fixed tag URL: `https://candidate---<service host>`.
The script prints it. When it looks right:

```bash
gcloud run services update-traffic input-capture-web --project=urban-moon-prod --region=europe-west1 --to-latest
```

Sending files from the candidate URL needs that URL in the bucket's CORS origins (see
*Changing the site's address*); everything else works without it. A later candidate replaces the
tag.

## After a deploy

- **Automatic:** the health check passed.
- **By hand, for changes that touch the flow:** fill in the questionnaire on a phone with a photo
  and a drawn plan and send it. Then:

  ```bash
  gcloud storage ls gs://um-submissions-urban-moon-prod/pending/          # the new submission's marker
  gcloud run services logs read input-capture-web --project=urban-moon-prod --region=europe-west1 --limit=30
  ```

  The log should show `upload_session_created` per file, then `submission_committed`.
- **Alerts:** "web: submission errors" and "web: site down" email the alert address if something
  breaks later.

## Rolling back

Every deploy keeps the previous revisions, each with its own image and env vars. To send traffic
back to one of them (seconds, no rebuild):

```bash
gcloud run revisions list --service=input-capture-web --project=urban-moon-prod --region=europe-west1
gcloud run services update-traffic input-capture-web --project=urban-moon-prod --region=europe-west1 \
  --to-revisions=input-capture-web-00012-xyz=100
```

Then fix the problem and deploy again; the next deploy takes all traffic as usual. A rollback does
not touch the bucket: submissions made on the bad version stay, with their `appVersion`.

## Changing the site's address

When the site gets a new address (a custom domain, or a candidate URL you want to send files from):

1. Set `WEB_ORIGIN` in `infra/deploy/web.env` to the public address, commit, deploy.
2. Allow the browser to upload from every address in use:

   ```bash
   export WEB_ORIGINS='https://example.ro", "https://candidate---input-capture-web-xxxxx.europe-west1.run.app'
   envsubst < infra/gcs/cors.template.json > /tmp/cors.json
   gcloud storage buckets update gs://um-submissions-urban-moon-prod --cors-file=/tmp/cors.json
   ```

## When something goes wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| `uncommitted changes` | the tree is not clean | commit, or `--allow-dirty` for a throwaway test |
| Push: `denied` / `unauthorized` | Docker cannot push to the registry from this machine | `gcloud auth configure-docker europe-west1-docker.pkg.dev` |
| Deploy: `PERMISSION_DENIED` | the logged-in account lacks rights on the project | `gcloud auth list`; log in with the project's owner/deployer |
| Smoke test fails | the new revision does not start (`exec format error`, a crash on boot) | read the logs the script prints; roll back; fix |
| Browser: sending fails, the console shows a CORS error | the page's address is not in the bucket's CORS origins | *Changing the site's address*, step 2 |
| Log: `storage_not_configured` | `GCS_BUCKET` missing | check `infra/deploy/web.env`, deploy |
| Log: `upload_start_failed` or `commit_failed` with 403 | the service account lost its role on the bucket | `gcloud storage buckets get-iam-policy gs://…`; restore `roles/storage.objectUser` for the service account |
| Log: `commit_rejected` with `missing` | a browser's upload did not finish; the client retries by itself | nothing, unless it keeps happening |

## Where to look

| What | Where |
|---|---|
| Revisions, traffic, requests, errors, instances | Console → Cloud Run → `input-capture-web` |
| Logs for one submission | Console → Logging → Logs Explorer: `jsonPayload.submissionId="…"` |
| Images and their tags | Console → Artifact Registry → `urban-moon` |
| Uploaded files and markers | Console → Cloud Storage → the submissions bucket |
| Spend | Console → Billing → Reports |
