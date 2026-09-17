# Map

Where things are in this repo, and which doc answers what.

## Where things are

| Path | What it is |
|---|---|
| `apps/` | The buildable artefacts: what gets deployed, tying the packages together. |
| `apps/input-capture-web` | The questionnaire, plans step, floor plan editor and send: SvelteKit on Cloud Run. |
| `apps/input-pdf-worker` | Builds each committed submission's PDF and delivers it to HubSpot; called every minute by Cloud Scheduler. |
| `packages/` | Libraries shared by the apps, imported as TypeScript source (no build step). |
| `packages/domain-data` | The contract both apps agree on: question catalog, answer and manifest schemas, upload limits, fixture submissions. |
| `packages/bucket` | The Cloud Storage client both apps use, for Google and the local emulator. |
| `infra/` | How the infrastructure is managed: deploy settings (`infra/deploy/*.env`), bucket CORS, image cleanup policy, alert policy templates. |
| `scripts/` | The deploy scripts and the local bucket inspector. |
| `docs/` | Knowledge about the system, below. |
| `.claude/agents/` | The agents that work on this repo, their responsibilities and what each reads. |

Each app and package has a `README.md`: how to run it, its settings, its code map and notes.
Root commands (install, local run, check, test, bucket inspection, deploy) are in the root
`README.md`.

## Which doc to read

| Doc | Read it when |
|---|---|
| `architecture/overview.md` | you need the components, where each runs, and how the apps stay in agreement |
| `architecture/flow.md` | you change or test anything a submission goes through, step by step, failures included |
| `architecture/storage.md` | you touch object names, the manifest or browser storage |
| `architecture/security.md` | you touch access, secrets, what is public, or where client data goes |
| `architecture/adr/` | a ticket links a decision, or you are about to reverse a system-wide rule |
| `backlog/` | you are given a ticket, or planning what to build: one file per unbuilt piece of work |
| `code/standards.md` | you write or review code |
| `ux/design.md` | you change or review anything the client sees |
| `operations/infrastructure.md` | you need what exists in the cloud: resources, identities, addresses |
| `operations/deployment.md` | you prepare a release or change deploy settings |
| `operations/runbook.md` | something is wrong in production, or a submission must be re-run |
| `operations/observability.md` | you add a log event or read logs |
