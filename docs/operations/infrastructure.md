# Infrastructure

Every cloud resource the system uses, as it exists. How the apps are deployed onto it:
`deployment.md`. Access rules explained: `../architecture/security.md`.

All of it lives in one Google Cloud project, `urban-moon-508616`, region `europe-west1`.

---

## Resources

| Resource | Name | Configuration | Kept in the repo |
|---|---|---|---|
| Cloud Run service | `input-capture-web` | public, runs as `web-sa`, sizing and env vars from the settings file | `infra/deploy/web.env`, `scripts/deploy-web.sh` |
| Cloud Run service | `input-pdf-worker` | private, one instance, one request at a time, runs as `pdf-worker-sa` | `infra/deploy/worker.env`, `scripts/deploy-worker.sh` |
| Cloud Storage bucket | `urban-moon-intake` | uniform access, public access prevention enforced, soft delete off, no lifecycle rules, CORS: `PUT` from the web app's origins | `infra/gcs/cors.template.json` |
| Cloud Scheduler job | `pdf-run` | `* * * * *` UTC, `POST <worker URL>/run`, OIDC token as `pdf-run-invoker` with the worker URL as audience, 30 min deadline, no retries | — |
| Artifact Registry repository | `urban-moon` | Docker; keeps the 10 newest images, deletes older ones after 30 days | `infra/artifact-registry/cleanup.json` |
| Secret Manager secret | `hubspot-token` | the HubSpot private app token (files and forms scopes), automatic replication, no trailing newline | — |
| Enabled APIs | | `run`, `artifactregistry`, `storage`, `iam`, `iamcredentials`, `logging`, `monitoring`, `cloudscheduler`, `secretmanager` | — |

## Identities and access

| Service account | Used by | Roles |
|---|---|---|
| `web-sa@urban-moon-508616.iam.gserviceaccount.com` | `input-capture-web` | `roles/storage.objectUser` on `urban-moon-intake` |
| `pdf-worker-sa@urban-moon-508616.iam.gserviceaccount.com` | `input-pdf-worker` | `roles/storage.objectUser` on `urban-moon-intake`; `roles/secretmanager.secretAccessor` on `hubspot-token` |
| `pdf-run-invoker@urban-moon-508616.iam.gserviceaccount.com` | the `pdf-run` job | `roles/run.invoker` on `input-pdf-worker` |

No service account has project-wide roles, and none has a key file.

## Addresses

| What | Value |
|---|---|
| Web app | `https://input-capture-web-znr7bgch5q-ew.a.run.app` |
| Worker | `https://input-pdf-worker-znr7bgch5q-ew.a.run.app` (private) |
| Image registry | `europe-west1-docker.pkg.dev/urban-moon-508616/urban-moon` |

## External accounts

| Service | What is used |
|---|---|
| HubSpot | portal `146798766`, form `app_input_client` (`25774231-d10e-4879-88b1-dfd2547b5d8b`), File Manager folder `/app-input-capture`, a private app whose token is `hubspot-token` |
| Calendly | none yet: `PUBLIC_CALENDLY_URL` in `infra/deploy/web.env` is empty, so the booking step is off |

## Not in place

- Alert policies and uptime checks: `../backlog/alerts.md`.
- A custom domain: `../backlog/custom-domain.md`.
