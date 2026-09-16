# Deploying the PDF worker to Google Cloud

Status: guide, 2026-09-15. The one-time setup for `apps/input-pdf-worker`. Every later deploy:
`docs/deployment.md`. Like the web app's guide (`docs/deploy-web-gcp.md`), everything is done with
the `gcloud` CLI; the console is for looking at things.

Flags below were checked against the installed Google Cloud SDK 584.0.0 (`gcloud … --help`). Prices
are approximate list prices; anything not checked is marked **[verify]**.

**Before this guide:** the web app's guide up to its §5.8 is done: the project, billing, the budget
and its notification channel, the enabled APIs, Artifact Registry and the bucket all exist and are
shared by the worker.

The worker also delivers each PDF to HubSpot (§5.9). Until its token exists in Secret Manager it
builds and stores PDFs and records that nothing was sent (`output/delivery.json`), which is a fine
state to deploy in: add the secret and deploy again when you are ready.

---

## 1. What runs where

```
Cloud Scheduler job "pdf-run"   every minute
   │  POST /run, with an OIDC token for service account pdf-run-invoker
   ▼
Cloud Run service "input-pdf-worker"   private · 1 instance · 1 request at a time
   │  runs as service account pdf-worker-sa
   │  lists pending/, builds each waiting submission's PDF, 2 at a time
   ▼
Cloud Storage bucket (the web app's)
   pending/<id>                      written by the web app; deleted by the worker when done
   submissions/<id>/output/          raspunsuri.pdf · build.json · delivery.json · done.json
   failed/<id>                       when the worker gives up, with the reason
```

A run with nothing pending takes one list call and a fraction of a second. A call that arrives
while a run is still going is refused (429) and Scheduler tries again a minute later, so two runs
never overlap (`docs/arhitecture.md`).

---

## 2. The services, and their AWS equivalents

Only what the web app's guide does not already cover.

| Google Cloud | What it does for us | AWS equivalent |
|---|---|---|
| **Cloud Scheduler** HTTP job | Cron that calls `POST /run` every minute, no retries, 30 min deadline. | EventBridge Scheduler with an HTTP (API destination) target |
| **OIDC token** on the job | The job signs each call as `pdf-run-invoker`; Cloud Run checks it before the request reaches the container. No shared secret. | A Lambda function URL with `AWS_IAM` auth, called with SigV4 |
| **Private Cloud Run service** (`--no-allow-unauthenticated`) | Only identities with `roles/run.invoker` on the service can call it. | Lambda function URL `AuthType=AWS_IAM`, or an internal ALB |
| **`roles/run.invoker`** on the service | `pdf-run-invoker` may call this one service. | A resource policy allowing `lambda:InvokeFunctionUrl` for one role |
| **`max-instances=1`, `concurrency=1`** | At most one run at a time, without a lock or a queue. | Lambda reserved concurrency = 1 |
| **Request-based billing** | CPU and memory are billed only while `/run` is being handled. | Lambda's per-invocation billing |

---

## 3. What the worker costs

| Service | Billed for | Expected for us |
|---|---|---|
| Cloud Run | ~44,000 calls a month (one a minute). An empty run is well under a second, billed in 100 ms steps at 2 vCPU and 4 GiB: roughly 10,000–20,000 vCPU-seconds and twice that in GiB-seconds a month, plus a few seconds per submission. The free tier (180,000 vCPU-s, 360,000 GiB-s, 2 M requests a month) is shared with the web app. Instances starting up are billed too **[verify]**. | $0 |
| Cloud Scheduler | per job a month; 3 jobs free per billing account **[verify current terms]** | $0 |
| Cloud Storage | each run lists `pending/`: ~44,000 class A operations a month, ~$0.005 per 1,000 in europe-west1 **[verify]** | ~$0.25 |
| Cloud Logging | one request log line per call (~45 MB a month) plus a few lines per submission; empty runs log nothing themselves | $0 (50 GiB free) |
| Artifact Registry | one more image (~250 MB); the cleanup policy covers it | cents |

**Expected: under $1/month.** What could change that: `min-instances` above 0 (an instance billed
around the clock at 2 vCPU / 4 GiB, tens of dollars a month), or a poison submission crashing every
run (every minute, each billed until it dies; `submission_waiting` alerts after 15 minutes).

---

## 4. What is in the repo for this

| File | What |
|---|---|
| `apps/input-pdf-worker/Dockerfile` | `node:24-slim`, production dependencies of the worker only, the TypeScript source run with `tsx`, the fonts; runs as the `node` user on `PORT` 8080. Built from the repo root. |
| `apps/input-pdf-worker/Dockerfile.dockerignore` | The build context for that image: an allowlist of what it copies (the root `.dockerignore` is the web app's). |
| `scripts/deploy-worker.sh` (`npm run deploy:worker`) | Checks, builds, pushes and deploys with every setting from `infra/deploy/worker.env`, calls `/health` with your identity token, and reports the Scheduler job's state. Used for the first deploy (§5.4) and every later one. |
| `infra/deploy/worker.env` | The deploy settings: project, region, bucket, service account, Scheduler job name, concurrency, time budget, sizing. |
| `infra/monitoring/worker-errors.template.json`, `worker-scheduler.template.json` | Alert policies; `${SERVICE}`, `${SCHEDULER_JOB}`, `${CHANNEL}` filled in with `envsubst` (§5.8). |

Environment variables on Cloud Run (set by the script): `GCS_BUCKET`, `APP_VERSION`,
`PDF_CONCURRENCY`, `RUN_BUDGET_SECONDS`, `NODE_OPTIONS=--max-old-space-size=…`. Not
`STORAGE_EMULATOR_HOST`: without it the worker uses its service account's token.

Fixed in the script rather than in the settings, because the design depends on them: private,
`--concurrency=1`, `--min-instances=0`, `--max-instances=1`.

---

## 5. One-time setup

Run everything from the repo root.

### 5.1 Variables

```bash
export PROJECT_ID=urban-moon-508616      # the values from infra/deploy/web.env and worker.env
export REGION=europe-west1
export BUCKET=urban-moon-intake
export WORKER=input-pdf-worker
export SCHEDULER_JOB=pdf-run
export WORKER_SA=pdf-worker-sa@$PROJECT_ID.iam.gserviceaccount.com
export INVOKER_SA=pdf-run-invoker@$PROJECT_ID.iam.gserviceaccount.com
gcloud config set project $PROJECT_ID

# the notification channel created in the web app's guide (§5.4)
gcloud beta monitoring channels list --format='table(name, displayName)'
export CHANNEL=<the name column, projects/…/notificationChannels/…>
```

Check that `infra/deploy/worker.env` has the same project, region, bucket and service account, and
commit it.

### 5.2 API

```bash
gcloud services enable cloudscheduler.googleapis.com
```

### 5.3 Service accounts

```bash
# what the worker runs as: objects in the submissions bucket, nothing else
gcloud iam service-accounts create pdf-worker-sa --display-name="input-pdf-worker"
gcloud storage buckets add-iam-policy-binding gs://$BUCKET \
  --member=serviceAccount:$WORKER_SA --role=roles/storage.objectUser

# what Cloud Scheduler signs its calls as: may call the worker, nothing else (granted in §5.5)
gcloud iam service-accounts create pdf-run-invoker --display-name="Cloud Scheduler → input-pdf-worker"
```

`roles/storage.objectUser` covers what the worker does: list `pending/`, read uploads, write
`output/` and `failed/`, delete markers.

### 5.4 First deploy

```bash
npm run deploy:worker -- --dry-run      # prints the build, push and deploy commands with these settings
npm run deploy:worker
export WORKER_URL=$(gcloud run services describe $WORKER --region=$REGION --format='value(status.url)')
echo $WORKER_URL
```

The script creates the private service and checks `/health` with your own identity token (a
project owner may call it). Its last step reports the Scheduler job as *not found*: that is
expected until §5.6.

### 5.5 Let the Scheduler's account call the worker

```bash
gcloud run services add-iam-policy-binding $WORKER --region=$REGION \
  --member=serviceAccount:$INVOKER_SA --role=roles/run.invoker
```

### 5.6 Scheduler job

```bash
gcloud scheduler jobs create http $SCHEDULER_JOB --location=$REGION \
  --schedule='* * * * *' --time-zone=Etc/UTC \
  --uri="$WORKER_URL/run" --http-method=POST \
  --oidc-service-account-email=$INVOKER_SA --oidc-token-audience="$WORKER_URL" \
  --attempt-deadline=30m --max-retry-attempts=0

gcloud scheduler jobs describe $SCHEDULER_JOB --location=$REGION \
  --format='yaml(state, schedule, httpTarget.uri, attemptDeadline, retryConfig)'
```

- **No retries:** a missed or refused call is simply the next minute's call.
- **30 minutes** is Scheduler's longest deadline for HTTP jobs, above the worker's 20-minute
  budget plus one build.
- Creating the job needs permission to act as `pdf-run-invoker` (project owners have it). On
  projects created before 2019, Scheduler's own service agent may also need
  `roles/cloudscheduler.serviceAgent` **[verify if the job's calls fail with a token error]**.

Any submission already waiting in `pending/` is built on the first call.

### 5.7 Smoke test

```bash
TOKEN=$(gcloud auth print-identity-token)
curl -s -H "Authorization: Bearer $TOKEN" $WORKER_URL/health           # {"ok":true}
curl -s -X POST -H "Authorization: Bearer $TOKEN" $WORKER_URL/run      # {"processed":0,…} or a 429 if the job is mid-run

# the job's own call, as pdf-run-invoker
gcloud scheduler jobs run $SCHEDULER_JOB --location=$REGION
gcloud logging read "resource.type=\"cloud_scheduler_job\" AND resource.labels.job_id=\"$SCHEDULER_JOB\"" \
  --freshness=10m --limit=5 --format='table(timestamp, severity, httpRequest.status, jsonPayload.status)'
```

Use `/health`, not `/healthz`: Google's frontend answers paths like `/healthz` on `run.app` with its
own 404, before the container sees them.

End to end: fill in the questionnaire on the web app and send it. Within a minute or two:

```bash
gcloud storage ls gs://$BUCKET/submissions/<id>/output/      # raspunsuri.pdf build.json delivery.json done.json
gcloud storage ls gs://$BUCKET/pending/                      # the marker is gone
gcloud storage cp gs://$BUCKET/submissions/<id>/output/raspunsuri.pdf .
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$WORKER\" AND jsonPayload.submissionId=\"<id>\"" \
  --freshness=1h --format='table(timestamp, severity, jsonPayload.event)'
```

The log shows `job_started`, `pdf_generated`, `delivery_skipped`, `submission_delivered`, then
`run_summary`.

### 5.8 Alerts

```bash
export SERVICE=$WORKER
envsubst < infra/monitoring/worker-errors.template.json > /tmp/worker-errors.json
envsubst < infra/monitoring/worker-scheduler.template.json > /tmp/worker-scheduler.json
gcloud alpha monitoring policies create --policy-from-file=/tmp/worker-errors.json
gcloud alpha monitoring policies create --policy-from-file=/tmp/worker-scheduler.json
gcloud alpha monitoring policies list --format='table(displayName, enabled)'
```

- **`pdf worker: failures`**: any `pdf_failed`, `delivery_failed`, `submission_waiting` (a
  marker older than 15 minutes), `run_failed` or `failed_marker_not_written` line, or the container
  running out of memory. At most one email per 5 minutes.
- **`pdf worker: scheduler calls failing`**: the job's calls logged as errors: 403 (the invoker
  binding is gone), 5xx, the deadline. At most one email an hour. An occasional 429 (a run that
  took longer than a minute) may also land here **[verify the job's log fields and severities on
  first apply]**.

---

### 5.9 HubSpot token

The worker uploads each PDF to HubSpot's Files API and submits the client's form
(`docs/arhitecture.md`, step 12). Its private app token is the one secret this system has: it is
kept in Secret Manager, read by `pdf-worker-sa` only, and never written into `worker.env` or an
image.

```bash
gcloud services enable secretmanager.googleapis.com

# --data-file=- reads the value from stdin, so the token is never a shell argument. tr drops the
# trailing newline: kept, it ends up inside the Authorization header and every call answers 401.
tr -d '\n' < <path to the token file> |
  gcloud secrets create hubspot-token --replication-policy=automatic --data-file=-

# check the length against the file, without printing the token
gcloud secrets versions access latest --secret=hubspot-token | wc -c

gcloud secrets add-iam-policy-binding hubspot-token \
  --member=serviceAccount:$WORKER_SA --role=roles/secretmanager.secretAccessor
```

`infra/deploy/worker.env` names the secret (`HUBSPOT_SECRET=hubspot-token`) and holds the portal,
form and folder, which are not secret. The deploy script mounts the secret as the `HUBSPOT_TOKEN`
environment variable; deploy again so the running revision picks it up:

```bash
npm run deploy:worker
gcloud run services describe $WORKER --region=$REGION \
  --format='value(spec.template.spec.containers[0].env)' | tr ',' '\n'   # HUBSPOT_TOKEN: from hubspot-token
```

The next run's logs then show `hubspot_file_uploaded` and `hubspot_form_submitted` per submission,
and `output/delivery.json` records the file id. With `HUBSPOT_SECRET` empty the worker still builds
and stores PDFs, logging `delivery_skipped` — which is how it ran before this step.

**Rotating the token** adds a version and restarts the service; the mount is `:latest`:

```bash
tr -d '\n' < <path to the new token file> | gcloud secrets versions add hubspot-token --data-file=-
npm run deploy:worker -- --skip-checks
```

The token belongs to a HubSpot private app and needs the files and forms scopes. Nothing else in
this project may read the secret, and it is not in the image, the repo or the service's plain
environment variables — only the running container's memory.

---

## 6. Every deploy after that

`docs/deployment.md`: `npm run deploy:worker`, checks after a deploy, rollback, pausing, re-running a
submission.

---

## 7. In the console (looking, not configuring)

| What | Where |
|---|---|
| The job, its last call and result, *Force run*, pause | Cloud Scheduler → `pdf-run` |
| Revisions, requests, instances, memory | Cloud Run → `input-pdf-worker` |
| A submission's outputs, waiting and failed markers | Cloud Storage → the bucket → `submissions/<id>/output/`, `pending/`, `failed/` |
| Logs for one submission, both services | Logging → Logs Explorer: `jsonPayload.submissionId="…"` |
| Alerts | Monitoring → Alerting |

---

## 8. Not covered yet

- **Custom domain** for the web app instead of the `run.app` URL.
- **`qpdf` and `sharp`** for very large client PDFs and photos: packages in the
  image, and memory measured with the worst-case fixture.
- **CI/CD**: `scripts/deploy-worker.sh` in a GitHub Action with Workload Identity Federation.
