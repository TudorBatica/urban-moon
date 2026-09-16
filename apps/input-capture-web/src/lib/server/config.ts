import { env } from '$env/dynamic/private';
import { bucketFromEnv as fromEnv, type Bucket } from '@urban-moon/bucket';

/* The bucket from GCS_BUCKET, STORAGE_EMULATOR_HOST and GCS_ACCESS_TOKEN (read by
   @urban-moon/bucket). Unset GCS_BUCKET means uploads are off (503). */
export const bucketFromEnv = (): Bucket | null => fromEnv(env);

export const appVersion = (): string => env.APP_VERSION?.trim() || 'dev';
