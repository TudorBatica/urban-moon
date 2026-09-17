# Report browser-side upload failures to the server

## Description

When a chunk upload or a commit fails in the browser after its retries, the server never hears of
it: the client sees a failed row, and the logs show nothing. Add an endpoint (`/api/log`) the send
panel reports these failures to, so they appear in the web app's logs with the submission id.
