# Deploys run the e2e smoke tier

## Description

The deploy scripts run `npm run check` and `npm test` and nothing more, so a deploy can ship a web
app that cannot send or a worker that cannot deliver. Make the smoke tier part of every deploy, as
`docs/code/testing.md` (*Tiers and when they run*) defines. Needs `e2e-smoke-journeys.md`.

Owner: the infra agent (`scripts/`, `docs/operations/deployment.md`).

- `scripts/deploy-web.sh` and `scripts/deploy-worker.sh`: in the *Check and test* step, after
  `npm test`, run `npm run e2e`; with `--full-e2e`, run `npm run e2e:full` instead.
  `--skip-checks` skips it with the rest; a new `--skip-e2e` skips only the journeys (the unit
  tests still run). Docker is already required by the preflight (the image build), so the
  emulator can always start.
- The step prints which tier ran and how long it took; a failure stops the deploy before the
  image build, with `npm run e2e:report` named as the next step.
- `docs/operations/deployment.md`: the options tables and *What it does* for both scripts; in
  *Before you deploy*, when to use `--full-e2e`: a change to the send protocol
  (`apps/input-capture-web/src/lib/submit`, the upload or commit routes), the worker's run or
  delivery, or `packages/domain-data`. Note the time a deploy takes now (the web build plus about
  two minutes).
- `docs/backlog/ci.md` already says CI runs the smoke tier on every push; nothing to do here.
