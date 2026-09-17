/* Where the worker's objects live in the bucket. */

export const PENDING_PREFIX = 'pending/';
export const FAILED_PREFIX = 'failed/';

/** empty; written by the web app at commit, deleted by the worker when the submission is finished */
export const pendingMarker = (id: string): string => `${PENDING_PREFIX}${id}`;
/** JSON {stage, code, message, at}: the worker gave up on the submission */
export const failedMarker = (id: string): string => `${FAILED_PREFIX}${id}`;

export const submissionPrefix = (id: string): string => `submissions/${id}/`;
export const outputPrefix = (id: string): string => `${submissionPrefix(id)}output/`;

export const OUTPUT = {
	/** the deliverable */
	pdf: 'raspunsuri.pdf',
	/** the build report: pages, sections, client documents, warnings, timings */
	build: 'build.json',
	/** what delivery did; HubSpot ids once it is built */
	delivery: 'delivery.json',
	/** written last: the submission is finished */
	done: 'done.json'
} as const;
