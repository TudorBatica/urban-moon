/** Where a committed submission is read from: a folder on disk now, the bucket later. */
export interface SubmissionSource {
	/** for logs: the folder path or the bucket prefix */
	readonly label: string;
	/** the parsed manifest.json, not yet validated */
	manifest(): Promise<unknown>;
	/** an object inside the submission, e.g. "uploads/b1e2.pdf" */
	read(object: string): Promise<Uint8Array>;
}
