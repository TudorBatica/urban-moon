# Architecture: security and data protection

Who can reach what, where the one secret lives, what is public and where client data goes. The
resources named here: `../operations/infrastructure.md`.

---

- **The bucket is private**: uniform access, public access prevention, no object ever readable
  without credentials. Each app's service account has `roles/storage.objectUser` on this bucket
  only, and gets short-lived tokens from the metadata server. No key files anywhere.
- **Deleted objects are gone**: soft delete is off on the bucket.
- **The browser never holds a bucket credential**: it gets one resumable session URI per file,
  which is good for that object alone.
- **The worker is private**: only Cloud Scheduler's identity (`pdf-run-invoker`, with
  `roles/run.invoker` on the service) may call it.
- **One secret**: the HubSpot private app token, in Secret Manager as `hubspot-token`, readable by
  `pdf-worker-sa` only and mounted into the worker as `HUBSPOT_TOKEN`. It is not in the repo, the
  image or the service's plain environment variables.
- **Client data leaves the EU only for HubSpot**, and the bucket is in `europe-west1`.
- **The delivered PDF is reachable by URL**: the upload is `PUBLIC_NOT_INDEXABLE`, unguessable and
  carrying no client name. HubSpot's copy, which the contact links to, is private.
- **Submission ids are not bound to a browser**: ids are random UUIDs, but someone who learns an id
  could write into that prefix.
