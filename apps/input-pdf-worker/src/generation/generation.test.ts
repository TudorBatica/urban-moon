import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { diskSubmission } from '../storage/disk';
import { qaChapters } from './answers';
import { BuildError, buildSubmissionPdf } from './index';
import { jpegOrientation } from './images';
import { Writer } from './layout';

const FIXTURES = resolve(
	dirname(fileURLToPath(import.meta.resolve('@urban-moon/domain-data/fixtures/submissions/full/manifest.json'))),
	'..'
);
const fixture = (name: string) => join(FIXTURES, name);

/** A copy of a fixture submission we can break. */
async function scratchCopy(name: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'pdf-worker-'));
	await cp(fixture(name), dir, { recursive: true });
	return dir;
}

describe('buildSubmissionPdf — fixtures', () => {
	it('builds the minimal submission into a PDF that opens again', async () => {
		const { bytes, report } = await buildSubmissionPdf(diskSubmission(fixture('minimal')));
		const back = await PDFDocument.load(bytes);
		expect(back.getPageCount()).toBe(report.pages);
		expect(back.getTitle()).toBe('Răspunsuri — Ion Ionescu');
		expect(report.sections.map((s) => s.title)).toEqual(['Răspunsuri', 'Planuri încărcate', 'Fotografii ale spațiului']);
		expect(report.warnings).toEqual([]);
	});

	it('builds the full submission with every section, the client PDF stamped page by page', async () => {
		const { bytes, report } = await buildSubmissionPdf(diskSubmission(fixture('full')));
		expect((await PDFDocument.load(bytes)).getPageCount()).toBe(report.pages);
		expect(report.sections.map((s) => s.title)).toEqual([
			'Răspunsuri',
			'Planul desenat',
			'Planuri încărcate',
			'Fotografii ale spațiului',
			'Mobilier păstrat — Bucătărie',
			'Mobilier păstrat — Dormitor'
		]);
		expect(report.clientDocuments).toEqual([
			expect.objectContaining({ originalName: 'plan-bucătărie.pdf', pages: 3, degraded: false })
		]);
		expect(report.photos).toBe(5);
		expect(report.warnings).toEqual([]);
	});

	it('keeps the page numbers in the report in step with the document', async () => {
		const { report } = await buildSubmissionPdf(diskSubmission(fixture('full')));
		const pages = report.sections.map((s) => s.page);
		expect(pages).toEqual([...pages].sort((a, b) => a - b));
		expect(pages[0]).toBe(3); // cover, contents, then the answers
		expect(Math.max(...pages)).toBeLessThanOrEqual(report.pages);
	});
});

/** Every string the build writes into the document, in order. */
async function textOf(dir: string): Promise<string[]> {
	const lines: string[] = [];
	const write = Writer.prototype.text;
	const spy = vi
		.spyOn(Writer.prototype, 'text')
		.mockImplementation(function (this: Writer, ...args: Parameters<Writer['text']>) {
			lines.push(args[0]);
			write.apply(this, args);
		});
	try {
		await buildSubmissionPdf(diskSubmission(dir));
	} finally {
		spy.mockRestore();
	}
	return lines;
}

describe('the drawn plan — landmarks', () => {
	it('lists them under "Repere", by wall and along the wall, with the count in the summary', async () => {
		const lines = await textOf(fixture('full'));
		expect(lines.some((l) => l.includes('Repere: 2'))).toBe(true);
		expect(lines).toContain('Repere');
		const marks = lines.filter((l) => l.startsWith('Calorifer') || l.startsWith('Centrală'));
		expect(marks).toEqual([
			'Calorifer: peretele 1 (N), pe partea camerei, la 150 cm și 220 cm de elementele vecine',
			'Centrală: peretele 2 (E), pe partea cealaltă a peretelui, la 20 cm și 50 cm de elementele vecine'
		]);
	});

	it('prints a gap of zero as "lipit"', async () => {
		const dir = await scratchCopy('full');
		const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
		manifest.drawing.room.landmarks = [
			{ id: 'lm1', kind: 'gas', wallId: 'w0', offsetFromStartCm: 0, face: 'in', gapBeforeCm: 0, gapAfterCm: 370 }
		];
		await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
		expect(await textOf(dir)).toContain(
			'Gaz: peretele 1 (N), pe partea camerei, la lipit și 370 cm de elementele vecine'
		);
	});

	it('says nothing about landmarks when the snapshot has none', async () => {
		const dir = await scratchCopy('full');
		const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
		delete manifest.drawing.room.landmarks;
		await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
		expect((await textOf(dir)).some((l) => l.includes('Repere'))).toBe(false);
	});
});

describe('buildSubmissionPdf — failures', () => {
	it('refuses a manifest from an unknown schema version', async () => {
		const dir = await scratchCopy('minimal');
		const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
		await writeFile(join(dir, 'manifest.json'), JSON.stringify({ ...manifest, schemaVersion: 99 }));
		await expect(buildSubmissionPdf(diskSubmission(dir))).rejects.toMatchObject({ code: 'manifest_unsupported' });
	});

	it('refuses an invalid manifest, with the schema issues attached', async () => {
		const dir = await scratchCopy('minimal');
		await writeFile(join(dir, 'manifest.json'), JSON.stringify({ schemaVersion: 1, client: {} }));
		const err = await buildSubmissionPdf(diskSubmission(dir)).catch((e) => e);
		expect(err).toBeInstanceOf(BuildError);
		expect(err.code).toBe('manifest_invalid');
		expect(Array.isArray(err.detail)).toBe(true);
	});

	it('fails with object_unreadable when a declared file is missing', async () => {
		const dir = await scratchCopy('minimal');
		await writeFile(join(dir, 'uploads/photo-spatiu-1.jpg'), '');
		const { rm } = await import('node:fs/promises');
		await rm(join(dir, 'uploads/photo-spatiu-1.jpg'));
		await expect(buildSubmissionPdf(diskSubmission(dir))).rejects.toMatchObject({ code: 'object_unreadable' });
	});

	it('attaches an unreadable client PDF instead of failing the submission', async () => {
		const dir = await scratchCopy('minimal');
		await writeFile(join(dir, 'uploads/plan-bucatarie.pdf'), '%PDF-1.7\nnot really a pdf');
		const { bytes, report } = await buildSubmissionPdf(diskSubmission(dir));
		expect(report.clientDocuments[0]).toMatchObject({ degraded: true, pages: 0 });
		expect(report.warnings).toEqual(['client_pdf_unreadable: plan-bucatarie (fișierul nu a putut fi citit)']);
		expect((await PDFDocument.load(bytes)).getPageCount()).toBe(report.pages);
	});
});

describe('answers', () => {
	it('lists only the questions the client could see, with option labels', async () => {
		const manifest = JSON.parse(await readFile(join(fixture('minimal'), 'manifest.json'), 'utf8'));
		const chapters = qaChapters(manifest.answers);
		expect(chapters.map((c) => c.label)).toEqual(['Despre tine', 'Planuri', 'Locuința', 'Bucătărie']);
		const kitchen = chapters.find((c) => c.id === 'bucatarie')!;
		expect(kitchen.rows[0]).toEqual({
			screenId: 'k1',
			question: 'Cum arată o cină obișnuită la tine acasă, într-o zi din săptămână?',
			answer: ['Gătim']
		});
		const planuri = chapters.find((c) => c.id === 'planuri')!;
		expect(planuri.rows.map((r) => r.answer)).toEqual([['Nu vreau să modific spațiul']]);
	});
});

describe('EXIF orientation', () => {
	it('reads the rotate tag phones write, and 1 when there is none', async () => {
		expect(jpegOrientation(await readFile(join(fixture('full'), 'uploads/photo-spatiu-2.jpg')))).toBe(6);
		expect(jpegOrientation(await readFile(join(fixture('full'), 'uploads/photo-spatiu-1.jpg')))).toBe(1);
		expect(jpegOrientation(new Uint8Array([0x89, 0x50]))).toBe(1);
	});
});

describe('disk storage', () => {
	it('refuses to read outside the submission folder', async () => {
		await expect(diskSubmission(fixture('minimal')).read('../full/manifest.json')).rejects.toThrow(/outside/);
	});
});
