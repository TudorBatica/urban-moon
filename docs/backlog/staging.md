# Staging project

## Description

Every deploy goes straight to production, and the only pre-traffic check is the web app's
`--candidate` revision, which shares the production bucket (the worker has no candidate at all). Add
a separate Google Cloud project with its own bucket, services, scheduler job and a HubSpot test
setup, deployed with the existing scripts through `DEPLOY_ENV` and its own settings files.
