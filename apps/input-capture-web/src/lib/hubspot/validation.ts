/**
 * Server-side upload validation. Mirrors `ACCEPTED_TYPES` / `MAX_FILE_BYTES` from
 * `$lib/state/plans.svelte.ts` (owned by the plans agent) on purpose: the browser check there is
 * a convenience, this one is the gate. Keep the two lists in step if the contract changes.
 */

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_MIME = [
	'application/pdf',
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif',
	'application/acad',
	'image/vnd.dwg',
	'image/x-dwg',
	'application/dwg',
	'image/vnd.dxf',
	'application/dxf',
	'application/json' // the drawing snapshot uploaded alongside its PNG
];

export const ACCEPTED_EXT = [
	'.pdf',
	'.jpg',
	'.jpeg',
	'.png',
	'.webp',
	'.heic',
	'.heif',
	'.dwg',
	'.dxf',
	'.json'
];

export function extensionOf(name: string): string {
	const i = name.lastIndexOf('.');
	return i < 0 ? '' : name.slice(i).toLowerCase();
}

export function isAcceptedFile(name: string, type: string): boolean {
	const mime = (type || '').toLowerCase().split(';')[0].trim();
	if (mime && ACCEPTED_MIME.includes(mime)) return true;
	return ACCEPTED_EXT.includes(extensionOf(name || ''));
}

/** Filesystem-safe folder segment built from the email; never empty. */
export function slug(value: string): string {
	const s = (value || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
	return s || 'anonim';
}

/** Strip path separators and control characters from a client-supplied file name. */
export function safeFileName(name: string): string {
	const base = (name || '').split(/[\\/]/).pop() ?? '';
	const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
	return cleaned.slice(0, 120) || 'fisier';
}
