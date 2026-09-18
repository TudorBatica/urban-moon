# The worker's HubSpot addresses come from the environment

## Description

`apps/input-pdf-worker/src/deliver/hubspot.ts` hard-codes `https://api.hubapi.com/files/v3/files`
and `https://api.hsforms.com/submissions/v3/integration/secure/submit`. The end-to-end suite needs
the worker to deliver to a local fake (`docs/code/testing.md`, *The HubSpot fake*), and no test
may ever reach the real account. Make the base address a setting, per the standards rule that
outbound integrations take their base URL from the environment (`docs/code/standards.md`).

Owner: the dev.

- `HubSpotConfig` gains `baseUrl?: string`. When set, the two endpoints are
  `${baseUrl}/files/v3/files` and `${baseUrl}/submissions/v3/integration/secure/submit`
  (the fake serves both paths on one origin); when unset, the two real hosts as today. Trailing
  slashes are tolerated.
- `config.ts` reads `HUBSPOT_API_URL` and passes it as `baseUrl`. It is only meaningful with
  `HUBSPOT_TOKEN`; log it in `worker_started` as `hubspotApiUrl` (the address, not the token) so
  a run against a fake is visible in the log.
- `hubspot.test.ts`: with `baseUrl`, both calls go to it; without, to the real hosts. The
  existing tests stay green unchanged.
- The worker's `README.md` settings table: `HUBSPOT_API_URL`, default empty (the real HubSpot),
  "a fake HubSpot, local only". `.env.example`: one commented line under the HubSpot block.

The deploy script sets the service's environment as a whole from `infra/deploy/worker.env`, which
does not contain `HUBSPOT_API_URL`, so production keeps calling HubSpot; no change there.
