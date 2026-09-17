# Custom domain for the questionnaire

## Description

The questionnaire is served on its `run.app` URL. Serve it on the studio's own domain (DNS stays on
Cloudflare), with managed TLS: a Cloud Run domain mapping or a load balancer. Then set
`WEB_ORIGIN` in `infra/deploy/web.env` and add the domain to the bucket's CORS origins.
