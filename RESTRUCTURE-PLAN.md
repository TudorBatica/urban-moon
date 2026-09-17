# Docs restructure: plan (temporary, delete once done)

Read top to bottom: what has to be done in this system → who does it → which docs that needs →
what changes in the repo.

---

## 1. Responsibilities

Everything that has to happen for this system to be built, run and kept healthy. **You** means the
human: things that touch real accounts, money or production are done by you, and an agent only
prepares them.

### Product and planning
| # | Responsibility |
|---|---|
| P1 | Turn a request into a technical plan: what changes, in which components, in what order |
| P2 | Write backlog tickets: name, description (scope, technical decisions, what is out of scope) |
| P3 | Keep the backlog true: remove finished tickets, fold duplicates, record gaps found during work |
| P4 | Decide priorities and what gets built next (**you**) |

### Architecture
| # | Responsibility |
|---|---|
| A1 | Design how components work together: flow, storage layout, contracts between the apps |
| A2 | Decide changes to the shared contract (`domain-data`, `schemaVersion`, deploy order) |
| A3 | Record decisions and their alternatives (ADRs) |
| A4 | Keep the architecture docs describing what is built, and only that |
| A5 | Security and data protection by design: access, secrets, what leaves the EU, what is public |

### Code
| # | Responsibility |
|---|---|
| C1 | Implement a ticket in `apps/` and `packages/`, within its scope |
| C2 | Write and maintain unit tests; keep `check` and `test` green |
| C3 | Emit the log events the design calls for |
| C4 | Keep app and package READMEs current: run it, settings, code map, failure codes |
| C5 | Define and evolve coding standards |
| C6 | Maintenance: dependency upgrades, removing dead code |

### Quality
| # | Responsibility |
|---|---|
| Q1 | Define e2e test conventions: tooling, local setup, fixtures, fakes (HubSpot) |
| Q2 | Write and maintain e2e tests from tickets and the flow, failure paths included |
| Q3 | Run e2e for a change and report failures with steps to reproduce |
| Q4 | Review a diff: does what the ticket says (no more, no less), follows standards, respects the design, updates the docs it affects |
| Q5 | Review a diff for security: secrets, logged data, access, input validation |

### UX
| # | Responsibility |
|---|---|
| U1 | Decide the user experience of a feature: screens, flows, interactions, states, what the client sees on errors |
| U2 | Keep the design language: tokens, type, components, motion, icons |
| U3 | Copy: tone and wording of the Romanian text the client reads |
| U4 | Review changes that touch the UI, by running the app and looking at it |
| U5 | Write the UX part of a ticket that touches what the client sees |

### Infrastructure
| # | Responsibility |
|---|---|
| I1 | Maintain infra definitions: `infra/`, deploy scripts, deploy settings |
| I2 | Keep an inventory of the cloud resources: project, region, bucket, accounts and roles, scheduler, secrets, registry |
| I3 | Prepare cloud changes a ticket needs (commands + doc updates) |
| I4 | Apply cloud changes, create and rotate secrets (**you**) |
| I5 | CI (backlog) |

### Operations
| # | Responsibility |
|---|---|
| O1 | Keep the release procedure: deploy, candidates, checks after a deploy, rollback |
| O2 | Deploy and roll back (**you**) |
| O3 | Keep the runbook: pausing, reprocessing a submission, symptoms → cause → fix |
| O4 | Diagnose an incident: read logs and bucket state, find the cause, propose the fix |
| O5 | Run the fix in production (**you**) |

### Monitoring
| # | Responsibility |
|---|---|
| M1 | Keep the log event catalog: every event, severity, meaning |
| M2 | Define alert policies and where they notify (backlog: alerts) |
| M3 | Receive alerts and decide to act (**you**) |

### External systems
| # | Responsibility |
|---|---|
| E1 | HubSpot integration settings: portal, form, folder, field names |
| E2 | The HubSpot account itself: form fields, private app scopes, the contacts and files (**you**) |

### Docs
| # | Responsibility |
|---|---|
| D1 | Keep `CLAUDE.md` and `README.md` true: what the system is, where things are, commands |
| D2 | Keep docs consistent with each other, one owner per doc, no duplicated content |

---

## 2. Agents

Six agents. Every responsibility has an agent; the ones marked **you** have an agent that prepares them.

### architect-agent ("the elder")
P1, P2, P3 · A1, A2, A3, A4, A5 · C5 · D1, D2
- Decides the technical approach and writes tickets precise enough to build, test and review against.
- Takes the user experience as given by the ux-agent; raises it when it cannot be built as defined.
- Owns the architecture docs and ADRs; updates them once a ticket is built.
- Owns coding standards and the shared contract rules.
- Owns `CLAUDE.md` and `README.md`, and the consistency of all docs.
- Does not write app code.

### dev-agent
C1, C2, C3, C4, C6
- Implements one ticket; unit tests; log events as designed.
- Updates the READMEs of what it touches.
- Reports anything in the ticket that is unclear or contradicts the architecture instead of deciding
  it alone.

### qa-agent
Q1, Q2, Q3
- Owns the e2e conventions and the e2e tests; runs them and reports.
- Does not write unit tests or change app code.

### code-reviewer-agent
Q4, Q5
- One review pass per diff: scope against the ticket, standards, design (architecture + ADRs),
  docs updated, security.
- Reports findings; does not fix them.
- Whether the feature works is Q3, not this agent.

### ux-agent
U1, U2, U3, U4, U5
- Decides how the client experiences a feature, and writes that part of the ticket.
- Owns the design language and copy rules.
- Reviews UI changes visually.
- Does not decide the technical approach.

### infra-agent (infra + operations + monitoring)
I1, I2, I3, I5 · O1, O3, O4 · M1, M2 · E1
- Owns `infra/`, deploy scripts, the resource inventory, the release procedure, the runbook, the
  log event catalog and alert policies, the HubSpot settings.
- Diagnoses incidents from logs and bucket state.
- Never deploys or changes cloud resources: prepares the commands, you run them (I4, O2, O5).

> Operations is folded into infra because both work on the same files and the same cloud project.
> If incident work grows, it splits cleanly into an **ops-agent** (O3, O4, M1, M2), with docs to match (§3).

### Coverage check
| Area | Agent |
|---|---|
| P1–P3 | architect · P4 you |
| A1–A5 | architect |
| C1–C4, C6 | dev · C5 architect |
| Q1–Q3 | qa · Q4, Q5 reviewer |
| U1–U5 | ux |
| I1–I3, I5 | infra · I4 you |
| O1, O3, O4 | infra · O2, O5 you |
| M1, M2 | infra · M3 you |
| E1 | infra · E2 you |
| D1, D2 | architect |

---

## 3. Docs that fit this segmentation

Rules:
- **One owner per doc.** Others read it and propose changes to the owner.
- **A doc is split where its readers differ**, so each agent reads only what it needs.
- **Code never references docs**; docs point at code.
- **No content in two places.**

```
CLAUDE.md                          architect   every agent: what the system is, the map below, when to read what
README.md                          architect   humans + agents: repo layout, root commands, local end-to-end run

docs/
  backlog/<ticket>.md              architect   name, description (UX part by ux when the client sees it)
  architecture/
    overview.md                    architect   components, where each runs, the picture, how the apps stay in agreement
    flow.md                        architect   the flow step by step, including what happens on failure
    storage.md                     architect   the bucket layout, manifest.json, what the browser keeps
    security.md                    architect   access, secrets, public/private, data location
    adr/NNNN-<title>.md            architect   one decision each
  code/
    standards.md                   architect   coding standards: structure, naming, comments, errors, doc references
    testing.md                     qa          e2e: tooling, setup, fixtures, fakes, how to run
  ux/
    design.md                      ux          tokens, type, frame, components, motion, icons
    copy.md                        ux          tone and wording rules (today §8 of design.md)
  operations/
    infrastructure.md              infra       inventory of cloud resources, no setup steps
    deployment.md                  infra       release: deploy, settings, candidates, checks, rollback
    runbook.md                     infra       pausing, reprocessing, symptoms → cause → fix
    observability.md               infra       log event catalog, where logs are, alert policies

apps/<app>/README.md               dev         run it, settings, code map, implementation notes, failure codes
packages/<pkg>/README.md           dev         purpose, API, scripts, notes
```

### What each agent reads

| Doc | architect | dev | qa | reviewer | ux | infra |
|---|---|---|---|---|---|---|
| CLAUDE.md | ● | ● | ● | ● | ● | ● |
| README.md | **owns** | commands | commands | — | commands | commands |
| backlog/<ticket> | **owns** | the ticket | the ticket | the ticket | writes the UX part | the ticket |
| architecture/overview | **owns** | ● | ● | ● | — | ● |
| architecture/flow | **owns** | steps touched | ● | steps touched | the web steps | — |
| architecture/storage | **owns** | when touched | ● | when touched | — | ● |
| architecture/security | **owns** | when touched | — | ● | — | ● |
| architecture/adr | **owns** | when linked | — | when linked | — | when linked |
| code/standards | **owns** | ● | ● | ● | — | ● |
| code/testing | reads | — | **owns** | for test diffs | — | — |
| ux/design, ux/copy | reads | UI tickets | — | UI diffs | **owns** | — |
| operations/infrastructure | reads | — | — | infra diffs | — | **owns** |
| operations/deployment | — | — | — | infra diffs | — | **owns** |
| operations/runbook | — | — | — | — | — | **owns** |
| operations/observability | reads | when adding events | — | when adding events | — | **owns** |
| app/package READMEs | reads | **owns** (touched) | run and settings | touched | web app | settings, failure codes |

"when linked": the ticket names the ADRs that apply, so nobody searches for them.

---

## 4. What we need to change

### Delete
- `docs/deploy-web-gcp.md`, `docs/deploy-worker-gcp.md`
- `docs/hubspot-forms-v3-auth.txt`
- `infra/gcs/lifecycle.json`

### Split `docs/arhitecture.md`
| Today | Goes to |
|---|---|
| header, §1 Overview (code, where it runs, picture), §4 How the apps stay in agreement | `architecture/overview.md` |
| §2 The flow (steps 1–13) | `architecture/flow.md` |
| §14 Retention | deleted |
| §3 What is stored where | `architecture/storage.md` |
| §5 Observability: event table | `operations/observability.md` (alert paragraph removed; `delivery_skipped` "not built yet" corrected) |
| §6 Security (retention bullet removed; "known gap" → ticket) | `architecture/security.md` |
| §7 Running it | deleted: duplicates README.md and deployment.md |
| §8 Features table | deleted: Built rows are described by the docs; Todo rows → tickets |

Alerts come out of the components table and the failure table as they move.

### Split `docs/deployment.md`
| Today | Goes to |
|---|---|
| At a glance, before you deploy, per app: deploy, settings, candidates, after a deploy (without alerts), rolling back, changing the address | `operations/deployment.md` |
| Pausing, re-running a submission, when something goes wrong, where to look | `operations/runbook.md` (scheduler rows no longer point at deleted guides) |

### Move
- `docs/design.md` → `ux/design.md`, its §8 Copy → `ux/copy.md`

### New
- `CLAUDE.md`
- `docs/code/standards.md`, starting with the two rules decided so far:
  - Code never references docs.
  - Comments say why the code behaves as it does because of how the system works, never how the
    decision was reached (that is an ADR).

  The rest of the standards come from the code as it is today.
- `docs/operations/infrastructure.md`: the inventory, taken from the GCP guides before they are
  deleted and from `infra/deploy/*.env`.
- `docs/code/testing.md`: not now. The qa-agent's first ticket creates it with the first e2e tests.
- `docs/architecture/adr/`: empty.

### Backlog tickets
| Ticket | From |
|---|---|
| `alerts.md`: web errors, site down, worker failures, `submission_waiting`, scheduler failing; from `infra/monitoring/` templates | out-of-sync docs |
| `consent-text-recorded.md` | architecture §8, web README gaps |
| `submission-token.md` | architecture §8 and §6, web README gaps |
| `browser-upload-failures-logged.md` (`/api/log`) | architecture §8 |
| `large-client-files.md` (qpdf, sharp) | architecture §8 |
| `custom-domain.md` | architecture §8 |
| `ci.md` | architecture §8 |
| `staging.md` | architecture §8 |
| `floorplan-caption-romanian.md` | web README gaps |
| `e2e-tests.md`: first suite + `code/testing.md` | this plan |
| `comments-to-standard.md`: sweep every comment against `standards.md` | this plan |

The web README's "emulator is not Google" note stays: it describes behaviour, not missing work.

### Content fixes elsewhere
| Where | What |
|---|---|
| `README.md` | docs tree; `infra/` line without lifecycle and alerts; "Keeping the apps in sync" → `architecture/overview.md` |
| `packages/domain-data/README.md` | versioning: the worker supports every `schemaVersion` it has seen |
| `apps/input-capture-web/README.md` | "Known gaps" → tickets |
| `apps/input-pdf-worker/README.md` | doc paths |
| `apps/input-pdf-worker/src/run.ts`, `server.ts`, `deliver/index.ts`, `deliver/hubspot.ts` | remove doc references; `submission_waiting` no longer "(an alert)"; "HubSpot comes later" |
| `scripts/deploy-web.sh`, `scripts/deploy-worker.sh` | remove doc references (header, scheduler warnings) |
| `infra/deploy/web.env`, `worker.env` | remove doc references |

Agent definitions (`.claude/agents/*.md`) come after this, once the docs they point at exist.

---

## 5. How work runs

### Who triggers agents

- **The main Claude Code session is the orchestrator.** You talk only to it. Subagents cannot start
  other subagents, so every handoff (ux → architect → dev → …) goes through the main session.
- **You start a flow with a command**: `/feature <what you want>` or `/quick <what you want>`. Each
  is a skill in `.claude/skills/`, and it tells the main session the steps, the gates and the loop
  limits.
- **The ticket file is the only durable handoff.** Reviewer findings, qa reports and infra notes are
  passed between steps in the orchestrator's prompts and end up in your summary. They are not
  stored.

### What each agent gets

Every agent starts with a clean context made of three layers:

| Layer | Where it comes from | Contents |
|---|---|---|
| Definition | `.claude/agents/<agent>.md` | Role, responsibilities, rules, **which docs to read** (the §3 table), tools allowed |
| Project | `CLAUDE.md` | What the system is, the map of the repo and docs (to verify: loaded automatically for subagents) |
| Task | The orchestrator's prompt | Ticket path, the step (build / fix findings / review), the previous step's output |

An agent reads its docs itself, so the prompt stays short and the doc list lives in one place.
Tools are restricted per agent:
- reviewer: read-only, plus `git diff`
- qa: can write `e2e/`, cannot edit `apps/` or `packages/`
- ux: browser tools to look at the running app
- infra: no `gcloud` or `deploy:*` commands that change anything

### Scenario 1: a change to the drawing feature (`/feature`)

Each flow starts with **routing**: the orchestrator decides which optional agents take part and
shows you that decision at the first gate, so you can overrule it.

| Agent | Takes part when | Decided |
|---|---|---|
| ux | the client sees something change: a screen, an interaction, a state, a message, copy | at the start, from your description |
| infra | the dev summary lists new log events, settings, secrets, infra changes or a contract change (deploy order) | after the build, from the dev summary |
| architect (close) | always, unless the ticket says no architecture doc is affected | after the build |
| dev, reviewer, qa | always | |

| # | Step | Agent | Gets | Produces |
|---|---|---|---|---|
| 1 | You describe the goal | you → orchestrator | | |
| 2 | Routing: does the client see a change? | orchestrator | your description | "ux: yes / no, because …" |
| 3 | *(ux)* Design the experience: looks at the running app, reads design.md and the flow steps involved, asks you questions through the orchestrator | ux | your description | UX part of a new ticket; `ux/design.md` changes if the design language changes |
| 4 | **Gate:** you approve the routing and, with ux, the experience | you | routing, UX part | |
| 5 | Technical approach: components, contract impact, ADR if a real choice was made, standards if a new convention | architect | ticket path (or your description, without ux) | the ticket's technical part (the whole ticket without ux); ADR / standards edits |
| 6 | **Gate:** you approve the ticket | you | the ticket | |
| 7 | Build, with unit tests, check and test green, READMEs updated | dev (in a worktree) | ticket path | diff + summary (files, new log events, settings, contract changes) |
| 8 | Code review | reviewer | ticket path, diff | findings, or "clean" |
| 9 | *(ux)* UX review of the running change | ux | ticket path, diff | findings, or "clean" |
| 10 | Findings → back to 7; at most 3 rounds, then the orchestrator stops and asks you | dev | the findings | |
| 11 | e2e: add or update tests for the ticket, run the suite | qa | ticket path, dev summary | report; failures → back to 7 |
| 12 | *(infra)* Operations: new log events → `observability.md`; new settings → `infra/deploy/*.env` + `deployment.md`; infra changes → commands for you; deploy order | infra | ticket path, dev summary | doc and infra edits, a deploy note |
| 13 | Close: update architecture docs to what was built, delete the ticket | architect | ticket path, diff | doc edits |
| 14 | **Gate:** you review the whole change, commit, deploy with the deploy note | you | orchestrator's summary | |

Steps 8 and 9 run in parallel, and so do 12 and 13. *(ux)* and *(infra)* steps run only when routed in.

For the drawing feature: ux is routed in (the client draws). The architect has to look past the web
app: the drawing goes into the manifest and into the worker's PDF.

**What was missing from your version:**
- **The approval gates (4, 6, 14).** Otherwise agents build on a vision you have not confirmed.
- **Routing (2).** ux and infra only run when there is something for them to do.
- **The UX review of the result (9).** ux designs it and should also see it.
- **Closing (13).** The architect writes the docs at planning time as intent, but they describe what
  is built, so they are updated after the build. Deleting the ticket happens here too.
- **Loop limits (10).** Without them, dev ↔ reviewer can go round forever.
- **Infra gets more than logs:** new settings, secrets and the deploy order all come out of the dev
  summary.

### Scenario 2: a small bug or enhancement (`/quick`)

No ticket and no subagents for planning. The request is the ticket.

| # | Step | Who |
|---|---|---|
| 1 | You describe it | you |
| 2 | Check it is quick: no new log events, no settings, no contract change, no new screen or interaction, no architecture doc affected. If any fails → stop and suggest `/feature` | orchestrator |
| 3 | Make the change with unit tests; check and test green; READMEs if touched | orchestrator itself, or one dev-agent |
| 4 | One review pass against your request and `standards.md` | reviewer |
| 5 | Fix findings, then you commit | orchestrator, you |

Cost: one subagent (the reviewer), or two if dev runs as an agent. qa only runs the existing e2e suite
if the change touches the flow; ux only if something visible changes and you ask.

---

## 6. Open questions

1. **Ops inside infra-agent**, or a separate ops-agent from the start?
2. **Split `architecture.md` into four docs**, or keep one file that agents read by section? The
   split is what gives each agent exactly its context. The cost is four files to keep consistent
   instead of one.
3. **`ux/copy.md` now**, or leave copy inside `design.md` until there is more of it?
4. **Where reports live**: only in the orchestrator session (lost if the session ends mid-flow), or
   appended to the ticket so a flow can resume?
5. **`/quick` builds in the main session or in one dev-agent?** The main session is faster and
   already has your context. A dev-agent keeps the main session's context small and guarantees
   the standards are read.
6. **Is the PDF a UX surface?** The client never sees it, but your team reads it. If a PDF layout
   change should route to ux, ux also owns the PDF's design rules (today in the worker's
   `src/build/theme.ts` and README).
