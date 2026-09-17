# Runbook

Operating the running system: pausing, re-running submissions, and symptoms with their causes and
fixes. Log events: `observability.md`. Resources and access: `infrastructure.md`. Releasing:
`deployment.md`.

---

## Pausing processing

```bash
gcloud scheduler jobs pause pdf-run --project=urban-moon-508616 --location=europe-west1
gcloud scheduler jobs resume pdf-run --project=urban-moon-508616 --location=europe-west1
```

While paused, submissions wait in `pending/` and nothing is lost; the first run after resuming
builds them all. Markers older than 15 minutes log `submission_waiting` then.

## Re-running a submission

`npm run pdf:reprocess` works against the real bucket with your own credentials:

```bash
GCS_BUCKET=urban-moon-intake STORAGE_EMULATOR_HOST= \
GCS_ACCESS_TOKEN=$(gcloud auth print-access-token) \
  npm run pdf:reprocess -- <submissionId>            # failed/ → pending/; add --force to rebuild a done one
```

`STORAGE_EMULATOR_HOST=` (empty) overrides the emulator address in the worker's local `.env`. The
next Scheduler call picks the submission up. `--force` on a delivered submission delivers it again.
To see what failed first:

```bash
gcloud storage ls gs://urban-moon-intake/failed/
gcloud storage cat gs://urban-moon-intake/failed/<submissionId>
```

The failure codes: `apps/input-pdf-worker/README.md`.

---

## Web app: symptoms

| Symptom | Likely cause | Fix |
|---|---|---|
| Deploy: `uncommitted changes` | the tree is not clean | commit, or `--allow-dirty` for a throwaway test |
| Push: `denied` / `unauthorized` | Docker cannot push to the registry from this machine | `gcloud auth configure-docker europe-west1-docker.pkg.dev` |
| Deploy: `PERMISSION_DENIED` | the logged-in account lacks rights on the project | `gcloud auth list`; log in with the project's owner/deployer |
| Smoke test fails | the new revision does not start (`exec format error`, a crash on boot) | read the logs the script prints; roll back; fix |
| Browser: sending fails, the console shows a CORS error | the page's address is not in the bucket's CORS origins | `deployment.md`, *Changing the site's address*, step 2 |
| Log: `storage_not_configured` | `GCS_BUCKET` missing | check `infra/deploy/web.env`, deploy |
| Log: `upload_start_failed` or `commit_failed` with 403 | the service account lost its role on the bucket | `gcloud storage buckets get-iam-policy gs://urban-moon-intake`; restore `roles/storage.objectUser` for `web-sa` |
| Log: `commit_rejected` with `missing` | a browser's upload did not finish; the client retries by itself | nothing, unless it keeps happening |
| Log: `commit_rejected` with `manifest_invalid` | the app sent something its own schema refuses: a bug | the log's `issues` say which field; fix, deploy |

## Worker: symptoms

| Symptom | Likely cause | Fix |
|---|---|---|
| Smoke test: 403 | your account may not invoke the service | `gcloud auth list`; use the project owner, or grant yourself `roles/run.invoker` on the service |
| Smoke test: 404 from Google (not JSON) | a path like `/healthz`, which Google's frontend answers itself | the script calls `/health`; use that |
| Smoke test fails otherwise | the revision does not start (`Cannot find module`, a crash on boot) | read the logs the script prints; roll back; fix |
| Scheduler line: `not found` | the `pdf-run` job was deleted | re-create it as described in `infrastructure.md` |
| Scheduler line: `PAUSED` | someone paused it | `gcloud scheduler jobs resume pdf-run …` |
| Scheduler line: `WARNING: the job calls …` | the job points at another URL | `gcloud scheduler jobs update http pdf-run --location=europe-west1 --uri=<url>/run --oidc-token-audience=<url>` |
| Scheduler log: 401/403 on every call | `pdf-run-invoker` lost `roles/run.invoker` on the worker, or the token audience is wrong | `gcloud run services get-iam-policy input-pdf-worker --region=europe-west1`; restore the binding; check `--oidc-token-audience` is the service URL |
| Scheduler log: an occasional 429 | a run took longer than a minute; the next call was refused | nothing |
| Log: `pdf_failed` with `manifest_invalid` or `manifest_unsupported` | the web app writes a manifest this worker does not know: the worker is older | deploy the worker, then re-run the submissions in `failed/` |
| Log: `pdf_failed` with `object_unreadable` or `bucket_error` 403 | `pdf-worker-sa` lost its role on the bucket | restore `roles/storage.objectUser` on the bucket for `pdf-worker-sa`; re-run |
| Log: `delivery_failed` with `upload_failed` or `submit_failed` 401 | the HubSpot token is wrong, revoked, or stored with a trailing newline | check the private app in HubSpot; add a new secret version without a newline; deploy the worker; re-run |
| Log: `delivery_failed` with `file_not_readable` | the uploaded PDF's URL does not answer anonymously with the same size | check the file in the File Manager folder; re-run |
| Log: `delivery_skipped` in production | `HUBSPOT_SECRET` is empty in `infra/deploy/worker.env` | set it, deploy |
| Log: `submission_waiting` every minute for the same id | the worker crashes on that submission (e.g. `Memory limit … exceeded` in the logs), or runs are not happening | out of memory: lower `PDF_CONCURRENCY` or raise `MEMORY`, deploy. Crashes otherwise: move its marker aside (`gcloud storage mv gs://…/pending/<id> gs://…/failed/<id>`) and read its logs |
| Log: `run_failed` | the run could not list `pending/` | usually the bucket role or `GCS_BUCKET`; the log has the message |

---

## Where to look

| What | Where |
|---|---|
| Revisions, traffic, requests, errors, instances | Console → Cloud Run → `input-capture-web` / `input-pdf-worker` |
| The worker's job: last call, result, *Force run*, pause | Console → Cloud Scheduler → `pdf-run` |
| Logs for one submission, both services | Console → Logging → Logs Explorer: `jsonPayload.submissionId="…"` |
| Images and their tags | Console → Artifact Registry → `urban-moon` |
| Uploads, markers, PDFs | Console → Cloud Storage → `urban-moon-intake` (`pending/`, `failed/`, `submissions/<id>/output/`) |
| The HubSpot token | Console → Security → Secret Manager → `hubspot-token` |
