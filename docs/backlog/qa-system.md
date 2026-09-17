# Design the QA system

## Description

There are no end-to-end tests: each package has unit tests, and a whole submission (questionnaire →
uploads → commit → worker → PDF → HubSpot) is only ever checked by hand. There is no qa-agent yet
either, because what it would do is undefined.

Brainstorm and decide the QA system, then turn it into tickets:

- What e2e tests cover: which journeys through the flow, which failure paths.
- How they run: tooling (browser automation for the questionnaire), the local setup (emulator, both
  apps), fixtures, and a fake HubSpot so no test touches the real account.
- When they run: per ticket, before a deploy, in CI.
- The qa-agent: its responsibilities, what it reads, what it may change, where it fits in the
  feature flow.
- `docs/code/testing.md`: the conventions the qa-agent will own.
