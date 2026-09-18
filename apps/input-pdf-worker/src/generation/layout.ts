import type { PDFDocument, PDFFont, PDFPage, RGB } from 'pdf-lib';
import type { Fonts } from './fonts';
import { A4, COLOR, CONTENT_WIDTH, MARGIN } from './theme';

export interface TextStyle {
	font: 'serif' | 'sans';
	size: number;
	color?: RGB;
	/** multiple of the font size */
	lineHeight?: number;
}

const lineHeightOf = (s: TextStyle): number => s.size * (s.lineHeight ?? 1.35);

/** Break text into lines that fit `maxWidth`; words longer than a line are split. */
export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
	const out: string[] = [];
	for (const para of text.split('\n')) {
		const words = para.split(/\s+/).filter(Boolean);
		if (!words.length) {
			out.push('');
			continue;
		}
		let line = '';
		for (let word of words) {
			while (font.widthOfTextAtSize(word, size) > maxWidth && word.length > 1) {
				let n = word.length - 1;
				while (n > 1 && font.widthOfTextAtSize(word.slice(0, n), size) > maxWidth) n--;
				if (line) out.push(line);
				line = '';
				out.push(word.slice(0, n));
				word = word.slice(n);
			}
			const next = line ? `${line} ${word}` : word;
			if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next;
			else {
				out.push(line);
				line = word;
			}
		}
		if (line) out.push(line);
	}
	return out;
}

/** Shorten a single line to `maxWidth`, ending in "…". */
export function fitLine(text: string, font: PDFFont, size: number, maxWidth: number): string {
	if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
	let n = text.length;
	while (n > 1 && font.widthOfTextAtSize(text.slice(0, n) + '…', size) > maxWidth) n--;
	return text.slice(0, n).trimEnd() + '…';
}

/** A cursor that flows text down pages, starting a new page when the current one is full. */
export class Writer {
	page!: PDFPage;
	/** top of the next line, in PDF points from the bottom */
	y = 0;

	constructor(
		readonly doc: PDFDocument,
		readonly fonts: Fonts
	) {}

	font(style: TextStyle): PDFFont {
		return this.fonts[style.font];
	}

	addPage(): PDFPage {
		this.page = this.doc.addPage([A4.width, A4.height]);
		this.y = A4.height - MARGIN.top;
		return this.page;
	}

	/** Start a new page unless `height` still fits on this one. */
	ensure(height: number): void {
		if (!this.page || this.y - height < MARGIN.bottom) this.addPage();
	}

	measure(text: string, style: TextStyle, width = CONTENT_WIDTH): number {
		return wrap(text, this.font(style), style.size, width).length * lineHeightOf(style);
	}

	text(text: string, style: TextStyle, opts: { indent?: number; width?: number; after?: number } = {}): void {
		const indent = opts.indent ?? 0;
		const width = opts.width ?? CONTENT_WIDTH - indent;
		const font = this.font(style);
		const lh = lineHeightOf(style);
		for (const line of wrap(text, font, style.size, width)) {
			this.ensure(lh);
			if (line)
				this.page.drawText(line, {
					x: MARGIN.left + indent,
					y: this.y - style.size,
					size: style.size,
					font,
					color: style.color ?? COLOR.ink
				});
			this.y -= lh;
		}
		this.y -= opts.after ?? 0;
	}

	rule(opts: { color?: RGB; thickness?: number; after?: number } = {}): void {
		this.ensure(2);
		this.page.drawLine({
			start: { x: MARGIN.left, y: this.y },
			end: { x: MARGIN.left + CONTENT_WIDTH, y: this.y },
			thickness: opts.thickness ?? 0.5,
			color: opts.color ?? COLOR.hair
		});
		this.y -= opts.after ?? 8;
	}

	space(height: number): void {
		this.y -= height;
	}
}

/** Draw wrapped text at a fixed position; returns the height used. */
export function drawWrapped(
	page: PDFPage,
	fonts: Fonts,
	text: string,
	at: { x: number; top: number; width: number },
	style: TextStyle
): number {
	const font = fonts[style.font];
	const lh = lineHeightOf(style);
	const lines = wrap(text, font, style.size, at.width);
	lines.forEach((line, i) =>
		page.drawText(line, {
			x: at.x,
			y: at.top - style.size - i * lh,
			size: style.size,
			font,
			color: style.color ?? COLOR.ink
		})
	);
	return lines.length * lh;
}
