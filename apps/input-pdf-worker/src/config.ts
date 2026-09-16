import { bucketFromEnv, type Bucket } from '@urban-moon/bucket';
import { DEFAULT_BUDGET_MS, DEFAULT_CONCURRENCY } from './run';

/* The worker's settings, from the environment:
   GCS_BUCKET, STORAGE_EMULATOR_HOST, GCS_ACCESS_TOKEN   the bucket (see @urban-moon/bucket)
   PORT                  default 3001; Cloud Run sets 8080
   PDF_CONCURRENCY       PDFs built at the same time, default 2
   RUN_BUDGET_SECONDS    a run starts no submission after this long, default 1200
   WORKER_TICK           seconds; the server calls its own run on this interval (local only)
   APP_VERSION           recorded in the outputs, default "dev" */

export interface WorkerConfig {
	bucket: Bucket;
	port: number;
	concurrency: number;
	budgetMs: number;
	tickSeconds: number | null;
	version: string;
}

export function configFromEnv(env: Record<string, string | undefined> = process.env): WorkerConfig {
	const bucket = bucketFromEnv(env);
	if (!bucket) throw new Error('GCS_BUCKET is not set');
	const int = (key: string, fallback: number, min: number): number => {
		const raw = env[key]?.trim();
		if (!raw) return fallback;
		const n = Number(raw);
		if (!Number.isInteger(n) || n < min) throw new Error(`${key} must be a whole number of at least ${min}, not "${raw}"`);
		return n;
	};
	return {
		bucket,
		port: int('PORT', 3001, 1),
		concurrency: int('PDF_CONCURRENCY', DEFAULT_CONCURRENCY, 1),
		budgetMs: int('RUN_BUDGET_SECONDS', DEFAULT_BUDGET_MS / 1000, 1) * 1000,
		tickSeconds: env.WORKER_TICK?.trim() ? int('WORKER_TICK', 60, 1) : null,
		version: env.APP_VERSION?.trim() || 'dev'
	};
}
