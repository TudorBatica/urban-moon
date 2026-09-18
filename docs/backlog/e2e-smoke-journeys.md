# The smoke tier: the journeys every deploy runs

## Description

With the harness and the HubSpot fake built, write the `@smoke` set: the few journeys that prove,
in about two minutes, that a client can get through the questionnaire and that a submission
reaches HubSpot, including one failure and its recovery. The set is defined in
`docs/code/testing.md` (*Tiers*, *Tracking test cases*); this ticket names each test. Needs
`e2e-harness.md` and `e2e-hubspot-fake.md`.

Owner: the qa agent. The dev adds test ids the qa asks for, in a follow-up listed in the qa's
summary; a journey never selects by CSS class or copy to avoid asking.

### `journeys/questionnaire.spec.ts` (flow steps 1–2, 5)

1. **"answers the first chapter and reaches the plans gate"** (`@smoke @phone`): from `/`, fill
   name and email on `c_identity`, pick *Bucătărie* on `c_rooms`, continue: the catalog's next
   screen is the `planuri` route, so the page is `/planuri`; there, continue is blocked until the
   measuring box is ticked, and still blocked with no plan file (the state the gate shows).
   Assert through test ids and roles only; the identity fields need test ids if they have none
   (ask the dev).
2. **"resumes where the client left off"** (`@smoke`): answer two screens, reload `/`, the same
   screen is shown; `/?s=c_rooms` opens that screen directly.
3. **"the summary links back to a question"** (`@smoke`): with seeded `minimal` answers, open
   `/rezumat`; every section lists its answers; the *Modifică* link of the first question opens
   `/?s=c_identity`.

### `journeys/send.spec.ts` (flow steps 5–12)

The harness's test, now with delivery asserted (done in the fake's ticket), stays the one `@smoke
@phone` send. Nothing is added here by this ticket.

### `journeys/delivery.spec.ts` (flow step 13)

1. **"when the form is down, the submission fails with submit_failed and a re-run delivers it"**
   (`@smoke`): send a minimal submission (the `send` helper), set a rule
   `{step: 'submit', status: 503}` for its id, `runWorker()`, `waitForSubmission(id, 'failed')`:
   the failed object has `stage` delivery, `code` `submit_failed`; `output/raspunsuri.pdf` exists
   (the PDF is kept), `pending/<id>` is gone; the fake has the upload and one read, no form
   submission. Clear the rule; run `npm run pdf:reprocess -- <id>` with `GCS_BUCKET=um-e2e` and
   `STORAGE_EMULATOR_HOST` in the environment (the operator's command, spawned from the test);
   `runWorker()`, `waitForSubmission(id, 'done')`: `failed/<id>` is gone, the form submission
   is recorded, `delivery.json` names the file.

### Budget

`npm run e2e` (smoke, desktop and phone projects) finishes within 2 minutes after the web build on
a laptop, with the stack cold. Record the measured time in the qa's summary; if it is over, the
set is trimmed, not the timeouts.

### Docs

`docs/code/testing.md`: the journey map rows for these files match what was written.
