import { PDFDocument, type PDFPage } from 'pdf-lib';
import { parseManifest, type Manifest } from '@urban-moon/domain-data/schema';
import type { SubmissionSource } from '../storage/source';
import { qaChapters } from './answers';
import { embedFonts } from './fonts';
import { Writer } from './layout';
import { drawAnswers } from './sections/answers';
import { drawContents, type SectionEntry } from './sections/contents';
import { drawCover } from './sections/cover';
import { drawDrawing } from './sections/drawing';
import { drawPhotoGroup, photoGroups } from './sections/photos';
import { appendClientPdf, appendImagePlan, type ClientDocument, type PlansContext } from './sections/plans';
import { COLOR, MARGIN } from './theme';

export type BuildErrorCode = 'manifest_unreadable' | 'manifest_unsupported' | 'manifest_invalid' | 'object_unreadable';

/** A failure that stops the build. `code` is what the logs and alerts key on. */
export class BuildError extends Error {
	constructor(
		readonly code: BuildErrorCode,
		message: string,
		readonly detail?: unknown
	) {
		super(message);
		this.name = 'BuildError';
	}
}

export interface BuildReport {
	submissionId: string;
	pages: number;
	bytes: number;
	durationMs: number;
	sections: SectionEntry[];
	clientDocuments: ClientDocument[];
	photos: number;
	/** problems that did not stop the build (unreadable client files, …) */
	warnings: string[];
}

export interface BuildResult {
	bytes: Uint8Array;
	manifest: Manifest;
	report: BuildReport;
}

async function readManifest(source: SubmissionSource): Promise<Manifest> {
	let json: unknown;
	try {
		json = await source.manifest();
	} catch (err) {
		throw new BuildError('manifest_unreadable', `cannot read manifest.json from ${source.label}`, String(err));
	}
	const parsed = parseManifest(json);
	if (parsed.ok) return parsed.manifest;
	if (parsed.unsupported)
		throw new BuildError('manifest_unsupported', `unsupported manifest schemaVersion ${String(parsed.schemaVersion)}`);
	throw new BuildError('manifest_invalid', 'manifest.json does not match the schema', parsed.issues);
}

/** Build the submission PDF: cover, contents, answers, drawn plan, uploaded plans, photos. */
export async function buildSubmissionPdf(source: SubmissionSource): Promise<BuildResult> {
	const started = performance.now();
	const manifest = await readManifest(source);
	const read = async (object: string): Promise<Uint8Array> => {
		try {
			return await source.read(object);
		} catch (err) {
			throw new BuildError('object_unreadable', `cannot read ${object}`, String(err));
		}
	};

	const doc = await PDFDocument.create();
	doc.setTitle(`Răspunsuri — ${manifest.client.name}`);
	doc.setAuthor('Urban Moon');
	doc.setSubject(`Chestionar ${manifest.submissionId}`);
	doc.setCreator('@urban-moon/input-pdf-worker');
	doc.setLanguage('ro-RO');
	doc.setCreationDate(new Date(manifest.committedAt));

	const w = new Writer(doc, await embedFonts(doc));
	const sections: SectionEntry[] = [];
	const section = (title: string) => sections.push({ title, page: doc.getPageCount() + 1 });
	const ctx: PlansContext = { w, stamped: new Set<PDFPage>(), warnings: [] };

	drawCover(w, manifest);
	const contentsPage = w.addPage();

	section('Răspunsuri');
	drawAnswers(w, qaChapters(manifest.answers));

	if (manifest.drawing) {
		section('Planul desenat');
		await drawDrawing(w, manifest.drawing, await read(manifest.drawing.pngObject));
	}

	const clientDocuments: ClientDocument[] = [];
	const plans = manifest.files.filter((f) => f.kind === 'plan');
	if (plans.length) {
		section('Planuri încărcate');
		for (const f of plans) {
			const bytes = await read(f.object);
			if (f.contentType === 'application/pdf') clientDocuments.push(await appendClientPdf(ctx, f, bytes));
			else await appendImagePlan(ctx, f, bytes);
		}
	}

	const groups = photoGroups(manifest.files);
	for (const g of groups) {
		section(g.title);
		await drawPhotoGroup(w, g, (f) => read(f.object), ctx.warnings);
	}

	drawContents(contentsPage, w.fonts, sections, clientDocuments);

	/* Footer on our own pages; client pages carry their stamp instead. */
	const pages = doc.getPages();
	pages.forEach((page, i) => {
		if (ctx.stamped.has(page) || i === 0) return;
		const label = `pagina ${i + 1} din ${pages.length}`;
		const size = 7.5;
		page.drawText(`Urban Moon · ${manifest.client.name}`, { x: MARGIN.left, y: 32, size, font: w.fonts.sans, color: COLOR.grey });
		page.drawText(label, {
			x: page.getWidth() - MARGIN.right - w.fonts.sans.widthOfTextAtSize(label, size),
			y: 32,
			size,
			font: w.fonts.sans,
			color: COLOR.grey
		});
	});

	const bytes = await doc.save({ useObjectStreams: true });
	return {
		bytes,
		manifest,
		report: {
			submissionId: manifest.submissionId,
			pages: pages.length,
			bytes: bytes.length,
			durationMs: Math.round(performance.now() - started),
			sections,
			clientDocuments,
			photos: groups.reduce((n, g) => n + g.files.length, 0),
			warnings: ctx.warnings
		}
	};
}
