# @urban-moon/bucket

The Cloud Storage client both apps use: plain `fetch` against the JSON API, so the same code talks
to Google (a service account's token from the metadata server, or one passed in) and to the local
`fake-gcs-server` emulator. No SDK, no keys on disk.

```ts
import { bucketFromEnv, createBucket, isTransientBucketError, BucketError } from '@urban-moon/bucket';
import { memoryBucket } from '@urban-moon/bucket/memory';   // tests
```

| Method | Used for |
|---|---|
| `startResumableUpload({object, contentType, size, origin})` | the browser's direct uploads; returns the session URI |
| `metadata(object)` | does it exist, how big, which generation |
| `readHead(object, bytes)` | the first bytes, to sniff a file's real type at commit |
| `read(object)` | the whole object (404 raises a `BucketError` with `status: 404`) |
| `list(prefix)` | every object under a prefix, following pages |
| `createOnly(object, body, type)` | write once; `false` when it already existed |
| `put(object, body, type)` | write or replace; text or bytes |
| `delete(object)` | `false` when there was nothing to delete |

`bucketFromEnv(env)` reads `GCS_BUCKET`, `STORAGE_EMULATOR_HOST` and `GCS_ACCESS_TOKEN` and caches
the client per settings; it returns `null` when `GCS_BUCKET` is unset, which is how the web app
knows that sending is off. `isTransientBucketError(err)` is true for the network, 408, 429 and 5xx —
what the worker retries.

```bash
npm run check -w @urban-moon/bucket    # tsc
npm test -w @urban-moon/bucket         # request shapes against a fake fetch, and the memory bucket
```

## Notes

- **`memoryBucket()`** is the in-memory implementation used by both apps' tests: the same rules
  (404s, create-only, delete's boolean), plus a `fault` hook to make one call fail, e.g. a 503 on
  the first read.
- **The emulator differs from Google** in three ways the apps work around: a status query finalises
  an upload, `ifGenerationMatch=0` is ignored (so the commit checks for the manifest first), and
  `Range` is not exposed to the browser.
- **No streaming:** `read` and `put` hold the whole object in memory. Fine for the manifests,
  photos and PDFs in this system; revisit before very large files.
