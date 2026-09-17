# Observability

What the apps log and where to read it. There are no alert policies yet.

---

## Log lines

Every log line is one JSON object on stdout, which Cloud Logging turns into fields (`severity`,
`event`, `submissionId`, …). Session URIs, tokens and file contents are never logged.

| Event | Severity | Where | Means |
|---|---|---|---|
| `upload_session_created` | INFO | web | a resumable session was opened for one file |
| `upload_start_rejected` | WARNING | web | the file was refused (type, size, reserved id) |
| `upload_start_failed` | ERROR | web | the bucket would not open a session |
| `storage_not_configured` | ERROR | web | `GCS_BUCKET` is not set: sending is off |
| `commit_rejected` | WARNING | web | files missing, content mismatched, or the manifest failed its schema |
| `submission_committed` / `submission_already_committed` | NOTICE | web | the manifest was written / was already there |
| `commit_failed` | ERROR | web | the bucket failed during the commit |
| `worker_started` / `worker_stopping` | INFO | worker | the process started / got SIGTERM |
| `run_summary` | INFO | worker | processed, failed, skipped, left, duration; only when something was pending |
| `run_failed` | ERROR | worker | the run could not even list `pending/` |
| `marker_ignored` | WARNING | worker | an object in `pending/` whose name is not a submission id |
| `job_started` / `job_skipped_done` | INFO | worker | a submission was picked up / was already finished |
| `submission_waiting` | ERROR | worker | a marker older than 15 minutes |
| `pdf_generated` | NOTICE | worker | pages, bytes, photos, client documents, duration |
| `pdf_degraded` | WARNING | worker | the PDF was built, but a client file could not be read |
| `hubspot_file_uploaded` | INFO | worker | the PDF is in the File Manager folder |
| `hubspot_form_submitted` | NOTICE | worker | the form was submitted with the file URL and the client's email |
| `delivery_skipped` | INFO | worker | no HubSpot token: nothing was delivered |
| `pdf_failed` / `delivery_failed` | ERROR | worker | the submission moved to `failed/` |
| `submission_delivered` | NOTICE | worker | finished; duration and time since the commit |
| `failed_marker_not_written` | ERROR | worker | even the failure could not be recorded; the marker stays |

The worker's failure codes (in `failed/<id>` and the log): `apps/input-pdf-worker/README.md`.

## Where to read them

| What | Where |
|---|---|
| One service's recent lines | `gcloud run services logs read <service> --project=urban-moon-508616 --region=europe-west1 --limit=30` |
| One submission, both services | Console → Logging → Logs Explorer: `jsonPayload.submissionId="…"` |
| One event | Logs Explorer: `jsonPayload.event="commit_failed"` |
| The Scheduler job's calls | Logs Explorer: `resource.type="cloud_scheduler_job" AND resource.labels.job_id="pdf-run"` |
| Revisions, requests, errors, instances, memory | Console → Cloud Run → the service |

## Alerts

None. The planned policies and their templates in `infra/monitoring/`: `../backlog/alerts.md`.
