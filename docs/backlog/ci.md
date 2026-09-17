# CI running checks and tests on every push

## Description

Nothing runs `npm run check && npm test` except a deploy. Run both from the repo root on every push,
whatever changed. Later, the deploy scripts can run from the same pipeline with Workload Identity
Federation (no key files).
