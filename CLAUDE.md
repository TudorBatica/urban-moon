# Urban Moon: input capture

A client of the Urban Moon interior architecture studio fills in a questionnaire about their home,
uploads or draws floor plans and adds photos. The files go straight from the browser to a Cloud
Storage bucket. A worker turns each submission into one PDF for the architect and delivers it to
HubSpot as a form submission on the client's contact. Everything the client sees is Romanian. There
is no database: the objects in the bucket are the state.

The map of the repo and its docs: `docs/README.md`.

## Rules for every agent

- Never deploy, and never run a command that changes cloud resources or the HubSpot account.
  Prepare the commands; a person runs them.
- Never commit unless asked.
- Never point a local `.env` at the real HubSpot account. Tests, unit or end-to-end, run only
  against the local system: the emulator, the local apps and the HubSpot fake.
- Code never references docs (`docs/code/standards.md`).
