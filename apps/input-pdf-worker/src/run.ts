import { BucketError, type Bucket } from '@urban-moon/bucket';
import { SubmissionIdSchema } from '@urban-moon/domain-data/schema';
import { BuildError, buildSubmissionPdf } from './build';
import { skipDelivery, type Deliver } from './deliver';
import { log as stdoutLog, type Logger } from './log';
import { OUTPUT, PENDING_PREFIX, failedMarker, outputPrefix, pendingMarker } from './objects';
import { retrying, type RetryOptions } from './retry';
import { bucketSubmission } from './storage/bucket';

/* One pass through pending/ (docs/arhitecture.md). For each waiting submission, oldest marker first, a few
   at a time: build the PDF, store it and its report under output/, deliver, write done.json and
   remove the marker. A submission that fails gets failed/<id> with the reason instead. */

export const DEFAULT_CONCURRENCY = 2;
export const DEFAULT_BUDGET_MS = 20 * 60_000;
export const WAITING_AFTER_MS = 15 * 60_000;

export interface RunOptions {
	bucket: Bucket;
	deliver?: Deliver;
	/** PDFs built at the same time. Each holds its client files and the PDF in memory. */
	concurrency?: number;
	/** no submission is started after this long; the next run continues with the rest */
	budgetMs?: number;
	/** a marker older than this is logged as submission_waiting (an alert) */
	waitingAfterMs?: number;
	/** recorded in build.json, done.json and failed/<id> */
	version?: string;
	log?: Logger;
	now?: () => number;
	retry?: RetryOptions;
}

export interface RunSummary {
	processed: number;
	failed: number;
	skipped: number;
	/** still pending: not started before the time budget ran out */
	left: number;
	durationMs: number;
}

type Outcome = 'processed' | 'failed' | 'skipped';

interface Marker {
	id: string;
	createdAt: number;
}

const json = (value: unknown): string => JSON.stringify(value, null, 2);

export async function runOnce(opts: RunOptions): Promise<RunSummary> {
	const {
		deliver = skipDelivery,
		concurrency = DEFAULT_CONCURRENCY,
		budgetMs = DEFAULT_BUDGET_MS,
		waitingAfterMs = WAITING_AFTER_MS,
		version = 'dev',
		log = stdoutLog,
		now = Date.now
	} = opts;
	const bucket = retrying(opts.bucket, opts.retry);
	const iso = () => new Date(now()).toISOString();
	const started = now();

	const markers: Marker[] = [];
	for (const o of await bucket.list(PENDING_PREFIX)) {
		const id = o.name.slice(PENDING_PREFIX.length);
		if (!SubmissionIdSchema.safeParse(id).success) {
			log('WARNING', 'marker_ignored', { object: o.name });
			continue;
		}
		markers.push({ id, createdAt: Date.parse(o.timeCreated) || started });
	}
	markers.sort((a, b) => a.createdAt - b.createdAt);

	const counts: Record<Outcome, number> = { processed: 0, failed: 0, skipped: 0 };
	let next = 0;
	const lane = async (): Promise<void> => {
		while (next < markers.length && now() - started < budgetMs) counts[await processOne(markers[next++])]++;
	};
	await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), markers.length) }, lane));

	const summary: RunSummary = { ...counts, left: markers.length - next, durationMs: now() - started };
	if (markers.length) log('INFO', 'run_summary', { ...summary, concurrency });
	return summary;

	async function processOne({ id, createdAt }: Marker): Promise<Outcome> {
		const out = (name: string) => outputPrefix(id) + name;
		let stage: 'build' | 'deliver' = 'build';
		try {
			if (await bucket.metadata(out(OUTPUT.done))) {
				await bucket.delete(pendingMarker(id));
				log('INFO', 'job_skipped_done', { submissionId: id });
				return 'skipped';
			}
			const ageMs = now() - createdAt;
			if (ageMs > waitingAfterMs) log('ERROR', 'submission_waiting', { submissionId: id, ageMin: Math.floor(ageMs / 60_000) });
			log('INFO', 'job_started', { submissionId: id, markerAgeSec: Math.round(ageMs / 1000) });
			const jobStarted = now();

			const { bytes, manifest, report } = await buildSubmissionPdf(bucketSubmission(bucket, id));
			await bucket.put(out(OUTPUT.pdf), bytes, 'application/pdf');
			await bucket.put(out(OUTPUT.build), json({ version, builtAt: iso(), ...report }), 'application/json');
			log('NOTICE', 'pdf_generated', {
				submissionId: id,
				pages: report.pages,
				bytes: report.bytes,
				photos: report.photos,
				clientDocuments: report.clientDocuments.length,
				durationMs: report.durationMs
			});
			if (report.warnings.length) log('WARNING', 'pdf_degraded', { submissionId: id, warnings: report.warnings });

			stage = 'deliver';
			const delivery = await deliver({ bucket, submissionId: id, manifest, pdf: bytes, log });
			await bucket.put(out(OUTPUT.delivery), json(delivery), 'application/json');

			await bucket.put(out(OUTPUT.done), json({ finishedAt: iso(), version, pages: report.pages, bytes: report.bytes }), 'application/json');
			await bucket.delete(pendingMarker(id));
			/* left over from an earlier attempt that was re-run */
			await bucket.delete(failedMarker(id));
			log('NOTICE', 'submission_delivered', {
				submissionId: id,
				durationMs: now() - jobStarted,
				totalMs: now() - Date.parse(manifest.committedAt)
			});
			return 'processed';
		} catch (err) {
			const code = err instanceof BuildError ? err.code : err instanceof BucketError ? 'bucket_error' : 'unexpected';
			const message = err instanceof Error ? err.message : String(err);
			const detail = err instanceof BuildError ? err.detail : undefined;
			log('ERROR', stage === 'build' ? 'pdf_failed' : 'delivery_failed', {
				submissionId: id,
				stage,
				code,
				message,
				detail,
				stack: err instanceof Error ? err.stack : undefined
			});
			try {
				await bucket.put(failedMarker(id), json({ stage, code, message, detail, at: iso(), version }), 'application/json');
				await bucket.delete(pendingMarker(id));
			} catch (markErr) {
				/* The pending marker stays, so the next run tries the submission again. */
				log('ERROR', 'failed_marker_not_written', {
					submissionId: id,
					message: markErr instanceof Error ? markErr.message : String(markErr)
				});
			}
			return 'failed';
		}
	}
}
