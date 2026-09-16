import { bucketFromEnv, type Bucket } from '@urban-moon/bucket';
import { skipDelivery, type Deliver } from './deliver';
import { hubspotDeliver } from './deliver/hubspot';
import { DEFAULT_BUDGET_MS, DEFAULT_CONCURRENCY } from './run';

/* The worker's settings, from the environment:
   GCS_BUCKET, STORAGE_EMULATOR_HOST, GCS_ACCESS_TOKEN   the bucket (see @urban-moon/bucket)
   PORT                  default 3001; Cloud Run sets 8080
   PDF_CONCURRENCY       PDFs built at the same time, default 2
   RUN_BUDGET_SECONDS    a run starts no submission after this long, default 1200
   WORKER_TICK           seconds; the server calls its own run on this interval (local only)
   APP_VERSION           recorded in the outputs, default "dev"
   HUBSPOT_TOKEN         the private app token, from Secret Manager. Unset: the PDF is built and
                         stored, and delivery records that nothing was sent (local development).
   HUBSPOT_PORTAL_ID     the account the form belongs to
   HUBSPOT_FORM_ID       the form the client's PDF is submitted to
   HUBSPOT_FOLDER_PATH   File Manager folder for the uploads, default /app-input-capture */

export const DEFAULT_HUBSPOT_FOLDER = '/app-input-capture';

export interface WorkerConfig {
	bucket: Bucket;
	port: number;
	concurrency: number;
	budgetMs: number;
	tickSeconds: number | null;
	version: string;
	deliver: Deliver;
	/** false when HUBSPOT_TOKEN is unset: built PDFs stay in the bucket */
	delivers: boolean;
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
	const token = env.HUBSPOT_TOKEN?.trim();
	const required = (key: string): string => {
		const value = env[key]?.trim();
		if (!value) throw new Error(`${key} is needed when HUBSPOT_TOKEN is set`);
		return value;
	};
	return {
		bucket,
		port: int('PORT', 3001, 1),
		concurrency: int('PDF_CONCURRENCY', DEFAULT_CONCURRENCY, 1),
		budgetMs: int('RUN_BUDGET_SECONDS', DEFAULT_BUDGET_MS / 1000, 1) * 1000,
		tickSeconds: env.WORKER_TICK?.trim() ? int('WORKER_TICK', 60, 1) : null,
		version: env.APP_VERSION?.trim() || 'dev',
		delivers: Boolean(token),
		deliver: token
			? hubspotDeliver({
					token,
					portalId: required('HUBSPOT_PORTAL_ID'),
					formId: required('HUBSPOT_FORM_ID'),
					folderPath: env.HUBSPOT_FOLDER_PATH?.trim() || DEFAULT_HUBSPOT_FOLDER
				})
			: skipDelivery
	};
}
