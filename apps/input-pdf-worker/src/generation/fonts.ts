import { readFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';

export interface Fonts {
	serif: PDFFont;
	sans: PDFFont;
}

const FONTS = new URL('../../fonts/', import.meta.url);

/* The standard PDF fonts cannot encode ă, ș or ț, so the page's own fonts are embedded, subset
   to the glyphs actually used. */
export async function embedFonts(doc: PDFDocument): Promise<Fonts> {
	doc.registerFontkit(fontkit);
	const [serif, sans] = await Promise.all([
		readFile(new URL('Newsreader.ttf', FONTS)),
		readFile(new URL('Figtree.ttf', FONTS))
	]);
	return {
		serif: await doc.embedFont(serif, { subset: true }),
		sans: await doc.embedFont(sans, { subset: true })
	};
}
