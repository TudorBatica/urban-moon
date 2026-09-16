import type { Bucket } from '@urban-moon/bucket';
import { SubmissionIdSchema } from '@urban-moon/domain-data/schema';
import { OUTPUT, failedMarker, outputPrefix, pendingMarker, submissionPrefix } from './objects';

export interface ReprocessResult {
	/** failed/<id> was there and is gone */
	hadFailed: boolean;
	/** the marker was already in pending/ */
	wasPending: boolean;
	/** objects deleted under output/ (--force) */
	clearedOutput: number;
	/** output/done.json is still there, so the next run skips the submission */
	done: boolean;
}

/** Puts a committed submission back in pending/. `force` deletes output/ first, so
 *  a finished submission is built and delivered again. */
export async function reprocess(bucket: Bucket, id: string, { force = false } = {}): Promise<ReprocessResult> {
	if (!SubmissionIdSchema.safeParse(id).success) throw new Error(`not a submission id: ${id}`);
	if (!(await bucket.metadata(`${submissionPrefix(id)}manifest.json`)))
		throw new Error(`${submissionPrefix(id)}manifest.json does not exist: nothing was committed under this id`);

	let clearedOutput = 0;
	if (force) for (const o of await bucket.list(outputPrefix(id))) if (await bucket.delete(o.name)) clearedOutput++;

	const wasPending = (await bucket.metadata(pendingMarker(id))) !== null;
	await bucket.put(pendingMarker(id), '', 'application/octet-stream');
	const hadFailed = await bucket.delete(failedMarker(id));
	const done = (await bucket.metadata(outputPrefix(id) + OUTPUT.done)) !== null;
	return { hadFailed, wasPending, clearedOutput, done };
}
