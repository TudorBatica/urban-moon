/* What a client may upload, in one place for the browser, the app server and the worker. */

export const MB = 1024 * 1024;

/** Only formats a PDF can take natively: JPEG and PNG images, and PDF documents. */
export const ACCEPTED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

export type AcceptedContentType = (typeof ACCEPTED_CONTENT_TYPES)[number];

export const ACCEPTED_EXTENSIONS: Record<AcceptedContentType, readonly string[]> = {
	'image/jpeg': ['.jpg', '.jpeg'],
	'image/png': ['.png'],
	'application/pdf': ['.pdf']
};

/** The extension a stored object gets, decided by the sniffed type, never by the client's name. */
export const OBJECT_EXTENSION: Record<AcceptedContentType, 'jpg' | 'png' | 'pdf'> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'application/pdf': 'pdf'
};

export const MAX_IMAGE_BYTES = 10 * MB;
export const MAX_PDF_BYTES = 25 * MB;
/** Everything one submission may carry, files and drawing together. */
export const MAX_SUBMISSION_BYTES = 400 * MB;
/** Per group: the photos of the space, or one room's furniture. */
export const MAX_PHOTOS_PER_GROUP = 10;

export const maxBytesFor = (type: AcceptedContentType): number =>
	type === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;

/** Two plan files per picked room, never fewer than two. */
export const maxPlanFiles = (roomCount: number): number => Math.max(2, roomCount * 2);

/** The real type, from the first bytes of a file. The client's claimed type is never trusted. */
export function sniffContentType(head: Uint8Array): AcceptedContentType | null {
	const at = (i: number, bytes: number[]) => bytes.every((b, j) => head[i + j] === b);
	if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
	if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
	if (at(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // %PDF-
	return null;
}

/** Accepted by mime type or, when the browser gives none, by extension. */
export function acceptedTypeOf(name: string, mime: string): AcceptedContentType | null {
	const m = (mime || '').split(';')[0].trim().toLowerCase();
	const byMime = (ACCEPTED_CONTENT_TYPES as readonly string[]).includes(m)
		? (m as AcceptedContentType)
		: m === 'image/jpg'
			? 'image/jpeg'
			: null;
	if (byMime) return byMime;
	const dot = name.lastIndexOf('.');
	const ext = dot < 0 ? '' : name.slice(dot).toLowerCase();
	for (const t of ACCEPTED_CONTENT_TYPES) if (ACCEPTED_EXTENSIONS[t].includes(ext)) return t;
	return null;
}
