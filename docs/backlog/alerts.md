# Alerts for the web app and the worker

## Description

Nothing notifies anyone when the system breaks: there are no alert policies, uptime checks or
notification channels in the project. Failures are only visible by reading the logs.

Add, for both services, notifications by email:

- **web: submission errors**: any `commit_failed`, `upload_start_failed` or `storage_not_configured`
  line from `input-capture-web`; at most one email per 5 minutes.
- **web: site down**: an uptime check on `/api/health` failing for 5 minutes.
- **pdf worker: failures**: any `pdf_failed`, `delivery_failed`, `submission_waiting`, `run_failed`
  or `failed_marker_not_written` line, or the container running out of memory (`Memory limit` in
  the text payload); at most one email per 5 minutes.
- **pdf worker: scheduler calls failing**: the `pdf-run` job's calls logged at ERROR or above (403,
  5xx, the deadline); at most one email an hour.

Starting point: the four templates in `infra/monitoring/` (`web-errors`, `web-down`,
`worker-errors`, `worker-scheduler`), with `${SERVICE}`, `${SCHEDULER_JOB}`, `${CHECK_ID}` and
`${CHANNEL}` filled in with `envsubst`. Neither the templates' filters nor the uptime aggregation
have been applied against the real project yet; check them on first apply, including whether an
occasional Scheduler 429 lands in the scheduler policy.

Needs: an email notification channel, the `monitoring` API (enabled), the uptime check, the four
policies. Done when each policy exists, has fired once in a deliberate test, and
`docs/operations/observability.md` and `infrastructure.md` list them.
