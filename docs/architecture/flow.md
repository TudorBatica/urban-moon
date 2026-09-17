# Architecture: the flow

A submission from the first screen to HubSpot, step by step, including what happens when something
fails. Components: `overview.md`. Object names and the manifest: `storage.md`. Log events:
`../operations/observability.md`.

---

## 1. The client answers the questionnaire

`/` renders one screen at a time, driven by the catalog in `packages/domain-data`. The URL carries
the screen (`/?s=k3`); plain `/` resumes where the client left off. Chapters, in order: **Despre
tine** (name and email, which rooms), **Planuri** (the plans step), **Locuința** (stage of the
project, household), then one chapter per room picked (kitchen, living room, bedroom, office,
bathroom, hall, other).

Answers live in the browser only: `localStorage["um.answers"]`, the resume position in
`um.cursor`. Nothing reaches the server until the client sends. Screen kinds include single and
multiple choice, text, compound cards and furniture lists; "Altceva" options open a text box.
`/cuprins` shows the chapters up front.

## 2. Picking rooms decides the rest

`c_rooms` drives which chapters exist, how many plan files are allowed (2 per room, never fewer
than 2) and which "furniture kept" screens appear. Unpicking a room removes its chapter and its
answers stop being asked.

## 3. The plans step (`/planuri`), which forks

First a gate: a disclaimer about measuring, with a checkbox ("Am măsurat spațiul"). Until it is
ticked, nothing on the step can be used.

Then, depending on the number of rooms:
- **One room:** the client may **upload** files *or* **draw** the plan. A tile opens the editor.
- **Two or more rooms:** upload only.

Accepted: PDF, JPG, PNG. Images up to 10 MB, PDFs up to 25 MB, and 400 MB for the whole
submission; the same limits in the browser, at the commit and in the schema. Rejections (wrong
type, too big, over the limit, duplicate) are listed in Romanian, never silent. Files are kept in
IndexedDB with their metadata in `localStorage["um.plans"]`.

The step also takes **photos of the space**, and each room's furniture screen takes **photos of the
furniture being kept** (up to 10 per group, in `um.photos` plus IndexedDB). A furniture photo
carries the room whose screen it was added on; that is what places it in the right chapter of the
PDF. Plans carry no room.

To continue, the client needs the measuring tick and at least one plan file or a drawing.

## 4. Drawing a plan (`/deseneaza`)

A full-screen editor: the client draws the outline, sets wall lengths, ceiling height, doors and
windows. "Gata" saves the model (for later editing), a **room snapshot** (the structured
dimensions), an **SVG** and a **PNG** into `um.plans`, then returns to the plans step.

## 5. The summary (`/rezumat`)

"Ce am înțeles": every question with its answer, by chapter, each with a link back to its screen,
plus the files and photos. Then the send panel with a consent checkbox, which blocks sending until
it is ticked.

## 6. Sending: the files go straight to the bucket

Pressing **Trimit răspunsurile** starts one job per plan file, per photo and for the drawing's PNG,
three at a time:

1. **A submission id** is created once (a UUID in `sessionStorage["um.submissionId"]`), so a retry
   writes into the same folder.
2. **`POST /api/uploads/start`** with `{submissionId, fileId, kind, name, type, size}`. The server
   checks the type and size against the shared limits, decides the object name
   (`uploads/<fileId>.<jpg|png|pdf>`, the drawing always `uploads/drawing.png`) and opens a
   **resumable upload session** on the bucket, returning its URI.
3. **The browser PUTs the bytes** to that URI in 8 MiB chunks. After a network error it asks the
   session how much arrived and continues from there; five attempts with backoff, and an expired
   session is reopened once. Each finished file is remembered in `sessionStorage["um.uploads"]`, so
   a retry skips it. The panel shows a percentage per file.
4. Furniture photos of a room that is no longer picked are left out of the send.

## 7. The commit: the server writes the manifest

`POST /api/submissions/<id>/commit` carries the answers, the drawing (room snapshot and SVG) and
the file list. The server:

1. **Checks every declared object**: it exists, its size matches, and its first 16 bytes really are
   a JPEG, PNG or PDF. A missing or mismatched file comes back as `missing` with its id, and the
   browser uploads just that one again.
2. **Builds `manifest.json`** and validates it against the shared schema.
3. **Writes it once** (create-only; a repeat commit answers `ok` without overwriting).
4. **Writes the empty object `pending/<id>`**, which is how the worker finds new work. A repeat
   commit puts the marker back.

## 8. After sending

With a Calendly link configured, the client goes to `/programare`, books a slot with name and email
prefilled, then `/multumim`. Without a link, straight to `/multumim`. The thanks page clears the
answers, the files and the session keys, so the next project starts clean.

## 9. The worker is triggered

Cloud Scheduler calls `POST /run` every minute with an OIDC token; the service is private, so
nothing else can. A call that arrives while a run is still going gets **429**: the service allows
one instance and one request at a time, and Scheduler simply tries again a minute later. No queue,
no locks. `GET /health` is the health endpoint (Cloud Run intercepts `/healthz`).

## 10. A run

```
list pending/, oldest marker first, PDF_CONCURRENCY submissions at a time (default 2)
for each id:
  output/done.json exists   → delete the marker, next          (job_skipped_done)
  marker older than 15 min  → submission_waiting (ERROR), carry on
  build the PDF from submissions/<id>/                          (pdf_generated; pdf_degraded on warnings)
    → output/raspunsuri.pdf, output/build.json
  deliver to HubSpot                                            (delivery_skipped without a token)
    → output/delivery.json
  → output/done.json, delete pending/<id> and any failed/<id>   (submission_delivered)
  on failure → failed/<id> {stage, code, message, detail, at, version}; delete the marker
                                                                (pdf_failed / delivery_failed, ERROR)
no submission is started after RUN_BUDGET_SECONDS (20 min); the next run continues
answer 200 {processed, failed, skipped, left, durationMs}       (run_summary, when anything was pending)
```

Bucket calls that fail on the network, a timeout, 429 or 5xx are retried three times (0.5 s, 2 s).
If the process dies mid-run, the markers stay and the next run starts those submissions again.

## 11. Building the PDF

From the manifest and the uploaded files, in one A4 document:

1. **Cover**: client, date, rooms, counts, submission id.
2. **Contents**: the sections and every client document with its page numbers.
3. **Answers**: every question the client could see, by chapter, with the catalog's labels.
4. **The drawn plan**: the image, ceiling height, walls, doors and windows.
5. **Uploaded plans**: a client PDF gets a separator page, then its pages copied unchanged, each
   stamped along its visual bottom edge ("Document încărcat de client · file · pagina x din n");
   an image plan gets its own stamped page.
6. **Photos**: of the space, then the furniture kept per room, two per row, EXIF rotation applied.

Fonts (Figtree, Newsreader) are embedded and subset, because the standard PDF fonts cannot encode
ă, ș, ț. A client file that cannot be read does not fail the submission: the separator page says why
and the original is attached inside the PDF (`pdf_degraded`).

## 12. Delivery to HubSpot

Three calls, in order, with the token from Secret Manager:

1. **Upload the PDF** to the Files API as `intake-<submissionId>.pdf`, into one File Manager folder,
   with access `PUBLIC_NOT_INDEXABLE`.
2. **Read that URL back with no credentials**, and stop unless the status and the size match: the
   form fetches the file this way and stores whatever comes back without checking it.
3. **Submit the form** `app_input_client` (authenticated submission) with the client's email, first
   and last name, and the file's URL in the field `app_input_capture`. HubSpot creates the contact
   when the email is new, copies the file into its own private storage under
   `/form-uploads/<formId>/`, and points the contact at that copy through a signed redirect. The
   uploaded source stays in the folder.

`delivery.json` records the file id, name, URL, form and email. A 429 or 5xx is tried three times;
anything else fails the submission with the step that failed (`upload_failed`, `file_not_readable`,
`submit_failed`).

With `HUBSPOT_TOKEN` unset, delivery writes `{"hubspot": null}` and logs `delivery_skipped`.

## 13. When something fails

| Where | What happens |
|---|---|
| A chunk upload fails | The browser resumes, then marks the row failed with a retry button. |
| A file is missing at commit | 400/409 naming it; the browser re-uploads only that file. |
| The manifest is refused by its own schema | `commit_rejected` with the schema issues; this is a bug, not client error. |
| A build fails | `failed/<id>` with the stage and code; the marker is removed so runs move on. |
| The worker crashes or is killed mid-run | The marker stays; the next run retries the submission. |
| A submission crashes every run | Its marker never leaves `pending/`; after 15 minutes each run logs `submission_waiting`. |
| HubSpot is down or rate-limits | Three attempts; then the PDF stays in the bucket, the submission moves to `failed/` with the step that failed, and `pdf:reprocess` re-runs it. |
| The uploaded file cannot be read back | Delivery stops before the form, so HubSpot never copies an error page as the client's PDF. `failed/<id>` says `file_not_readable`. |

Re-running: `npm run pdf:reprocess -- <id>` moves `failed/<id>` back to `pending/`; `--force` also
deletes `output/`, so a finished submission is built again.
