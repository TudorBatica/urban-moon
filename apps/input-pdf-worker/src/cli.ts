/* Build the PDF for one submission folder on disk.
   npm run pdf:build -w @urban-moon/input-pdf-worker -- --dir <submission folder> [--out <file.pdf>] */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { BuildError, buildSubmissionPdf } from './generation';
import { log } from './log';
import { diskSubmission } from './storage/disk';

const { values } = parseArgs({ options: { dir: { type: 'string' }, out: { type: 'string' } } });

if (!values.dir) {
	console.error('usage: pdf:build -- --dir <submission folder> [--out <file.pdf>]');
	process.exit(2);
}

const dir = resolve(values.dir);
try {
	const { bytes, report } = await buildSubmissionPdf(diskSubmission(dir));
	const out = resolve(values.out ?? `${dir}/output/raspunsuri.pdf`);
	await mkdir(dirname(out), { recursive: true });
	await writeFile(out, bytes);
	log(report.warnings.length ? 'WARNING' : 'INFO', 'pdf_generated', { ...report, out });
} catch (err) {
	const code = err instanceof BuildError ? err.code : 'unexpected';
	log('ERROR', 'pdf_failed', {
		code,
		error: err instanceof Error ? err.message : String(err),
		detail: err instanceof BuildError ? err.detail : undefined,
		dir
	});
	process.exitCode = 1;
}
