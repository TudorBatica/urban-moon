# 0001: `packages/domain-data` is the only contract between the apps

Status: accepted, 2026-09-17.

## Context

The web app writes a submission and the worker reads it, in separate processes that deploy
separately. They must agree on the question catalog (ids, options, labels, visibility), the answer
shapes, the manifest, and the upload limits. Manifests written by an older web app stay in the
bucket and are read by newer workers.

## Decision

Everything both apps must agree on lives only in `packages/domain-data`: the catalog, the answer
schema derived from it, the manifest schema, the limits and the fixture submissions.

- Apps import its TypeScript source directly; it has no build and no published version.
- No app defines its own copy of a shared type, schema, limit or question.
- Both ends validate with its schemas: the web app before writing the manifest, the worker when
  reading it.
- Its fixtures are the contract's examples: domain-data's tests validate them, the worker's tests
  render them, and `full` answers every question the catalog can ask.
- The manifest carries `schemaVersion`. Additive changes keep it; breaking changes bump it, the
  worker supports every version it has seen, and the worker deploys first.

## Alternatives

- **Each app keeps its own types and validates what it receives.** Rejected: the two copies drift
  silently, and a mismatch only shows up as a failed submission in production.
- **A published, versioned package.** Rejected: the apps could run different versions of the
  contract from the same commit; importing the source means one `npm run check` covers both.

## Consequences

- A change to a question or the manifest breaks the type check or the tests of whichever app still
  uses the old shape, before it ships.
- A breaking manifest change costs more: two schema versions in the worker, and a deploy order.
- Anything new that both apps need (a limit, a label, a field) goes into `domain-data` first.
