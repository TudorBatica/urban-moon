import { degrees, type PDFDocument, type PDFImage, type PDFPage } from 'pdf-lib';

/* Client images go into the PDF as they are (JPEG bytes are not re-encoded). Phones often store
   a photo sideways with an EXIF "rotate" tag that a PDF ignores, so the tag is read here and the
   image is rotated when it is placed. */

/** The EXIF orientation of a JPEG (1–8); 1 when there is none. */
export function jpegOrientation(b: Uint8Array): number {
	if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
	let i = 2;
	while (i + 4 <= b.length) {
		if (b[i] !== 0xff) return 1;
		const marker = b[i + 1];
		if (marker === 0xda || marker === 0xd9) return 1; // image data starts: no EXIF before it
		const len = (b[i + 2] << 8) | b[i + 3];
		const isExif =
			marker === 0xe1 &&
			len >= 16 &&
			b[i + 4] === 0x45 && // E
			b[i + 5] === 0x78 && // x
			b[i + 6] === 0x69 && // i
			b[i + 7] === 0x66 && // f
			b[i + 8] === 0 &&
			b[i + 9] === 0;
		if (isExif) {
			const t = i + 10;
			const le = b[t] === 0x49 && b[t + 1] === 0x49;
			const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
			const u32 = (o: number) =>
				(le
					? b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)
					: (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
			const ifd = t + u32(t + 4);
			if (ifd + 2 > b.length) return 1;
			const count = u16(ifd);
			for (let k = 0; k < count; k++) {
				const e = ifd + 2 + k * 12;
				if (e + 12 > b.length) break;
				if (u16(e) === 0x0112) {
					const v = u16(e + 8);
					return v >= 1 && v <= 8 ? v : 1;
				}
			}
			return 1;
		}
		i += 2 + len;
	}
	return 1;
}

/** Quarter turns clockwise for an EXIF orientation (mirrored variants use the nearest turn). */
function quarterTurns(orientation: number): 0 | 1 | 2 | 3 {
	switch (orientation) {
		case 3:
		case 4:
			return 2;
		case 5:
		case 6:
			return 1;
		case 7:
		case 8:
			return 3;
		default:
			return 0;
	}
}

export interface PlacedImage {
	image: PDFImage;
	orientation: number;
}

export async function embedClientImage(
	doc: PDFDocument,
	contentType: string,
	bytes: Uint8Array
): Promise<PlacedImage> {
	if (contentType === 'image/png') return { image: await doc.embedPng(bytes), orientation: 1 };
	return { image: await doc.embedJpg(bytes), orientation: jpegOrientation(bytes) };
}

/** The image's size as it should be seen, after its orientation. */
export function displaySize({ image, orientation }: PlacedImage): { width: number; height: number } {
	return quarterTurns(orientation) % 2 === 1
		? { width: image.height, height: image.width }
		: { width: image.width, height: image.height };
}

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Draw the image as large as fits in `box`, centred, the right way up. Returns where it landed. */
export function drawContained(page: PDFPage, placed: PlacedImage, box: Box): Box {
	const shown = displaySize(placed);
	const scale = Math.min(box.width / shown.width, box.height / shown.height);
	const dw = shown.width * scale;
	const dh = shown.height * scale;
	const bx = box.x + (box.width - dw) / 2;
	const by = box.y + (box.height - dh) / 2;
	const turns = quarterTurns(placed.orientation);
	/* pdf-lib rotates counter-clockwise around (x, y); the drawn size is the image's own. */
	const w = placed.image.width * scale;
	const h = placed.image.height * scale;
	if (turns === 0) page.drawImage(placed.image, { x: bx, y: by, width: w, height: h });
	else if (turns === 1) page.drawImage(placed.image, { x: bx, y: by + dh, width: w, height: h, rotate: degrees(-90) });
	else if (turns === 2) page.drawImage(placed.image, { x: bx + dw, y: by + dh, width: w, height: h, rotate: degrees(180) });
	else page.drawImage(placed.image, { x: bx + dw, y: by, width: w, height: h, rotate: degrees(90) });
	return { x: bx, y: by, width: dw, height: dh };
}
