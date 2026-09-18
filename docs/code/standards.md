# Coding standards

How code is written in `apps/`, `packages/`, `scripts/` and `infra/`. A change that breaks one of
these is sent back in review. What the system is made of, and the system-wide rules it enforces,
are in `docs/architecture/` and its ADRs.

---

## Code and docs

- **Code never references docs.** No doc paths, section numbers or "see README" in code, comments,
  scripts, settings files or log messages. Docs point at code, never the other way round. The code
  is a standalone artefact: it must read correctly after any doc is moved, renamed or deleted.
- **Comments say why, from how the system works.** A comment is added only when the code cannot
  explain itself: why it behaves this way because of a constraint in the system (a platform quirk,
  an external API's behaviour, an invariant another component relies on).
- **Comments never tell history.** No earlier attempts, no "we tried", no "used to", no how the
  decision was reached, no "later" or "todo" promises. Unbuilt work is a backlog ticket.

## Structure

- **Keep logic pure and injectable.** Side effects (fetch, storage, time, ids, sleeps) arrive as
  parameters, so a whole flow runs in a unit test without a browser, a service or a network.
  Existing examples: the worker's `buildSubmissionPdf(source)` and `runOnce`, the web app's
  `submit.ts`.
- **Settings come from the environment**, never hard-coded values that differ between local and
  deployed runs.
- **Outbound integrations take their base URL from the environment** (HubSpot today), with the
  real address as the default, so a local fake can stand in for them in the end-to-end suite and
  no test ever reaches a real account.

## Language and types

- **TypeScript, strict.** `npm run check` from the root must print no errors.
- **Validate what crosses a boundary** with a schema: what arrives over HTTP and what is read
  from storage.
- **English in code**: identifiers, logs and comments.

## Errors and logs

- **One JSON line per event**, through the app's `log` helper: a `severity`, an `event` in
  `snake_case`, and the ids needed to follow it (`submissionId`, `fileId`).
- **Never log** tokens, session URIs or file contents.
- **Failures carry a stable code** a person can act on (`manifest_invalid`, `upload_failed`), not
  only a message.
- **Retry only what is transient** (network, 408, 429, 5xx), a bounded number of times with backoff.

## Tests

- **Unit tests sit next to the code** as `*.test.ts`, run by vitest, with no services: fakes and
  in-memory implementations instead.
- **End-to-end journeys live in `e2e/`** as `*.spec.ts`, run by Playwright against the local
  system, by the conventions in `testing.md`. Code under `e2e/` follows every rule on this page.
- **`npm test` from the root must pass** before a change is done.
