import { degrees, type PDFFont, type PDFPage } from 'pdf-lib';
import { fitLine } from './layout';
import { COLOR } from './theme';

const STRIP = 15;
const SIZE = 7;

/**
 * A white strip with a line of text along the page's visual bottom edge, whatever the page's
 * /Rotate and CropBox — so every page copied from a client PDF says where it came from.
 */
export function stampBottomEdge(page: PDFPage, font: PDFFont, text: string): void {
	const cb = page.getCropBox();
	const rotation = ((page.getRotation().angle % 360) + 360) % 360;
	const along = rotation === 90 || rotation === 270 ? cb.height : cb.width;
	const line = fitLine(text, font, SIZE, along - 16);
	const strip = { color: COLOR.white, opacity: 0.94, borderColor: COLOR.hair, borderWidth: 0.4 };
	const ink = { size: SIZE, font, color: COLOR.ink };

	/* The visual bottom is the user-space bottom, right, top or left edge for 0/90/180/270°;
	   the text runs left to right as the reader sees it. */
	switch (rotation) {
		case 90:
			page.drawRectangle({ x: cb.x + cb.width - STRIP, y: cb.y, width: STRIP, height: cb.height, ...strip });
			page.drawText(line, { x: cb.x + cb.width - 5, y: cb.y + 8, rotate: degrees(90), ...ink });
			break;
		case 180:
			page.drawRectangle({ x: cb.x, y: cb.y + cb.height - STRIP, width: cb.width, height: STRIP, ...strip });
			page.drawText(line, { x: cb.x + cb.width - 8, y: cb.y + cb.height - 5, rotate: degrees(180), ...ink });
			break;
		case 270:
			page.drawRectangle({ x: cb.x, y: cb.y, width: STRIP, height: cb.height, ...strip });
			page.drawText(line, { x: cb.x + 5, y: cb.y + cb.height - 8, rotate: degrees(-90), ...ink });
			break;
		default:
			page.drawRectangle({ x: cb.x, y: cb.y, width: cb.width, height: STRIP, ...strip });
			page.drawText(line, { x: cb.x + 8, y: cb.y + 5, ...ink });
	}
}
