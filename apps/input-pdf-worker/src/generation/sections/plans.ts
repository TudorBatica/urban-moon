import { PDFDocument, type PDFPage } from 'pdf-lib';
import type { ManifestFile } from '@urban-moon/domain-data/schema';
import { drawContained, embedClientImage } from '../images';
import { drawWrapped, fitLine, type Writer } from '../layout';
import { stampBottomEdge } from '../stamp';
import { A4, COLOR, CONTENT_WIDTH, MARGIN, TYPE } from '../theme';

export interface ClientDocument {
	fileId: string;
	originalName: string;
	/** 1-based page numbers in the output, separator page first */
	firstPage: number;
	/** pages copied from the client's file (0 when it could not be read) */
	pages: number;
	degraded: boolean;
}

export interface PlansContext {
	w: Writer;
	/** pages that carry a client stamp instead of our footer */
	stamped: Set<PDFPage>;
	warnings: string[];
}

function separator(ctx: PlansContext, f: ManifestFile, lines: string[]): void {
	const { w } = ctx;
	w.addPage();
	w.y = A4.height - 260;
	w.text('Document încărcat de client', TYPE.small, { after: 8 });
	w.text(f.originalName, { font: 'serif', size: 22 }, { after: 6 });
	for (const l of lines) w.text(l, TYPE.body, { after: 2 });
	w.space(18);
	w.rule({ color: COLOR.ink, thickness: 0.7 });
}

/** A client PDF: a separator page, then its pages copied unchanged, each stamped on its bottom edge. */
export async function appendClientPdf(ctx: PlansContext, f: ManifestFile, bytes: Uint8Array): Promise<ClientDocument> {
	const { w } = ctx;
	const firstPage = w.doc.getPageCount() + 1;

	let src: PDFDocument | null = null;
	let reason = '';
	try {
		src = await PDFDocument.load(bytes, { updateMetadata: false });
		if (src.isEncrypted) reason = 'fișierul este protejat cu parolă';
		else if (src.getPageCount() === 0) reason = 'fișierul nu are pagini';
	} catch {
		reason = 'fișierul nu a putut fi citit';
	}

	if (!src || reason) {
		/* Degrade instead of failing the whole submission: the original travels inside the PDF. */
		separator(ctx, f, [
			`Paginile nu au putut fi incluse: ${reason}.`,
			'Fișierul original este atașat acestui PDF (panoul de atașamente al cititorului).'
		]);
		await w.doc.attach(bytes, f.originalName, {
			mimeType: 'application/pdf',
			description: `Document încărcat de client (${reason})`
		});
		ctx.warnings.push(`client_pdf_unreadable: ${f.fileId} (${reason})`);
		return { fileId: f.fileId, originalName: f.originalName, firstPage, pages: 0, degraded: true };
	}

	const count = src.getPageCount();
	separator(ctx, f, [
		`${count} ${count === 1 ? 'pagină' : 'pagini'}, copiate neschimbat din fișierul clientului.`,
		'Fiecare pagină este marcată pe marginea de jos.'
	]);
	const copied = await w.doc.copyPages(src, src.getPageIndices());
	copied.forEach((page, i) => {
		w.doc.addPage(page);
		stampBottomEdge(page, w.fonts.sans, `Document încărcat de client · ${f.originalName} · pagina ${i + 1} din ${count}`);
		ctx.stamped.add(page);
	});
	return { fileId: f.fileId, originalName: f.originalName, firstPage, pages: count, degraded: false };
}

/** An image plan on its own page, marked as the client's file. */
export async function appendImagePlan(ctx: PlansContext, f: ManifestFile, bytes: Uint8Array): Promise<void> {
	const { w } = ctx;
	const page = w.addPage();
	w.text('Plan încărcat de client', TYPE.small, { after: 6 });
	w.text(fitLine(f.originalName, w.fonts.serif, 18, CONTENT_WIDTH), { font: 'serif', size: 18 }, { after: 14 });

	const box = { x: MARGIN.left, y: MARGIN.bottom, width: CONTENT_WIDTH, height: w.y - MARGIN.bottom };
	try {
		drawContained(page, await embedClientImage(w.doc, f.contentType, bytes), box);
	} catch {
		ctx.warnings.push(`client_image_unreadable: ${f.fileId}`);
		drawWrapped(page, w.fonts, 'Imaginea nu a putut fi citită.', { x: box.x, top: box.y + box.height, width: box.width }, TYPE.body);
	}
	stampBottomEdge(page, w.fonts.sans, `Fișier încărcat de client · ${f.originalName}`);
	ctx.stamped.add(page);
}
