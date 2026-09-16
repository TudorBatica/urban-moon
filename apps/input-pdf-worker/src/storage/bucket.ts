import type { Bucket } from '@urban-moon/bucket';
import { submissionPrefix } from '../objects';
import type { SubmissionSource } from './source';

/** A committed submission in the bucket: submissions/<id>/manifest.json and its uploads/. */
export function bucketSubmission(bucket: Bucket, id: string): SubmissionSource {
	const prefix = submissionPrefix(id);
	return {
		label: `gs://${bucket.name}/${prefix}`,
		async manifest() {
			return JSON.parse(new TextDecoder().decode(await bucket.read(`${prefix}manifest.json`)));
		},
		async read(object) {
			/* The manifest schema already restricts object paths; this is the second lock. */
			if (!/^uploads\/[A-Za-z0-9-]+\.(jpg|png|pdf)$/.test(object)) throw new Error(`object outside the submission: ${object}`);
			return bucket.read(prefix + object);
		}
	};
}
