# Deploying the web app to Google Cloud

Status: guide, 2026-09-14. Covers `apps/input-capture-web` only; the PDF worker gets its own
section once it exists (`docs/pdf-worker-plan.md`). Everything is done with the `gcloud` CLI;
the web console is for looking at things, the one-time billing-account setup, and manual tests.

Flags below were checked against the installed Google Cloud SDK 520.0.0 (`gcloud … --help`).
Prices are approximate list prices from memory — check the pricing calculator before relying on
them. Anything not checked is marked **[verify]**.

---

## 1. What runs where

```
browser ──HTTPS──▶ Cloud Run service "input-capture-web"  (the SvelteKit app, a container)
   │                    │ runs as service account web-sa
   │                    │ opens upload sessions, checks files, writes manifest + pending marker
   │                    ▼
   └──PUT file bytes──▶ Cloud Storage bucket "um-submissions-…"  (europe-west1, private)

Artifact Registry  ← holds the container images Cloud Run runs
Cloud Logging      ← the app's JSON log lines
Cloud Monitoring   ← uptime check, alert policies, email notifications
Cloud Billing      ← budget with email alerts (mandatory, set up first)
```

File bytes never pass through Cloud Run: the browser sends them to the bucket directly. The app
only handles small JSON requests.

---

## 2. The services, and their AWS equivalents

| Google Cloud | What it does for us | AWS equivalent |
|---|---|---|
| **Project** | The container for everything: resources, IAM, enabled APIs, logs. One project, e.g. `urban-moon-prod`. | An AWS account (a member account under Organizations) |
| **Billing account** | The payment method. Projects are *linked* to it; budgets are defined on it. | Billing on the management (payer) account |
| **APIs & services** | Each service must be switched on per project (`gcloud services enable …`). | Nothing — AWS services are on by default |
| **`gcloud` CLI, configurations** | CLI; `gcloud config set project/region` sets defaults. | `aws` CLI, profiles |
| **Cloud Run (service)** | Runs our container behind HTTPS on a `*.run.app` URL, scales from zero to N instances with traffic, keeps every deployed *revision* for instant rollback or traffic splits. Billed only while handling requests. | **App Runner** is the closest. By hand: ECS on Fargate + an ALB. Lambda with a container image gives the scale-to-zero part. |
| **Artifact Registry** | Stores the Docker images Cloud Run pulls. | ECR |
| **Cloud Build** (optional) | Builds images in the cloud. We build locally with Docker instead; it matters later for CI. | CodeBuild |
| **Cloud Storage bucket** | Holds submissions: uploads, manifest, markers, PDFs. | S3 bucket |
| · uniform bucket-level access + public access prevention | No per-object ACLs; nothing can ever be made public. | S3 Object Ownership "bucket owner enforced" + Block Public Access |
| · lifecycle rule | Deletes submissions after 45 days. | S3 Lifecycle expiration |
| · resumable upload session | The browser uploads straight to the bucket through a session the server opened. | S3 multipart upload with presigned part URLs |
| · soft delete | Keeps deleted objects recoverable for N days (billed as storage). | Roughly: S3 versioning + noncurrent-version expiration |
| · CORS config | Lets the browser on our domain PUT to the bucket. | S3 CORS configuration |
| **Service account** (`web-sa`) | The identity the app runs as. No key files: the code gets short-lived tokens from the metadata server. | An IAM role assumed by the task (App Runner instance role / ECS task role); the container credentials endpoint |
| **IAM binding on the bucket** | `web-sa` may create, read and delete objects in this bucket only. | A bucket policy, or a role policy scoped to the bucket ARN |
| **Secret Manager** | Secrets as env vars (not needed by the web app today; the worker's HubSpot token later). | Secrets Manager |
| **Cloud Logging** | Collects stdout; JSON lines become searchable fields (`jsonPayload.event`). Logs Explorer to search. | CloudWatch Logs + Logs Insights |
| **Log-based alert** | Notifies when a log line matches a filter (e.g. `commit_failed`). | CloudWatch metric filter + alarm |
| **Cloud Monitoring alert policy + notification channel** | Alerting rules and where they go (email, Slack…). | CloudWatch Alarms + SNS topic subscriptions |
| **Uptime check** | Calls `/api/health` from several regions every few minutes. | Route 53 health checks / CloudWatch Synthetics |
| **Error Reporting** | Groups exceptions found in logs, emails on new ones. | No direct one (CloudWatch + X-Ray; think Sentry) |
| **Budgets & alerts** | Emails at spend thresholds. Alerts only — never stops spending. | AWS Budgets |
| Cloud Scheduler (worker, later) | Cron that calls an HTTP endpoint. | EventBridge Scheduler |
| Domain mapping (later) | A custom domain with managed TLS on the Cloud Run service. | App Runner custom domains / ACM + Route 53 |

---

## 3. Billing

### How it works

- A **billing account** holds the payment method and receives the invoice. Each **project** is
  linked to one billing account; unlinking stops the project's paid services.
- New accounts get a **free trial** credit (historically $300 for 90 days) **[verify current
  terms]**, and several services have an **always-free monthly allowance** per billing account.
- You pay per use, per service, monthly. Costs show up in *Billing → Reports* with a delay of
  hours (up to about a day).
- **Budgets do not cap spending.** They send emails (and optionally Pub/Sub messages) at
  thresholds. The real limits are the ones we set on the resources: Cloud Run `max-instances`,
  bucket lifecycle, image cleanup.

### What the web app costs

| Service | Billed for | Free each month (approx.) | Expected for us |
|---|---|---|---|
| Cloud Run (request-based) | vCPU-seconds and GiB-seconds while a request is being handled (≥ 100 ms each), plus requests. Idle instances cost nothing unless `min-instances > 0`. | 180,000 vCPU-s, 360,000 GiB-s, 2 M requests | $0 |
| Cloud Storage (Standard, europe-west1) | ~$0.02/GB-month stored (soft-deleted bytes included), operations (~$0.05 per 10k writes/lists, ~$0.004 per 10k reads), downloads to the internet. Uploads are free. | little in EU regions **[verify]** | cents |
| Artifact Registry | ~$0.10/GB-month of images | 0.5 GB | $0–0.20 (cleanup policy keeps it small) |
| Cloud Logging | ingestion beyond the allowance, retention beyond 30 days | 50 GiB/project | $0 |
| Cloud Monitoring | Google Cloud metrics and uptime checks are free; alerting conditions may be charged per condition **[verify]** | — | $0–1 |
| Network egress | pages and JSON sent to browsers | small | cents |
| Budgets | — | free | $0 |

**Expected total: $0–2/month** at our traffic. What could make it jump:

- `min-instances=1` on Cloud Run: an instance billed around the clock (~$10–15/month).
- No `max-instances`: a traffic spike or a bot scales without limit. We set `--max-instances=3`.
- Logs in a loop (a bug logging per request at high volume).
- Images piling up in Artifact Registry without a cleanup policy.
- Soft delete on a bucket with a lot of churn (deleted data stays billed for the retention period).

---

## 4. What is in the repo for this

Run every command in this guide from the repo root.

| File | What |
|---|---|
| `apps/input-capture-web/vite.config.ts` | Builds a Node server with `@sveltejs/adapter-node` (`node build`, listens on `PORT`; Cloud Run sets 8080). `ADAPTER=cloudflare` still builds the old Cloudflare Worker for `npm run deploy` in the app folder. |
| `apps/input-capture-web/Dockerfile` | Built from the repo root so the workspace is there: a build stage (`npm ci`, the SvelteKit build) and a `node:24-slim` runtime with the build output and production dependencies only, running as the `node` user. ~240 MB. |
| `.dockerignore` | Keeps `.git`, `node_modules`, `.env` files, build output and unrelated folders out of the build context. |
| `infra/gcs/lifecycle.json` | Delete `submissions/` and `failed/` objects after 45 days. |
| `infra/gcs/cors.template.json` | Bucket CORS; `${WEB_ORIGINS}` is filled in with `envsubst` (§5.10). |
| `infra/artifact-registry/cleanup.json` | Keep the 10 newest images, delete older ones after 30 days. |
| `infra/monitoring/web-errors.template.json`, `web-down.template.json` | Alert policies; `${SERVICE}`, `${CHANNEL}`, `${CHECK_ID}` filled in with `envsubst` (§5.11). |
| `scripts/deploy-web.sh` (`npm run deploy:web`) | Checks, builds, pushes and deploys with every setting from `infra/deploy/web.env`. Used for the first deploy (§5.9) and every later one (`docs/deployment.md`). |
| `infra/deploy/web.env` | The deploy settings: project, region, bucket, service account, env vars, sizing. |

Checked locally: the image runs against the storage emulator (health, page, upload session,
commit), and `npm run check` / `npm test` pass.

Environment variables on Cloud Run (set by the deploy script from `infra/deploy/web.env`): `GCS_BUCKET`, `APP_VERSION`, `PUBLIC_CALENDLY_URL`,
`ORIGIN` (the public URL; adapter-node uses it for request origins), `BODY_SIZE_LIMIT=8M` (the
commit body carries the drawing's SVG). Not `STORAGE_EMULATOR_HOST` — without it the app uses the
service account's token from the metadata server (`src/lib/server/config.ts`).

---

## 5. One-time setup

### 5.0 Tools and login

```bash
gcloud components update
gcloud components install beta alpha     # monitoring channels (beta) and alert policies (alpha)
gcloud auth login                         # opens the browser
```

### 5.1 Billing account — in the console, once

Create a billing account with a payment method: <https://console.cloud.google.com/billing>.
This is the one step that needs the UI. Then:

```bash
gcloud billing accounts list              # note the ACCOUNT_ID (XXXXXX-XXXXXX-XXXXXX)
```

### 5.2 Variables (keep them in your shell for the rest)

```bash
export BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX
export PROJECT_ID=urban-moon-prod         # globally unique; add a suffix if taken
export REGION=europe-west1
export BUCKET=um-submissions-$PROJECT_ID  # bucket names are global too
export SERVICE=input-capture-web
export ALERT_EMAIL=you@example.com
```

Put the same project, region, bucket and service account into `infra/deploy/web.env`, which the
deploy script reads (§5.9).

### 5.3 Project

```bash
gcloud projects create $PROJECT_ID --name="Urban Moon"
gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION
gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
```

### 5.4 Budget and billing alerts — before anything that costs money

```bash
gcloud services enable billingbudgets.googleapis.com monitoring.googleapis.com

# where alerts go (billing admins get budget emails by default; this adds your address)
export CHANNEL=$(gcloud beta monitoring channels create \
  --display-name="Alerts: $ALERT_EMAIL" --type=email \
  --channel-labels=email_address=$ALERT_EMAIL --format='value(name)')

# the billing account's currency; the budget amount must use it
gcloud billing accounts describe $BILLING_ACCOUNT --format='value(currencyCode)'   # e.g. EUR [verify field]

gcloud billing budgets create \
  --billing-account=$BILLING_ACCOUNT \
  --billing-project=$PROJECT_ID \
  --display-name="urban-moon monthly" \
  --budget-amount=20EUR \
  --calendar-period=month \
  --filter-projects=projects/$PROJECT_NUMBER \
  --threshold-rule=percent=0.10 \
  --threshold-rule=percent=0.50 \
  --threshold-rule=percent=0.90 \
  --threshold-rule=percent=1.00 \
  --threshold-rule=percent=1.00,basis=forecasted-spend \
  --notifications-rule-monitoring-notification-channels=$CHANNEL

gcloud billing budgets list --billing-account=$BILLING_ACCOUNT
```

The 10 % threshold (€2) is the early warning: anything above our expected €0–2 is worth a look.
The forecast rule fires when Google projects the month will exceed the budget. Check it in the
console: *Billing → Budgets & alerts*.

### 5.5 APIs

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  storage.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
  logging.googleapis.com secretmanager.googleapis.com
```

### 5.6 Artifact Registry

```bash
gcloud artifacts repositories create urban-moon --repository-format=docker \
  --location=$REGION --description="Container images"
gcloud artifacts repositories set-cleanup-policies urban-moon --location=$REGION \
  --policy=infra/artifact-registry/cleanup.json --no-dry-run
gcloud auth configure-docker $REGION-docker.pkg.dev
```

`infra/artifact-registry/cleanup.json` keeps the 10 newest images and deletes older ones after
30 days.

### 5.7 Bucket

```bash
gcloud storage buckets create gs://$BUCKET --location=$REGION \
  --uniform-bucket-level-access --public-access-prevention \
  --soft-delete-duration=0     # no hidden copies of deleted client data (GDPR, cost); or e.g. 7d
gcloud storage buckets update gs://$BUCKET --lifecycle-file=infra/gcs/lifecycle.json
```

`infra/gcs/lifecycle.json` deletes everything under `submissions/` and `failed/` after 45 days.

CORS needs the app's URL, so it is set after the first deploy (§5.10).

### 5.8 Service account for the app

```bash
gcloud iam service-accounts create web-sa --display-name="input-capture-web"
gcloud storage buckets add-iam-policy-binding gs://$BUCKET \
  --member=serviceAccount:web-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --role=roles/storage.objectUser
```

`roles/storage.objectUser` on this bucket only: create, read, list and delete objects. No
project-wide roles.

### 5.9 First deploy

Check `infra/deploy/web.env` against the variables above (project, region, bucket, service
account) and commit it. Then:

```bash
npm run deploy:web -- --dry-run      # prints the build, push and deploy commands with these settings
npm run deploy:web
export URL=$(gcloud run services describe $SERVICE --format='value(status.url)')
echo $URL
```

The script runs the checks, builds and pushes the image, and creates the service:
- public (`--allow-unauthenticated`), since it is a public questionnaire
- running as `web-sa`
- capped at `MAX_INSTANCES` instances, the cost ceiling

A new service has no URL until it exists, so on this first run the script sets `ORIGIN` to the new
URL right after deploying, then checks `/api/health`. `docs/deployment.md` describes each step.

### 5.10 CORS for browser uploads

The browser PUTs file chunks to the bucket from the app's origin. `infra/gcs/cors.template.json`
allows `PUT` from `${WEB_ORIGINS}` and exposes `Range` (how far an upload got):

```bash
export WEB_ORIGINS=$URL        # more than one later: WEB_ORIGINS='https://a", "https://b'
envsubst < infra/gcs/cors.template.json > /tmp/cors.json && cat /tmp/cors.json
gcloud storage buckets update gs://$BUCKET --cors-file=/tmp/cors.json
gcloud storage buckets describe gs://$BUCKET --format='default(cors_config)'
```

### 5.11 Monitoring for the web app

```bash
# uptime check on the health endpoint
gcloud monitoring uptime create "$SERVICE health" \
  --resource-type=uptime-url \
  --resource-labels=host=${URL#https://},project_id=$PROJECT_ID \
  --protocol=https --path=/api/health

# the check's id, for the alert below
gcloud monitoring uptime list-configs --format='table(name.basename(), displayName)'
export CHECK_ID=<the id from the first column>

# alert policies, rendered from the templates
envsubst < infra/monitoring/web-errors.template.json > /tmp/web-errors.json
envsubst < infra/monitoring/web-down.template.json > /tmp/web-down.json
gcloud alpha monitoring policies create --policy-from-file=/tmp/web-errors.json
gcloud alpha monitoring policies create --policy-from-file=/tmp/web-down.json
gcloud alpha monitoring policies list --format='table(displayName, enabled)'
```

- **`web: submission errors`** (`web-errors.template.json`) — a log-based alert on any
  `commit_failed`, `upload_start_failed` or `storage_not_configured` line from the service; at most
  one email per 5 minutes.
- **`web: site down`** (`web-down.template.json`) — the uptime check failing for 5 minutes
  **[verify the aggregation on first apply; the console's uptime check page shows whether the
  policy is attached]**.

### 5.12 Smoke test

```bash
curl -s $URL/api/health                                   # {"ok":true}
# fill in the questionnaire on $URL from a phone, with a photo and a drawn plan, then:
gcloud storage ls gs://$BUCKET/pending/
gcloud storage ls --recursive gs://$BUCKET/submissions/<id>/
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$SERVICE\" AND jsonPayload.event:\"submission\"" --freshness=1h --limit=20
```

---

## 6. Every deploy after that

`docs/deployment.md`: `npm run deploy:web`, candidates, checks after a deploy, rollback, changing
settings.

---

## 7. In the console (looking, not configuring)

| What | Where |
|---|---|
| Service, revisions, request/latency/instance charts | Cloud Run → `input-capture-web` |
| Logs, filter by `jsonPayload.submissionId` | Logging → Logs Explorer |
| Uploaded files, markers | Cloud Storage → Buckets → `um-submissions-…` |
| Alerts, uptime check, incidents | Monitoring → Alerting / Uptime checks |
| Spend so far, by service | Billing → Reports |
| Budget and its thresholds | Billing → Budgets & alerts |

---

## 8. Not covered yet

- **Custom domain** (DNS stays on Cloudflare): `gcloud beta run domain-mappings create
  --service=$SERVICE --domain=…` or a load balancer; then add the domain to `cors.json` and
  `ORIGIN`. Decide with design doc §15.
- **The PDF worker**: its own service, service account, Scheduler job and Secret Manager token.
- **CI/CD**: `scripts/deploy-web.sh` in a GitHub Action with Workload Identity Federation (no key files).
- **Retiring the Cloudflare deploy** once this one is live.
- **Tearing everything down**: `gcloud projects delete $PROJECT_ID` (recoverable for 30 days).
