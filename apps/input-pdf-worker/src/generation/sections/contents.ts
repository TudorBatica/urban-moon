import type { PDFPage } from 'pdf-lib';
import type { Fonts } from '../fonts';
import { fitLine } from '../layout';
import { A4, COLOR, CONTENT_WIDTH, MARGIN } from '../theme';
import type { ClientDocument } from './plans';

export interface SectionEntry {
	title: string;
	/** 1-based */
	page: number;
}

/** Fill the page reserved after the cover, once every section's page is known. */
export function drawContents(page: PDFPage, fonts: Fonts, sections: SectionEntry[], documents: ClientDocument[]): void {
	let y = A4.height - MARGIN.top;
	page.drawText('Cuprins', { x: MARGIN.left, y: y - 24, size: 24, font: fonts.serif, color: COLOR.ink });
	y -= 60;

	const row = (label: string, pageNo: number, indent: number, size: number, color = COLOR.ink) => {
		const num = String(pageNo);
		const numWidth = fonts.sans.widthOfTextAtSize(num, size);
		page.drawText(fitLine(label, fonts.sans, size, CONTENT_WIDTH - indent - 40), { x: MARGIN.left + indent, y: y - size, size, font: fonts.sans, color });
		page.drawText(num, { x: MARGIN.left + CONTENT_WIDTH - numWidth, y: y - size, size, font: fonts.sans, color });
		y -= size + 9;
		page.drawLine({ start: { x: MARGIN.left + indent, y: y + 3 }, end: { x: MARGIN.left + CONTENT_WIDTH, y: y + 3 }, thickness: 0.4, color: COLOR.hair });
		y -= 5;
	};

	for (const s of sections) {
		row(s.title, s.page, 0, 11);
		if (s.title === 'Planuri încărcate')
			for (const d of documents)
				row(
					`Document încărcat de client: ${d.originalName}${d.degraded ? ' — atașat, nu a putut fi inclus' : ` — ${d.pages} ${d.pages === 1 ? 'pagină' : 'pagini'}`}`,
					d.firstPage,
					14,
					9,
					COLOR.soft
				);
	}
}
