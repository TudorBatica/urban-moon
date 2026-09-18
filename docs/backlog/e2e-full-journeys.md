# The full tier: limits, drawing, resilience and the worker's failure paths

## Description

The journeys beyond the smoke set, run by `npm run e2e:full` before deploys that touch the flow,
and nightly once CI exists. Each one covers a step of `docs/architecture/flow.md` that the smoke
tier only passes through. Needs `e2e-smoke-journeys.md`. Build them in the order below; each is
reviewable on its own, so this ticket may be delivered in parts, the journey map in
`docs/code/testing.md` updated with each.

Owner: the qa agent; test ids from the dev on request.

### `journeys/plans.spec.ts` (flow step 3)

1. **"refuses a file of the wrong type and says why"**: `e2e/fixtures/files/notes.txt` is
   rejected; the rejection list names the file and the reason; nothing is added.
2. **"refuses an image over 10 MB"**: the generated `e2e/.tmp/big.png`; same assertions.
3. **"refuses a duplicate"**: the same plan twice; one file, one rejection.
4. **"caps plan files at two per room, never below two"**: one room picked: a third plan is
   refused with the limit's reason; three rooms picked (seeded): six are accepted.
5. **"offers drawing for one room only"**: one room: the draw tile is there; two rooms: it is not.

### `journeys/drawing.spec.ts` (flow step 4)

Written against the rebuilt drawing experience; each journey names the ticket it needs, and that
ticket lists its test ids. A drag on the stage draws only while a drawing tool is on, and every
tool hands back to select after one use, so each wall is "pick `tool-wall`, then drag". Once
`drawing-3-slides.md` is built, every journey here first skips the slides or seeds them as seen.

1. **"draws a room with the tools, answers the ceiling height and saves it as the plan"**
   (`drawing-1-editor-tools-and-view.md`): one room seeded, open `/deseneaza`; four times pick the
   wall tool and drag on the stage so the outline closes; pick the window tool and tap a wall;
   press the arrow, answer "Gata cu planul?" with *Continuă*; fill the ceiling height, go on (once
   `drawing-5-landmarks.md` is built: through the cards with none chosen); back on `/planuri` the
   drawing card is shown; continue is allowed with no uploaded file. Then send (the `send` helper
   from `/rezumat`): the manifest has `drawing` with a room snapshot carrying the ceiling height,
   and the PNG object; `uploads/drawing.png` exists; the PDF has the drawn-plan section. If
   driving the editor by pointer proves too brittle, the journey seeds
   `fixtures/state/drawing.json` and only asserts the send; say so in the summary so the architect
   can decide on an editor test hook.
2. **"a tool makes one thing and hands back to select"** (`drawing-1-editor-tools-and-view.md`):
   with select on, a drag on the empty stage draws nothing; with the wall tool on, one drag makes
   one wall and select is pressed again; a second drag draws nothing.
3. **"leaving the editor with unsaved changes asks first"**
   (`drawing-1-editor-tools-and-view.md`): draw one wall, press back: the discard note; *Rămân
   aici* stays, *Renunț* discards.
4. **"the slides open the first time only and reopen from the hint"** (`drawing-3-slides.md`): a
   fresh context shows the slides over the canvas; skipping closes them; a reload does not show
   them; the hint's link opens them again from the first.
5. **"places a landmark and it reaches the manifest and the PDF"** (`drawing-5-landmarks.md`): a
   saved drawing seeded from `fixtures/state/drawing.json`, open the cards; pick a card, skip its
   slide, tap a wall, press the arrow back to the cards: the card is ticked; go on to `/planuri`
   and send: the manifest's room snapshot has one landmark of that kind with its wall and face;
   the PDF's drawn-plan section lists it.

### `journeys/send-resilience.spec.ts` (flow steps 6–7)

1. **"resumes an upload after a dropped chunk"**: `page.route` aborts the first `PUT` to the
   emulator's session URI once, then lets everything through. The send completes; the manifest
   has the file with the right size; the bucket object's size matches. Keep the file above one
   chunk (a generated 9 MB JPEG in `e2e/.tmp/`) so the resume is real.
2. **"retries the commit and commits once"**: `page.route` answers the first commit `POST` with
   502; the panel shows the error and the retry button; the second press commits; one
   `manifest.json`, one `pending/<id>`, the finished files were not uploaded again (count the
   `POST /api/uploads/start` requests).
3. **"a missing file is uploaded again at commit"**: after the uploads finish and before the
   commit (route the commit request, delete the object from `um-e2e` through the bucket helper,
   then continue the request), the commit answers 409 naming the file; the browser re-uploads
   only that file and commits. If the app commits too fast to intercept between the two steps,
   drop this case and note it: the unit tests of `commit.ts` cover the server side.

### `journeys/send.spec.ts`, added tests

1. **"sends three rooms with two plans and furniture photos"** (`@phone`): the `full` fixture's
   answers seeded (three rooms, furniture screens); upload two plans and one space photo, add one
   furniture photo on a room's screen (`photos-mobilier` on `/?s=k13`), send, run the worker; the
   manifest's furniture photo carries the room; the PDF has more pages than the one-room send.
2. **"starting over clears everything"**: after the thanks page, *Începe din nou*; `/` shows the
   first screen with no answers; `/planuri` has no files.

### `journeys/worker.spec.ts` (flow step 11)

1. **"a corrupt client PDF degrades the PDF instead of failing"**: upload
   `e2e/fixtures/files/corrupt.pdf` (a valid `%PDF-` header, garbage after it: the browser and
   the commit accept it by its head, the generator cannot open it); the submission ends `done`;
   `build.json` has the `client_pdf_unreadable` warning; the PDF still opens.

### `journeys/delivery.spec.ts`, added tests (flow steps 12–13)

1. **"a transient upload error is retried and delivers"**: rule `{step: 'upload', status: 503,
   times: 2}`; `done`; the fake shows three upload attempts (records count attempts).
2. **"an upload refused for good fails with upload_failed"**: rule `{step: 'upload', status:
   403}`; `failed/<id>` with `upload_failed`; no read, no form.
3. **"an unreadable file stops delivery before the form"**: rule `{step: 'read', status: 200,
   body: '<html>error</html>'}` (the size does not match); `failed/<id>` with
   `file_not_readable`; the fake has no form submission. This is the case the read-back exists
   for (`docs/architecture/flow.md`, step 12).
4. **"a submission already done is skipped, not delivered twice"**: after a `done` send, write
   `pending/<id>` again through the bucket helper, run the worker: the run's summary counts one
   skipped, the fake still has one form submission, the marker is gone.

### Budget

`npm run e2e:full` finishes within 10 minutes on a laptop with the stack cold. Measure and record
it.
