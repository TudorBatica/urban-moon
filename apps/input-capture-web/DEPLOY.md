# Deploying input-capture to Cloudflare

> The app is moving to Google Cloud Run; see `docs/deploy-web-gcp.md` (setup) and
> `docs/deployment.md` (deploying). This page describes the
> current Cloudflare test deploy, where sending does not work.

SvelteKit app, deployed as a **Cloudflare Worker with static assets**
(`@sveltejs/adapter-cloudflare`). One command to ship.

## First time (once)

The app lives in a workspace: install from the repo root, deploy from the app's folder.

```bash
cd /home/tudorb/Documents/interior-arch-speedup/input-capture
npm install                     # the whole workspace, including @urban-moon/domain-data
cd apps/input-capture-web
npx wrangler login              # opens a browser; authorises this machine
npm run deploy
```

`npm run deploy` = `npm run build && wrangler deploy`. It prints the URL, something like
`https://input-capture.<your-subdomain>.workers.dev`. Send that to the tester.

## Every time after

```bash
npm run deploy
```

## Local preview of the real Worker

```bash
npm run preview:cf      # build + wrangler dev, on http://127.0.0.1:8787
```

`npm run dev` still works too (plain Vite, faster) — but it does not run the Worker
runtime, so use `preview:cf` when you want to check anything server-side.

---

## What a test deploy does with answers

**Sending does not work on Cloudflare.** Files now go to a Cloud Storage bucket and the app
commits a manifest there (`docs/pdf-pipeline-design.md` §5–6). The Worker has no bucket
configured (and no Google identity to reach one), so `/api/uploads/start` answers 503
(`storage_not_configured` in the log) and the panel shows an error. A tester can still walk the
whole questionnaire up to the send. Sending works locally against the emulator (root
`README.md`) and, later, on Cloud Run.

Watch the log:

```bash
npx wrangler tail
```

## Config

`wrangler.jsonc` → `vars`: `PUBLIC_CALENDLY_URL`, the Calendly event link for the booking step
after the send; left empty, the send goes straight to the thanks page. The bucket settings
(`GCS_BUCKET`, `STORAGE_EMULATOR_HOST`, `GCS_ACCESS_TOKEN`) are for local runs and Cloud Run.

### Deploying safely

- **Check before you ship:** from the repo root `npm run check && npm test`, then
  `npm run deploy` in `apps/input-capture-web`.
- **Roll back:** Cloudflare keeps every version.
  `npx wrangler deployments list`, then
  `npx wrangler rollback [version-id]`. Seconds, no rebuild.
- **Try it before the world sees it:** `npx wrangler versions upload` creates a version
  with a preview URL without taking traffic; promote with `npx wrangler versions deploy`.
- **Commit first.** This repo is git-initialised; `git log` is your other rollback.

## Where development happens

This repo is the only home of the app now; the old prototype sync script is gone. The question
catalog and the shared types come from `packages/domain-data` in the same workspace, which the
Cloudflare build bundles like any other source.

## Tests

Unit tests (`npm test` from the repo root) cover the app, domain-data and the PDF worker.
