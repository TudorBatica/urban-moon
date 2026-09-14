import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { SubmissionSource } from './source';

/** A submission laid out as in the bucket: manifest.json plus uploads/ in one folder. */
export function diskSubmission(dir: string): SubmissionSource {
	const root = resolve(dir);

	/* The manifest schema already restricts object paths; this is the second lock. */
	const inside = (object: string): string => {
		const path = resolve(root, object);
		if (!path.startsWith(root + sep)) throw new Error(`object outside the submission folder: ${object}`);
		return path;
	};

	return {
		label: root,
		async manifest() {
			return JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
		},
		async read(object) {
			return new Uint8Array(await readFile(inside(object)));
		}
	};
}
