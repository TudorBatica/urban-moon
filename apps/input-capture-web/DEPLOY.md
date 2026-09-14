# Deploying input-capture to Cloudflare

SvelteKit app, deployed as a **Cloudflare Worker with static assets**
(`@sveltejs/adapter-cloudflare`). One command to ship.

## First time (once)

```bash
cd /home/tudorb/Documents/interior-arch-speedup/input-capture
npm install
npx wrangler login      # opens a browser; authorises this machine
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

## Demo mode — how the test deploy works with no backend

`src/lib/hubspot/client.ts` exports `isUnconfigured()`: true when `HUBSPOT_TOKEN` is
unset or still `mock-token`. While it is true:

- `uploadFile()` returns a synthetic file record. Nothing is uploaded.
- `submitForm()` returns success with `"Mulțumim! (demo — răspunsurile nu au fost trimise)"`.
  Nothing is sent. The full payload is written to the Worker log instead.

So a tester can walk the entire questionnaire and reach `/multumim`. **Answers are not
stored anywhere.** This is a UX test, not a data collection run.

It disables itself: the moment a real `HUBSPOT_TOKEN` is set, the real code path runs.
There is no flag to remember to flip.

Watch what a tester submitted:

```bash
npx wrangler tail
```

## Tomorrow: turning the backend on

Secrets never go in `wrangler.jsonc`. Set them once:

```bash
npx wrangler secret put HUBSPOT_TOKEN        # paste the pat-… private app token
npx wrangler secret put HUBSPOT_PORTAL_ID
npx wrangler secret put HUBSPOT_FORM_GUID
npm run deploy
```

Non-secret config already lives in `wrangler.jsonc` under `vars`
(`HUBSPOT_API_BASE`, `HUBSPOT_FORMS_BASE`, `HUBSPOT_FILES_FOLDER`, `MOCK_ADMIN_BASE`,
`PUBLIC_CALENDLY_URL`). Set `PUBLIC_CALENDLY_URL` to the Calendly event link to turn on the
booking step after the send; left empty, the send goes straight to the thanks page.

The HubSpot form also needs the multi-line text property `um_photo_files` (photos of the space
and of kept furniture, one `url | name | room | group` per line).

Verify it actually flipped over:

```bash
curl -s https://<your-worker-url>/api/health     # {"ok":true,"mock":false,...}
npx wrangler tail                                # no "DEMO MODE" lines on a submit
```

### Deploying safely

- **Check before you ship:** `npm run check && npx vitest run && npm run deploy`.
- **Roll back:** Cloudflare keeps every version.
  `npx wrangler deployments list`, then
  `npx wrangler rollback [version-id]`. Seconds, no rebuild.
- **Try it before the world sees it:** `npx wrangler versions upload` creates a version
  with a preview URL without taking traffic; promote with `npx wrangler versions deploy`.
- **Commit first.** This repo is git-initialised; `git log` is your other rollback.

## Pulling in changes from the prototype

The app is developed in the prototype repo. To bring changes over:

```bash
./sync-from-prototype.sh
git diff
npm run check && npx vitest run
npm run deploy
```

The script copies `src/`, `static/`, `tsconfig.json`, `vitest.config.ts`, and re-derives
`vite.config.ts` with the Cloudflare adapter. It never touches `wrangler.jsonc`,
`package.json` or this file. It warns if the demo fallback in `client.ts` got overwritten.

## What is not deployed

- **WireMock** — the local HubSpot stand-in. Not needed; demo mode covers it.
- **Playwright e2e** — they drive WireMock, so they stay in the prototype repo.
  Unit tests (`npx vitest run`, 103 of them) do come along and should pass here.
- **`/dev/inbox`** — reads the WireMock journal. `MOCK_ADMIN_BASE` is empty in
  `wrangler.jsonc`, so its server load returns 404. Note the app is SPA-rendered
  (`ssr = false`), so the URL still serves an empty 200 shell; the *data* 404s and
  nothing is exposed.
