# CI running checks and tests on every push

## Description

Nothing runs `npm run check && npm test` except a deploy. Run both from the repo root on every push,
whatever changed, then the e2e smoke tier (`npm run e2e`: Docker for the emulator, Chromium from
`npx playwright install --with-deps chromium`, the Playwright report as an artefact on failure);
the full tier (`npm run e2e:full`) nightly. The tiers: `docs/code/testing.md`. Later, the deploy
scripts can run from the same pipeline with Workload Identity Federation (no key files).
