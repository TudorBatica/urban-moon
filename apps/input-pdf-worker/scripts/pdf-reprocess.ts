/* Put a submission back in pending/: the next run builds it again.
   npm run pdf:reprocess -- <submissionId> [--force]
   --force deletes output/ first, so a finished submission is rebuilt (and, once HubSpot delivery
   exists, delivered again). Uses the bucket settings from apps/input-pdf-worker/.env: the emulator
   locally; for Google, GCS_BUCKET plus GCS_ACCESS_TOKEN=$(gcloud auth print-access-token) and no
   STORAGE_EMULATOR_HOST. */

import { parseArgs } from 'node:util';
import { bucketFromEnv } from '@urban-moon/bucket';
import { reprocess } from '../src/reprocess';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: { force: { type: 'boolean', default: false } }
});

const id = positionals[0];
if (!id) {
	console.error('usage: npm run pdf:reprocess -- <submissionId> [--force]');
	process.exit(2);
}
const bucket = bucketFromEnv(process.env);
if (!bucket) {
	console.error('GCS_BUCKET is not set (cp apps/input-pdf-worker/.env.example apps/input-pdf-worker/.env)');
	process.exit(2);
}

try {
	const r = await reprocess(bucket, id, { force: values.force });
	if (r.clearedOutput) console.log(`  deleted ${r.clearedOutput} objects under output/`);
	if (r.hadFailed) console.log(`  removed failed/${id}`);
	console.log(`✓ pending/${id}${r.wasPending ? ' (it already was)' : ''}: the next run picks it up`);
	if (r.done) console.log('  note: output/done.json exists, so the run will only remove the marker; --force rebuilds it');
} catch (err) {
	console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
	process.exitCode = 1;
}
