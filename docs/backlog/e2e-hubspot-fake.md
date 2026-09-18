# The HubSpot fake for end-to-end tests

## Description

No test may reach the real HubSpot account, yet the smoke tier must prove that the built PDF is
uploaded, readable and submitted with the form. Build the fake described in
`docs/code/testing.md` (*The HubSpot fake*) in `e2e/hubspot-fake/`, and make the e2e worker
deliver to it. Needs `e2e-harness.md` (the suite) and `worker-hubspot-api-url.md`
(`HUBSPOT_API_URL`) first.

Owner: the qa agent, reviewed by the code-reviewer. The fake mirrors
`apps/input-pdf-worker/src/deliver/hubspot.ts` and its unit test; read both before writing it.

### The server (`e2e/hubspot-fake/server.ts`, `main.ts`)

A `node:http` server, pure logic in `server.ts` (a request handler over an in-memory store, so it
is unit-tested with `Request`/`Response` and no port) and a `main.ts` that listens on `PORT`
(5182) with `HUBSPOT_FAKE_TOKEN` (`e2e-token`). It speaks only what the worker calls:

| Call | Checks | Answer |
|---|---|---|
| `POST /files/v3/files` (multipart: `file`, `fileName`, `folderPath`, `options`) | `Authorization: Bearer <token>`, else 401; `options.access === 'PUBLIC_NOT_INDEXABLE'` and a non-empty `folderPath`, else 400 (the contract the security doc relies on) | 201 `{id, name, url}`; `url` is `http://localhost:5182/f/<id>` |
| `GET /f/<id>` | nothing (the unauthenticated read-back) | 200 with the bytes and `content-length`; 404 for an unknown id |
| `POST /submissions/v3/integration/secure/submit/<portalId>/<formId>` (JSON `{fields}`) | the bearer token; fields `email`, `firstname`, `lastname`, `app_input_capture` present with `objectTypeId` `0-1`, else 400 | 200 `{inlineMessage: "ok"}` |
| anything else | | 404, and the request is logged: the worker called something the fake does not know |

A submission is recognised by its file name `intake-<submissionId>.pdf` at upload; the file id
maps to the submission id for the read and for the form (whose `app_input_capture` is the file's
URL).

### The test-double endpoints

- `GET /__e2e/records/<submissionId>` → `{upload: {fileId, name, folderPath, access, bytes,
  at} | null, reads: [{status, at}], submit: {portalId, formId, fields, at} | null}`.
- `POST /__e2e/rules` `{submissionId, step: 'upload' | 'read' | 'submit', status, times?, body?}`:
  the next `times` calls of that step for that submission answer `status` with `body` (default:
  forever, an empty JSON object; for `read`, `body` may be an HTML string, to reproduce the error
  page HubSpot would serve). `DELETE /__e2e/rules/<submissionId>` removes them.
- `DELETE /__e2e/records` clears records and rules; the suite's global setup calls it.

Rules are per submission so failure journeys run in parallel with the rest.

### Wiring

- `playwright.config.ts`: a third `webServer` (`npx tsx e2e/hubspot-fake/main.ts`, `url:
  http://localhost:5182/__e2e/health`), and the worker's env gains `HUBSPOT_TOKEN=e2e-token`,
  `HUBSPOT_PORTAL_ID=e2e-portal`, `HUBSPOT_FORM_ID=e2e-form`, `HUBSPOT_FOLDER_PATH=/e2e`,
  `HUBSPOT_API_URL=http://localhost:5182`.
- `e2e/lib/hubspot.ts`: `records(id)`, `rule(id, step, status, times?, body?)`, `clearRules(id)`.
- `send.spec.ts` (the harness's journey) now asserts delivery: `delivery.json.hubspot.fileName`
  is `intake-<id>.pdf` and its `fileUrl` is on the fake; the fake's record has the upload with
  `bytes` equal to the PDF's size, `folderPath` `/e2e`, `access` `PUBLIC_NOT_INDEXABLE`, exactly
  one read, and a form submission with `portalId`/`formId` from the config, the test's email, and
  `firstname`/`lastname` split from the fixture's name.

### Unit tests (`e2e/hubspot-fake/server.test.ts`)

Token refused; upload recorded and readable; unknown file 404; form fields checked; a rule fails
the step the given number of times then stops; records per submission; unknown path 404.

### Docs

`e2e/README.md`: the fake's endpoints in one table, the port, the token. `docs/code/testing.md`
already describes it; adjust it if the built endpoints differ.
