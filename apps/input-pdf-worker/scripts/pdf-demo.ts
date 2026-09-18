/* Build PDFs from the shared fixture submissions (or from given folders) and print what came out.
   npm run pdf:demo                         → every fixture in @urban-moon/domain-data
   npm run pdf:demo -- --dir <folder> ...   → those submission folders */

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { BuildError, buildSubmissionPdf } from '../src/generation';
import { diskSubmission } from '../src/storage/disk';

const { values } = parseArgs({
	options: { dir: { type: 'string', multiple: true }, out: { type: 'string', default: 'out/demo' } }
});

const fixtures = resolve(
	dirname(fileURLToPath(import.meta.resolve('@urban-moon/domain-data/fixtures/submissions/full/manifest.json'))),
	'..'
);
const dirs = values.dir?.length
	? values.dir.map((d) => resolve(d))
	: (await readdir(fixtures, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => resolve(fixtures, e.name));

const outDir = resolve(values.out);
await mkdir(outDir, { recursive: true });

let failed = 0;
for (const dir of dirs) {
	const name = basename(dir);
	try {
		const { bytes, report } = await buildSubmissionPdf(diskSubmission(dir));
		const out = resolve(outDir, `${name}.pdf`);
		await writeFile(out, bytes);
		console.log(`✓ ${name}: ${report.pages} pages · ${(report.bytes / 1024).toFixed(0)} KB · ${report.durationMs} ms`);
		console.log(`  sections: ${report.sections.map((s) => `${s.title} p.${s.page}`).join(' · ')}`);
		for (const d of report.clientDocuments)
			console.log(`  client PDF: ${d.originalName} → ${d.degraded ? 'attached (unreadable)' : `${d.pages} pages stamped`} from p.${d.firstPage}`);
		if (report.warnings.length) console.log(`  warnings: ${report.warnings.join('; ')}`);
		console.log(`  → ${out}`);
	} catch (err) {
		failed++;
		const code = err instanceof BuildError ? err.code : 'unexpected';
		console.error(`✗ ${name}: ${code} — ${err instanceof Error ? err.message : String(err)}`);
		if (err instanceof BuildError && err.detail) console.error(JSON.stringify(err.detail, null, 2));
	}
}
process.exitCode = failed ? 1 : 0;
