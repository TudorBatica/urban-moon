import { env } from '$env/dynamic/private';
import { createBucket, metadataServerToken, type Bucket } from './bucket';

/* The bucket, from the environment:
   - GCS_BUCKET                 the bucket name; unset means uploads are off (503)
   - STORAGE_EMULATOR_HOST      e.g. http://localhost:4443 — the local emulator, no auth
   - GCS_ACCESS_TOKEN           optional, for trying a real bucket from a laptop
                                (`gcloud auth print-access-token`); otherwise the Cloud Run
                                service account's token from the metadata server */

let cached: { key: string; bucket: Bucket } | null = null;

export function bucketFromEnv(): Bucket | null {
	const name = env.GCS_BUCKET?.trim();
	if (!name) return null;
	const emulator = env.STORAGE_EMULATOR_HOST?.trim() ?? '';
	const staticToken = env.GCS_ACCESS_TOKEN?.trim() ?? '';
	const key = `${name}|${emulator}|${staticToken}`;
	if (cached?.key === key) return cached.bucket;

	const bucket = emulator
		? createBucket({ bucket: name, baseUrl: /^https?:\/\//.test(emulator) ? emulator : `http://${emulator}` })
		: createBucket({
				bucket: name,
				baseUrl: 'https://storage.googleapis.com',
				accessToken: staticToken ? async () => staticToken : metadataServerToken()
			});
	cached = { key, bucket };
	return bucket;
}

export const appVersion = (): string => env.APP_VERSION?.trim() || 'dev';
